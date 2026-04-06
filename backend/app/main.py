from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
import time
import shutil

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select, text
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session
from jose import JWTError
from pydantic import BaseModel

from pathlib import Path
import uuid

from app.core.config import settings
from app.core.security import create_access_token, decode_access_token, new_jti, verify_password, hash_password
from app.db import SessionLocal, engine
from app.es import ElasticsearchProfilesStore
from app.models import Base, Profile, ProfileLink, ProfilePhoto, TokenBlacklist, User
from app.schemas import (
    ImageUploadRequest,
    LinkRequest,
    LinkUpdateRequest,
    LoginRequest,
    MessageResponse,
    ConvertToCriminalRequest,
    LinkedToCriminalOut,
    ProfileCreate,
    ProfileOut,
    ProfilePhotoUpdate,
    ProfileUpdate,
    RegisterRequest,
    SearchRequest,
    SearchResponse,
    TokenResponse,
    RelationOut,
    ProfileKind,
)
from app.services import (
    index_profile_from_db,
    delete_profile_from_es,
    search_and_expand,
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")
es_store = ElasticsearchProfilesStore()

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"


def _normalize_fir(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    t = s.strip()
    return t if t else None


def _uploads_path_from_url(image_url: str) -> Path:
    u = (image_url or "").strip()
    if u.startswith("/uploads/"):
        return UPLOAD_DIR / u[len("/uploads/") :].lstrip("/").replace("\\", "/")
    if "uploads/" in u:
        idx = u.index("uploads/")
        return UPLOAD_DIR / u[idx + len("uploads/") :].lstrip("/").replace("\\", "/")
    return UPLOAD_DIR / u.replace("\\", "/")


def ensure_profile_photo_columns() -> None:
    insp = sa_inspect(engine)
    if not insp.has_table("profile_photos"):
        return
    cols = {c["name"] for c in insp.get_columns("profile_photos")}
    if "analysis_notes" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE profile_photos ADD COLUMN analysis_notes TEXT"))


def ensure_profile_contact_columns() -> None:
    insp = sa_inspect(engine)
    if not insp.has_table("profiles"):
        return
    cols = {c["name"] for c in insp.get_columns("profiles")}
    stmts: list[str] = []
    if "phone" not in cols:
        stmts.append("ALTER TABLE profiles ADD COLUMN phone VARCHAR(64)")
    if "email_contact" not in cols:
        stmts.append("ALTER TABLE profiles ADD COLUMN email_contact VARCHAR(255)")
    if "address" not in cols:
        stmts.append("ALTER TABLE profiles ADD COLUMN address TEXT")
    if stmts:
        with engine.begin() as conn:
            for s in stmts:
                conn.execute(text(s))


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

def _cors_allow_origins() -> list[str]:
    # When frontend runs on different hosts/ports, strict origin matching breaks the browser.
    # For Phase 1, allow all origins in non-production.
    if getattr(settings, "ENV", "local") != "prod":
        return ["*"]

    origin = (settings.FRONTEND_ORIGIN or "").strip()
    if origin in {"*", ""}:
        return ["*"]
    return [origin]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    # Frontend uses Authorization header (no cookies), so allow_credentials should be False.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    # Serve uploaded images from `/uploads/...` (proxied by nginx in docker).
    if not any(r.path == "/uploads" for r in app.routes):
        app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

    # Wait a bit for Postgres / Elasticsearch to become ready.
    for _ in range(12):
        try:
            Base.metadata.create_all(bind=engine)
            ensure_profile_photo_columns()
            ensure_profile_contact_columns()
            break
        except Exception:
            time.sleep(2)

    # ES index may also lag behind at container startup.
    for _ in range(12):
        try:
            es_store.ensure_index()
            # Reindex all profiles from DB so the mapping changes take effect immediately.
            db = SessionLocal()
            try:
                profiles = db.execute(select(Profile)).scalars().all()
                for p in profiles:
                    index_profile_from_db(db=db, store=es_store, profile_id=p.id)
            finally:
                db.close()
            break
        except Exception:
            time.sleep(2)


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
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")

    if body.kind == "criminal":
        nf = _normalize_fir(body.fir_number)
        if nf:
            dup = db.execute(
                select(Profile.id).where(
                    Profile.kind == "criminal",
                    Profile.fir_number.isnot(None),
                    func.upper(func.trim(Profile.fir_number)) == nf.upper(),
                )
            ).scalars().first()
            if dup:
                raise HTTPException(
                    status_code=409,
                    detail="A criminal profile with this FIR number already exists. Use search or edit the existing record.",
                )

    profile = Profile(
        kind=body.kind,
        name=body.name,
        image=body.image,
        social_media=body.social_media,
        organization=body.organization,
        fir_number=body.fir_number,
        details=body.details,
        active_status=body.active_status,
        remarks=body.remarks,
        phone=body.phone,
        email_contact=body.email_contact,
        address=body.address,
        info=body.info,
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

    if profile.kind == "criminal" and body.fir_number is not None:
        nf = _normalize_fir(body.fir_number)
        if nf:
            dup = db.execute(
                select(Profile.id).where(
                    Profile.kind == "criminal",
                    Profile.id != profile_id,
                    Profile.fir_number.isnot(None),
                    func.upper(func.trim(Profile.fir_number)) == nf.upper(),
                )
            ).scalars().first()
            if dup:
                raise HTTPException(
                    status_code=409,
                    detail="Another criminal profile already uses this FIR number.",
                )

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
        active_status=profile.active_status,
        remarks=profile.remarks,
        phone=getattr(profile, "phone", None),
        email_contact=getattr(profile, "email_contact", None),
        address=getattr(profile, "address", None),
        info=profile.info,
        created_at=profile.created_at.isoformat(),
    )


@app.get("/profile/{profile_id}/linked-to-criminals")
def profile_linked_to_criminals(
    profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """All criminal files this person is linked to (as supporter or follower)."""
    prof = db.get(Profile, profile_id)
    if not prof:
        raise HTTPException(status_code=404, detail="Profile not found")
    if prof.kind != "user":
        return {"links": []}

    links = db.execute(
        select(ProfileLink).where(ProfileLink.linked_profile_id == profile_id).order_by(ProfileLink.created_at.desc())
    ).scalars().all()

    out: list[LinkedToCriminalOut] = []
    for link in links:
        cr = db.get(Profile, link.criminal_profile_id)
        if not cr or cr.kind != "criminal":
            continue
        out.append(
            LinkedToCriminalOut(
                link_id=link.id,
                criminal_profile_id=cr.id,
                criminal_name=cr.name,
                criminal_active=bool(cr.active_status),
                role=link.role,  # type: ignore[arg-type]
                remark=link.remark,
            )
        )
    return {"links": out}


@app.post("/profile/{profile_id}/convert-to-criminal")
def convert_profile_to_criminal(
    profile_id: str,
    body: ConvertToCriminalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Turn a person/entity profile into a criminal record (same id; links preserved)."""
    profile = db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if profile.kind != "user":
        raise HTTPException(status_code=400, detail="Only person / entity profiles can be converted to a criminal record.")

    nf = _normalize_fir(body.fir_number)
    if not nf:
        raise HTTPException(status_code=400, detail="FIR number is required.")

    dup = db.execute(
        select(Profile.id).where(
            Profile.kind == "criminal",
            Profile.fir_number.isnot(None),
            func.upper(func.trim(Profile.fir_number)) == nf.upper(),
        )
    ).scalars().first()
    if dup:
        raise HTTPException(
            status_code=409,
            detail="A criminal profile with this FIR number already exists.",
        )

    profile.kind = "criminal"
    profile.fir_number = body.fir_number.strip()
    if body.organization is not None:
        profile.organization = body.organization
    if body.details is not None:
        profile.details = body.details
    if body.remarks is not None:
        profile.remarks = body.remarks

    db.add(profile)
    db.commit()
    db.refresh(profile)

    index_profile_from_db(db=db, store=es_store, profile_id=profile_id)

    return {
        "message": "Profile is now a criminal record. Existing links to other cases are unchanged.",
        "profile_id": profile.id,
        "kind": profile.kind,
    }


@app.delete("/profile/{profile_id}", response_model=MessageResponse)
def delete_profile(
    profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    profile = db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    shutil.rmtree(UPLOAD_DIR / "profiles" / profile_id, ignore_errors=True)

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
        remark=body.remark,
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
) -> dict[str, list[RelationOut]]:
    criminal = db.get(Profile, criminal_profile_id)
    if not criminal or criminal.kind != "criminal":
        raise HTTPException(status_code=400, detail="criminal_profile_id must be a criminal profile")

    links = db.execute(
        select(ProfileLink).where(
            ProfileLink.criminal_profile_id == criminal_profile_id,
            ProfileLink.role == "follower",
        )
    ).scalars().all()

    out: list[RelationOut] = []
    for link in links:
        linked = db.get(Profile, link.linked_profile_id)
        if linked:
            out.append(
                RelationOut(
                    link_id=link.id,
                    criminal_profile_id=criminal_profile_id,
                    linked_profile_id=linked.id,
                    linked_kind=linked.kind,
                    linked_name=linked.name,
                    linked_image=linked.image,
                    role="follower",
                    remark=link.remark,
                )
            )

    return {"followers": out}


@app.get("/profile/{criminal_profile_id}/supporters")
def get_supporters(
    criminal_profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, list[RelationOut]]:
    criminal = db.get(Profile, criminal_profile_id)
    if not criminal or criminal.kind != "criminal":
        raise HTTPException(status_code=400, detail="criminal_profile_id must be a criminal profile")

    links = db.execute(
        select(ProfileLink).where(
            ProfileLink.criminal_profile_id == criminal_profile_id,
            ProfileLink.role == "supporter",
        )
    ).scalars().all()

    out: list[RelationOut] = []
    for link in links:
        linked = db.get(Profile, link.linked_profile_id)
        if linked:
            out.append(
                RelationOut(
                    link_id=link.id,
                    criminal_profile_id=criminal_profile_id,
                    linked_profile_id=linked.id,
                    linked_kind=linked.kind,
                    linked_name=linked.name,
                    linked_image=linked.image,
                    role="supporter",
                    remark=link.remark,
                )
            )

    return {"supporters": out}


@app.put("/profile/{criminal_profile_id}/links/{link_id}", response_model=MessageResponse)
def update_profile_link(
    criminal_profile_id: str,
    link_id: str,
    body: LinkUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    criminal = db.get(Profile, criminal_profile_id)
    if not criminal or criminal.kind != "criminal":
        raise HTTPException(status_code=400, detail="criminal_profile_id must be a criminal profile")

    link = db.get(ProfileLink, link_id)
    if not link or link.criminal_profile_id != criminal_profile_id:
        raise HTTPException(status_code=404, detail="Link not found")

    if body.remark is not None:
        link.remark = body.remark
    db.add(link)
    db.commit()

    index_profile_from_db(db=db, store=es_store, profile_id=criminal_profile_id)
    return MessageResponse(message="Relationship updated.")


@app.delete("/profile/{criminal_profile_id}/links/{link_id}", response_model=MessageResponse)
def delete_profile_link(
    criminal_profile_id: str,
    link_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    criminal = db.get(Profile, criminal_profile_id)
    if not criminal or criminal.kind != "criminal":
        raise HTTPException(status_code=400, detail="criminal_profile_id must be a criminal profile")

    link = db.get(ProfileLink, link_id)
    if not link or link.criminal_profile_id != criminal_profile_id:
        raise HTTPException(status_code=404, detail="Link not found")

    db.delete(link)
    db.commit()

    index_profile_from_db(db=db, store=es_store, profile_id=criminal_profile_id)
    return MessageResponse(message="Relationship removed.")


@app.get("/search", response_model=SearchResponse)
def search_get(
    q: Optional[str] = Query(default=None),
    name: Optional[str] = Query(default=None),
    fir_number: Optional[str] = Query(default=None),
    social_media: Optional[str] = Query(default=None),
    organization: Optional[str] = Query(default=None),
    details: Optional[str] = Query(default=None),
    active_status: Optional[bool] = Query(default=None),
    role: Optional[str] = Query(default=None),
    link_remark: Optional[str] = Query(default=None),
    # Advanced info filters can be passed as JSON string, e.g. info=%7B%22case_number%22%3A%2212%22%7D
    info: Optional[str] = Query(default=None),
    size: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SearchResponse:
    info_obj = None
    if info:
        import json

        try:
            info_obj = json.loads(info)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid `info` JSON string")

    params = SearchRequest(
        q=q,
        name=name,
        fir_number=fir_number,
        social_media=social_media,
        organization=organization,
        details=details,
        active_status=active_status,
        role=role,  # type: ignore[arg-type]
        link_remark=link_remark,
        info=info_obj,
        size=size,
    )
    matched, related, entities = search_and_expand(db=db, store=es_store, params=params)
    return SearchResponse(profiles=matched, related_profiles=related, entity_profiles=entities)


@app.post("/search", response_model=SearchResponse)
def search_post(
    body: SearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SearchResponse:
    matched, related, entities = search_and_expand(db=db, store=es_store, params=body)
    return SearchResponse(profiles=matched, related_profiles=related, entity_profiles=entities)


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


@app.post("/profile/{profile_id}/photos", response_model=MessageResponse)
async def upload_profile_photos(
    profile_id: str,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    profile = db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile_dir = UPLOAD_DIR / "profiles" / profile_id
    profile_dir.mkdir(parents=True, exist_ok=True)

    saved = 0
    for f in files:
        if not f.filename:
            continue
        suffix = Path(f.filename).suffix.lower()
        if not suffix or len(suffix) > 6:
            suffix = ".jpg"

        filename = f"{uuid.uuid4().hex}{suffix}"
        dest_path = profile_dir / filename

        content = await f.read()
        dest_path.write_bytes(content)

        image_url = f"/uploads/profiles/{profile_id}/{filename}"
        photo = ProfilePhoto(profile_id=profile_id, image_url=image_url)
        db.add(photo)
        saved += 1

    db.commit()

    return MessageResponse(message=f"Uploaded {saved} photo(s).")


@app.get("/profile/{profile_id}/photos")
def get_profile_photos(
    profile_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    photos = db.execute(
        select(ProfilePhoto).where(ProfilePhoto.profile_id == profile_id).order_by(ProfilePhoto.uploaded_at.desc())
    ).scalars().all()

    return {
        "photos": [
            {
                "photo_id": p.id,
                "image_url": p.image_url,
                "uploaded_at": p.uploaded_at.isoformat() if p.uploaded_at else None,
                "analysis_notes": p.analysis_notes,
            }
            for p in photos
        ]
    }


@app.patch("/profile/{profile_id}/photos/{photo_id}")
def patch_profile_photo(
    profile_id: str,
    photo_id: str,
    body: ProfilePhotoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    profile = db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    photo = db.get(ProfilePhoto, photo_id)
    if not photo or photo.profile_id != profile_id:
        raise HTTPException(status_code=404, detail="Photo not found")

    updates = body.model_dump(exclude_unset=True)
    if "analysis_notes" in updates:
        photo.analysis_notes = updates["analysis_notes"]
    db.add(photo)
    db.commit()
    db.refresh(photo)

    return {
        "photo_id": photo.id,
        "image_url": photo.image_url,
        "uploaded_at": photo.uploaded_at.isoformat() if photo.uploaded_at else None,
        "analysis_notes": photo.analysis_notes,
    }


@app.delete("/profile/{profile_id}/photos/{photo_id}", response_model=MessageResponse)
def delete_profile_photo(
    profile_id: str,
    photo_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MessageResponse:
    profile = db.get(Profile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    photo = db.get(ProfilePhoto, photo_id)
    if not photo or photo.profile_id != profile_id:
        raise HTTPException(status_code=404, detail="Photo not found")

    path = _uploads_path_from_url(photo.image_url)
    try:
        if path.is_file():
            path.unlink()
    except OSError:
        pass

    db.delete(photo)
    db.commit()

    return MessageResponse(message="Photo deleted.")


@app.get("/profiles")
def list_profiles(
    kind: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    q = select(Profile)
    if kind:
        q = q.where(Profile.kind == kind)
    q = q.order_by(Profile.created_at.desc()).limit(limit).offset(offset)
    rows = db.execute(q).scalars().all()
    return {
        "profiles": [
            {
                "profile_id": p.id,
                "kind": p.kind,
                "name": p.name,
                "fir_number": p.fir_number,
                "phone": getattr(p, "phone", None),
                "organization": p.organization,
                "active_status": p.active_status,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in rows
        ],
        "total": len(rows),
    }


@app.get("/dashboard/stats")
def dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    total_criminals = db.execute(select(func.count()).select_from(Profile).where(Profile.kind == "criminal")).scalar() or 0
    active_criminals = db.execute(
        select(func.count()).select_from(Profile).where(Profile.kind == "criminal", Profile.active_status.is_(True))
    ).scalar() or 0
    inactive_criminals = max(int(total_criminals) - int(active_criminals), 0)
    total_users = db.execute(select(func.count()).select_from(Profile).where(Profile.kind == "user")).scalar() or 0
    supporters = db.execute(select(func.count()).select_from(ProfileLink).where(ProfileLink.role == "supporter")).scalar() or 0
    followers = db.execute(select(func.count()).select_from(ProfileLink).where(ProfileLink.role == "follower")).scalar() or 0
    total_links = db.execute(select(func.count()).select_from(ProfileLink)).scalar() or 0
    total_photos = db.execute(select(func.count()).select_from(ProfilePhoto)).scalar() or 0

    return {
        "active_criminals": int(active_criminals),
        "inactive_criminals": int(inactive_criminals),
        "total_criminals": int(total_criminals),
        "total_user_profiles": int(total_users),
        "supporter_links": int(supporters),
        "follower_links": int(followers),
        "total_relationship_links": int(total_links),
        "total_photos": int(total_photos),
    }


@app.get("/dashboard/activity")
def dashboard_activity(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    events: list[dict[str, Any]] = []

    profiles = db.execute(select(Profile).order_by(Profile.created_at.desc()).limit(15)).scalars().all()
    for p in profiles:
        events.append(
            {
                "type": "profile_created",
                "at": p.created_at.isoformat() if p.created_at else None,
                "title": f"Profile created: {p.name}",
                "subtitle": f"{p.kind} · {p.id}",
                "profile_id": p.id,
                "profile_kind": p.kind,
            }
        )

    photos = (
        db.execute(select(ProfilePhoto).order_by(ProfilePhoto.uploaded_at.desc()).limit(15)).scalars().all()
    )
    for ph in photos:
        prof = db.get(Profile, ph.profile_id)
        events.append(
            {
                "type": "photo_uploaded",
                "at": ph.uploaded_at.isoformat() if ph.uploaded_at else None,
                "title": f"Photo uploaded{f' for {prof.name}' if prof else ''}",
                "subtitle": ph.image_url,
                "profile_id": ph.profile_id,
                "profile_kind": prof.kind if prof else None,
            }
        )

    links = db.execute(select(ProfileLink).order_by(ProfileLink.created_at.desc()).limit(15)).scalars().all()
    for ln in links:
        cr = db.get(Profile, ln.criminal_profile_id)
        lk = db.get(Profile, ln.linked_profile_id)
        events.append(
            {
                "type": "relationship_linked",
                "at": ln.created_at.isoformat() if ln.created_at else None,
                "title": f"New {ln.role}: {lk.name if lk else ln.linked_profile_id}",
                "subtitle": f"Linked to criminal {cr.name if cr else ln.criminal_profile_id}",
                "criminal_profile_id": ln.criminal_profile_id,
                "linked_profile_id": ln.linked_profile_id,
                "role": ln.role,
            }
        )

    events.sort(key=lambda x: x.get("at") or "", reverse=True)
    return {"activity": events[:limit]}


@app.get("/relationships")
def list_relationships(
    q: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    link_q = select(ProfileLink).order_by(ProfileLink.created_at.desc())
    if role in ("supporter", "follower"):
        link_q = link_q.where(ProfileLink.role == role)
    rows = db.execute(link_q).scalars().all()

    out: list[dict[str, Any]] = []
    for ln in rows:
        cr = db.get(Profile, ln.criminal_profile_id)
        lk = db.get(Profile, ln.linked_profile_id)
        if not cr or not lk:
            continue
        if q:
            needle = q.lower()
            blob = f"{cr.name} {lk.name} {ln.remark or ''} {cr.fir_number or ''}".lower()
            if needle not in blob:
                continue
        out.append(
            {
                "link_id": ln.id,
                "criminal_profile_id": ln.criminal_profile_id,
                "criminal_name": cr.name,
                "criminal_active": cr.active_status,
                "linked_profile_id": ln.linked_profile_id,
                "linked_name": lk.name,
                "linked_kind": lk.kind,
                "role": ln.role,
                "remark": ln.remark,
                "created_at": ln.created_at.isoformat() if ln.created_at else None,
            }
        )

    sliced = out[offset : offset + limit]
    return {"relationships": sliced, "total_filtered": len(out)}


@app.get("/analytics/network")
def analytics_network(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    nodes_map: dict[str, dict[str, Any]] = {}
    links_out: list[dict[str, Any]] = []

    criminals = db.execute(select(Profile).where(Profile.kind == "criminal")).scalars().all()
    for c in criminals:
        nodes_map[c.id] = {
            "id": c.id,
            "label": c.name,
            "kind": "criminal",
            "active": bool(c.active_status),
        }

    all_links = db.execute(select(ProfileLink)).scalars().all()
    for ln in all_links:
        cr = db.get(Profile, ln.criminal_profile_id)
        lk = db.get(Profile, ln.linked_profile_id)
        if not cr or not lk:
            continue
        if cr.id not in nodes_map:
            nodes_map[cr.id] = {"id": cr.id, "label": cr.name, "kind": "criminal", "active": bool(cr.active_status)}
        nodes_map[lk.id] = {"id": lk.id, "label": lk.name, "kind": lk.kind, "active": bool(getattr(lk, "active_status", True))}
        links_out.append(
            {"source": cr.id, "target": lk.id, "role": ln.role, "remark": ln.remark}
        )

    return {"nodes": list(nodes_map.values()), "links": links_out}


@app.get("/analytics/top-criminals")
def analytics_top_criminals(
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    criminal_ids = db.execute(select(Profile.id).where(Profile.kind == "criminal")).scalars().all()
    counts: list[tuple[str, int, int, int]] = []
    for cid in criminal_ids:
        sup = db.execute(
            select(func.count()).select_from(ProfileLink).where(
                ProfileLink.criminal_profile_id == cid, ProfileLink.role == "supporter"
            )
        ).scalar() or 0
        fol = db.execute(
            select(func.count()).select_from(ProfileLink).where(
                ProfileLink.criminal_profile_id == cid, ProfileLink.role == "follower"
            )
        ).scalar() or 0
        counts.append((cid, int(sup), int(fol), int(sup) + int(fol)))

    counts.sort(key=lambda x: x[3], reverse=True)
    top = counts[:limit]
    result = []
    for cid, sup, fol, total in top:
        p = db.get(Profile, cid)
        if p:
            result.append(
                {
                    "criminal_profile_id": cid,
                    "name": p.name,
                    "supporters": sup,
                    "followers": fol,
                    "total_links": total,
                }
            )
    return {"top": result}

