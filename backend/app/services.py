from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.es import ElasticsearchProfilesStore
from app.models import Profile, ProfileLink
from app.schemas import ProfileOut, ProfileKind, SearchRequest


def _doc_to_profile_out(doc: dict[str, Any]) -> ProfileOut:
    # ES stores image_url but API uses image.
    created_at = doc.get("created_at")
    # Keep it simple: return as string if present.
    created_at_str: Optional[str] = None
    if isinstance(created_at, str):
        created_at_str = created_at
    elif isinstance(created_at, (int, float)):
        created_at_str = datetime.fromtimestamp(created_at, tz=timezone.utc).isoformat()
    elif created_at is not None:
        created_at_str = str(created_at)

    return ProfileOut(
        profile_id=str(doc.get("id")),
        kind=doc.get("kind"),
        name=doc.get("name", ""),
        image=doc.get("image_url"),
        social_media=doc.get("social_media"),
        organization=doc.get("organization"),
        fir_number=doc.get("fir_number"),
        details=doc.get("details"),
        created_at=created_at_str,
    )


def index_profile_from_db(db: Session, store: ElasticsearchProfilesStore, profile_id: str) -> None:
    profile: Optional[Profile] = db.get(Profile, profile_id)
    if profile is None:
        store.delete_profile_doc(profile_id)
        return

    supporter_ids: list[str] = []
    follower_ids: list[str] = []

    if profile.kind == "criminal":
        links = db.execute(select(ProfileLink).where(ProfileLink.criminal_profile_id == profile_id)).scalars().all()
        for link in links:
            if link.role == "supporter":
                supporter_ids.append(link.linked_profile_id)
            elif link.role == "follower":
                follower_ids.append(link.linked_profile_id)

    doc = {
        "id": profile.id,
        "kind": profile.kind,
        "name": profile.name,
        "image_url": profile.image,
        "social_media": profile.social_media,
        "organization": profile.organization,
        "fir_number": profile.fir_number,
        "details": profile.details,
        "custom_attributes": profile.custom_attributes or {},
        "supporter_ids": supporter_ids,
        "follower_ids": follower_ids,
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
    }
    store.index_profile_doc(profile_id=profile_id, doc=doc)


def delete_profile_from_es(store: ElasticsearchProfilesStore, profile_id: str) -> None:
    store.delete_profile_doc(profile_id)


def build_profile_search_query(params: SearchRequest) -> dict[str, Any]:
    # ES bool query:
    # - filter = exact match fields
    # - should = fuzzy/full-text fields
    bool_query: dict[str, Any] = {"filter": [{"term": {"kind": "criminal"}}]}

    if params.fir_number:
        bool_query["filter"].append({"term": {"fir_number": params.fir_number}})
    if params.social_media:
        bool_query["filter"].append({"term": {"social_media": params.social_media}})

    should: list[dict[str, Any]] = []
    if params.name:
        should.append(
            {
                "multi_match": {
                    "query": params.name,
                    "fields": ["name^4", "organization^2", "details"],
                    "type": "best_fields",
                }
            }
        )
    if params.organization:
        should.append({"match": {"organization": {"query": params.organization}}})
    if params.details:
        should.append({"match": {"details": {"query": params.details}}})

    # If user only provided filters (fir_number/social_media), let filter-only queries work.
    if should:
        bool_query["should"] = should
        bool_query["minimum_should_match"] = 1

    return {"bool": bool_query}


def search_and_expand(
    db: Session,
    store: ElasticsearchProfilesStore,
    params: SearchRequest,
) -> tuple[list[ProfileOut], list[ProfileOut]]:
    # Requirement: return empty if caller didn't provide any meaningful search terms.
    if not (params.name or params.fir_number or params.social_media or params.organization or params.details):
        return ([], [])

    query = build_profile_search_query(params)
    matched_docs = store.search_criminals(query=query, size=params.size)
    matched_profiles = [_doc_to_profile_out(d) for d in matched_docs]

    related_ids: set[str] = set()
    for d in matched_docs:
        related_ids.update(d.get("supporter_ids", []) or [])
        related_ids.update(d.get("follower_ids", []) or [])

    related_docs = store.mget_profiles(related_ids)
    related_profiles = [_doc_to_profile_out(d) for d in related_docs]

    return (matched_profiles, related_profiles)

