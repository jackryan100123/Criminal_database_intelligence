from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session
from jose import JWTError
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import create_access_token, decode_access_token, new_jti, now_utc, utc_seconds, verify_password, hash_password
from app.db import SessionLocal, engine
from app.es import ElasticsearchProfilesStore
from app.models import Base, Profile, ProfileLink, TokenBlacklist, User
from app.schemas import (
    ImageUploadRequest,
    LinkRequest,
    LoginRequest,
    MessageResponse,
    ProfileCreate,
    ProfileOut,
    ProfileUpdate,
    ProfileKind,
    RegisterRequest,
    SearchRequest,
    SearchResponse,
    TokenResponse,
    LinkedProfileOut,
)
from app.services import (
    index_profile_from_db,
    delete_profile_from_es,
    search_and_expand,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")
es_store = ElasticsearchProfilesStore()


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _exp_to_naive_utc(exp: Any) -> datetime:
    # jose typically returns exp as a numeric timestamp.
    if isinstance(exp, (int, float)):
        return datetime.utcfromtimestamp(exp)
    if isinstance(exp, datetime):
        # Store as naive UTC for consistency with our SQLAlchemy defaults.
        if exp.tzinfo is not None:
            return exp.astimezone(timezone.utc).replace(tzinfo=None)
        return exp
    raise ValueError("Invalid exp")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    jti = payload.get("jti")
    subject = payload.get("sub")
    if not jti or not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    # Check blacklist
    now = datetime.utcnow()
    blacklisted = db.execute(
        select(TokenBlacklist).where(TokenBlacklist.jti == str(jti), TokenBlacklist.expires_at > now)
    ).scalars().first()
    if blacklisted:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    user_id = int(subject)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


app = FastAPI(title="Criminal Database Intelligence System (Phase 1)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    es_store.ensure_index()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/register", response_model=MessageResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> MessageResponse:
    existing = db.execute(select(User).where(User.username == body.username)).scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    return MessageResponse(message="User successfully created.")


@app.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.execute(select(User).where(User.username == body.username)).scalars().first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    jti = new_jti()
    token = create_access_token(subject=str(user.id), jti=jti)
    return TokenResponse(access_token=token)


@app.post("/logout", response_model=MessageResponse)
def logout(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> MessageResponse:
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    jti = payload.get("jti")
    exp = payload.get("exp")
    if not jti or not exp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    expires_at = _exp_to_naive_utc(exp)
    black = TokenBlacklist(jti=str(jti), expires_at=expires_at)
    db.add(black)
    db.commit()
    return MessageResponse(message="Successfully logged out.")


@app.post("/profile")
def create_profile(
    body: ProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if body.kind == "criminal" and not body.name:
        raise HTTPException(status_code=400, detail="name is required")
    profile = Profile(
        kind=body.kind,
        name=body.name,
        image=body.image,
        social_media=body.social_media,
        organization=body.organization,
        fir_number=body.fir_number,
        details=body.details,
        custom_attributes=body.custom_attributes,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    index_profile_from_db(db=db, store=es_store, profile_id=profile.id)

    return {"message": "Profile successfully created.", "profile_id": profile.id}


@app.put("/profile/{profile_id}")
def update_profile(
    profile_id: str,
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    profile = db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            # API uses `image`, DB uses `image` directly too.
            setattr(profile, field, value)

    db.add(profile)
    db.commit()
    db.refresh(profile)

    index_profile_from_db(db=db, store=es_store, profile_id=profile_id)

    return {"message": "Profile successfully updated."}


@app.get("/profile/{profile_id}", response_model=ProfileOut)
def get_profile(
    profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProfileOut:
    profile = db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    return ProfileOut(
        profile_id=profile.id,
        kind=profile.kind,
        name=profile.name,
        image=profile.image,
        social_media=profile.social_media,
        organization=profile.organization,
        fir_number=profile.fir_number,
        details=profile.details,
        created_at=profile.created_at.isoformat(),
    )


@app.delete("/profile/{profile_id}", response_model=MessageResponse)
def delete_profile(
    profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    profile = db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    affected_criminal_ids: set[str] = set()
    if profile.kind == "criminal":
        affected_criminal_ids.add(profile_id)
    else:
        links = db.execute(
            select(ProfileLink.criminal_profile_id).where(ProfileLink.linked_profile_id == profile_id)
        ).scalars().all()
        affected_criminal_ids.update([l for l in links])

    db.delete(profile)
    db.commit()

    delete_profile_from_es(es_store, profile_id)
    for criminal_id in affected_criminal_ids:
        index_profile_from_db(db=db, store=es_store, profile_id=criminal_id)

    return MessageResponse(message="Profile successfully deleted.")


@app.post("/profile/{criminal_profile_id}/link", response_model=MessageResponse)
def link_profile(
    criminal_profile_id: str,
    body: LinkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    criminal = db.get(Profile, criminal_profile_id)
    if not criminal or criminal.kind != "criminal":
        raise HTTPException(status_code=400, detail="criminal_profile_id must be a criminal profile")

    linked = db.get(Profile, body.follower_id)
    if not linked:
        raise HTTPException(status_code=404, detail="follower_id profile not found")

    existing = db.execute(
        select(ProfileLink).where(
            ProfileLink.criminal_profile_id == criminal_profile_id,
            ProfileLink.linked_profile_id == body.follower_id,
            ProfileLink.role == body.role,
        )
    ).scalars().first()

    if existing:
        return MessageResponse(message="Successfully linked supporter/follower.")

    link = ProfileLink(
        criminal_profile_id=criminal_profile_id,
        linked_profile_id=body.follower_id,
        role=body.role,
    )
    db.add(link)
    db.commit()

    index_profile_from_db(db=db, store=es_store, profile_id=criminal_profile_id)

    return MessageResponse(message="Successfully linked supporter/follower.")


@app.get("/profile/{criminal_profile_id}/followers")
def get_followers(
    criminal_profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, list[LinkedProfileOut]]:
    criminal = db.get(Profile, criminal_profile_id)
    if not criminal or criminal.kind != "criminal":
        raise HTTPException(status_code=400, detail="criminal_profile_id must be a criminal profile")

    links = db.execute(
        select(ProfileLink).where(
            ProfileLink.criminal_profile_id == criminal_profile_id,
            ProfileLink.role == "follower",
        )
    ).scalars().all()

    out: list[LinkedProfileOut] = []
    for link in links:
        linked = db.get(Profile, link.linked_profile_id)
        if linked:
            out.append(
                LinkedProfileOut(
                    profile_id=linked.id,
                    kind=linked.kind,
                    name=linked.name,
                    role="follower",
                    image=linked.image,
                )
            )

    return {"followers": out}


@app.get("/profile/{criminal_profile_id}/supporters")
def get_supporters(
    criminal_profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, list[LinkedProfileOut]]:
    criminal = db.get(Profile, criminal_profile_id)
    if not criminal or criminal.kind != "criminal":
        raise HTTPException(status_code=400, detail="criminal_profile_id must be a criminal profile")

    links = db.execute(
        select(ProfileLink).where(
            ProfileLink.criminal_profile_id == criminal_profile_id,
            ProfileLink.role == "supporter",
        )
    ).scalars().all()

    out: list[LinkedProfileOut] = []
    for link in links:
        linked = db.get(Profile, link.linked_profile_id)
        if linked:
            out.append(
                LinkedProfileOut(
                    profile_id=linked.id,
                    kind=linked.kind,
                    name=linked.name,
                    role="supporter",
                    image=linked.image,
                )
            )

    return {"supporters": out}


@app.get("/search", response_model=SearchResponse)
def search_get(
    name: Optional[str] = Query(default=None),
    fir_number: Optional[str] = Query(default=None),
    social_media: Optional[str] = Query(default=None),
    organization: Optional[str] = Query(default=None),
    details: Optional[str] = Query(default=None),
    size: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SearchResponse:
    params = SearchRequest(
        name=name,
        fir_number=fir_number,
        social_media=social_media,
        organization=organization,
        details=details,
        size=size,
    )
    matched, related = search_and_expand(db=db, store=es_store, params=params)
    return SearchResponse(profiles=matched, related_profiles=related)


@app.post("/search", response_model=SearchResponse)
def search_post(
    body: SearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SearchResponse:
    matched, related = search_and_expand(db=db, store=es_store, params=body)
    return SearchResponse(profiles=matched, related_profiles=related)


@app.post("/image/upload", response_model=MessageResponse)
def image_upload(
    body: ImageUploadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    # Phase 1: framework stub. In later phase we'll store file + compute face embeddings.
    _ = body.image
    return MessageResponse(message="Image successfully uploaded.")


@app.get("/image/search")
def image_search(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, list[Any]]:
    return {"matched_profiles": []}

