from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.es import ElasticsearchProfilesStore
from app.models import Profile, ProfileLink
from app.schemas import (
    ProfileOut,
    RelationOut,
    SearchRequest,
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
        "remarks": profile.remarks,
        "active_status": bool(profile.active_status),
        "info": profile.info or {},
        "supporter_ids": supporter_ids,
        "follower_ids": follower_ids,
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
    }
    store.index_profile_doc(profile_id=profile_id, doc=doc)


def delete_profile_from_es(store: ElasticsearchProfilesStore, profile_id: str) -> None:
    store.delete_profile_doc(profile_id)


def _nonempty_str(value: Optional[str]) -> bool:
    if value is None:
        return False
    return bool(str(value).strip())


def _has_es_terms(params: SearchRequest) -> bool:
    return bool(
        (params.q or "").strip()
        or (params.name or "").strip()
        or (params.fir_number or "").strip()
        or (params.social_media or "").strip()
        or (params.organization or "").strip()
        or (params.details or "").strip()
        or bool(params.info)
    )


def _build_es_global_query(params: SearchRequest) -> dict[str, Any]:
    if not _has_es_terms(params):
        # Relationship remark / active_status-only searches are handled in SQL after ES.
        return {"match_none": {}}

    filters: list[dict[str, Any]] = []
    must: list[dict[str, Any]] = []
    should: list[dict[str, Any]] = []

    q_global = (params.q or "").strip()
    if q_global:
        must.append(
            {
                "bool": {
                    "should": [
                        {
                            "multi_match": {
                                "query": q_global,
                                "fields": [
                                    "name^4",
                                    "organization^2",
                                    "details",
                                    "remarks",
                                    "fir_number",
                                    "social_media",
                                ],
                                "type": "best_fields",
                                "fuzziness": "AUTO",
                            }
                        },
                        # Flattened `info` is a single field; `info.*` does not match mapping and yields no hits.
                        {
                            "simple_query_string": {
                                "query": q_global,
                                "fields": ["info"],
                                "default_operator": "or",
                                "lenient": True,
                            }
                        },
                    ],
                    "minimum_should_match": 1,
                }
            }
        )
    else:
        if params.name:
            should.append(
                {
                    "multi_match": {
                        "query": params.name,
                        "fields": ["name^4", "organization^2", "details", "remarks"],
                        "type": "best_fields",
                        "fuzziness": "AUTO",
                    }
                }
            )
        if params.organization:
            should.append({"match": {"organization": {"query": params.organization, "fuzziness": "AUTO"}}})
        if params.details:
            should.append({"match": {"details": {"query": params.details, "fuzziness": "AUTO"}}})

    if params.social_media:
        filters.append(
            {
                "bool": {
                    "should": [
                        {"term": {"social_media.keyword": params.social_media}},
                        {"match": {"social_media": {"query": params.social_media, "fuzziness": "AUTO"}}},
                    ],
                    "minimum_should_match": 1,
                }
            }
        )
    if params.fir_number:
        fn = params.fir_number.strip()
        filters.append(
            {
                "bool": {
                    "should": [
                        {"term": {"fir_number.keyword": fn}},
                        {"match": {"fir_number": {"query": fn, "fuzziness": "AUTO"}}},
                    ],
                    "minimum_should_match": 1,
                }
            }
        )

    # Search in universal analyst data
    if params.info:
        for k, v in params.info.items():
            if v is None:
                continue
            if isinstance(v, str):
                if q_global:
                    must.append({"match": {f"info.{k}": {"query": v, "fuzziness": "AUTO"}}})
                else:
                    should.append({"match": {f"info.{k}": v}})
            else:
                # For numbers/bools, term match is more appropriate.
                filters.append({"term": {f"info.{k}": v}})

    # Optional: search within relationship remark as well (only stored on SQL in Phase 1).
    # We keep ES query for profile remarks (general) and profile info; link_remark is handled in SQL.

    bool_body: dict[str, Any] = {"filter": filters}
    if must:
        bool_body["must"] = must
    if should:
        bool_body["should"] = should
        bool_body["minimum_should_match"] = 1

    return {"bool": bool_body}


def search_and_expand(db: Session, store: ElasticsearchProfilesStore, params: SearchRequest):
    # Must align with _has_es_terms + SQL-only filters (active status, link remark).
    has_terms = bool(
        _nonempty_str(params.q)
        or _nonempty_str(params.name)
        or _nonempty_str(params.fir_number)
        or _nonempty_str(params.social_media)
        or _nonempty_str(params.organization)
        or _nonempty_str(params.details)
        or bool(params.info)
        or _nonempty_str(params.link_remark)
        or params.active_status is not None
    )
    if not has_terms:
        return ([], [])

    es_query = _build_es_global_query(params)

    # We search both kinds (criminal + user). Then we map user matches -> criminal via DB links.
    # Oversample to improve result quality for relationship expansion.
    oversample = max(params.size * 5, 25)
    matched_docs = store.search_criminals(query=es_query, size=oversample)

    criminal_matches_order: list[str] = []
    seen_criminals: set[str] = set()

    matched_user_ids: list[str] = []
    # Capture order for criminals/user hits from ES.
    for d in matched_docs:
        if not d.get("id") or not d.get("kind"):
            continue
        if d.get("kind") == "criminal":
            cid = str(d["id"])
            if cid not in seen_criminals:
                criminal_matches_order.append(cid)
                seen_criminals.add(cid)
        else:
            matched_user_ids.append(str(d["id"]))

    if not criminal_matches_order and not _has_es_terms(params) and params.active_status is not None:
        status_rows = db.execute(
            select(Profile.id)
            .where(Profile.kind == "criminal", Profile.active_status == params.active_status)
            .order_by(Profile.created_at.desc())
            .limit(oversample)
        ).scalars().all()
        for cid in status_rows:
            if cid not in seen_criminals:
                criminal_matches_order.append(cid)
                seen_criminals.add(cid)

    role_filter = params.role
    info_role_filter = role_filter

    # Build mapping: matched user -> criminal ids via ProfileLink.
    user_to_criminals: dict[str, list[str]] = {}
    links_query = select(ProfileLink).where(ProfileLink.linked_profile_id.in_(matched_user_ids))
    if role_filter:
        links_query = links_query.where(ProfileLink.role == role_filter)
    if params.link_remark:
        # Case-insensitive match for relationship remark.
        links_query = links_query.where(ProfileLink.remark.ilike(f"%{params.link_remark}%"))

    if matched_user_ids:
        user_links = db.execute(links_query).scalars().all()
        for link in user_links:
            user_to_criminals.setdefault(link.linked_profile_id, []).append(link.criminal_profile_id)

        # Expand criminals in ES order (so it feels "intelligent")
        for d in matched_docs:
            if d.get("kind") != "user":
                continue
            uid = str(d.get("id"))
            for criminal_id in user_to_criminals.get(uid, []):
                if criminal_id not in seen_criminals:
                    criminal_matches_order.append(criminal_id)
                    seen_criminals.add(criminal_id)

    # If link_remark is provided, include criminals that have a link remark match (even if user didn't match).
    if params.link_remark:
        links_remark_query = select(ProfileLink.criminal_profile_id).where(ProfileLink.remark.ilike(f"%{params.link_remark}%"))
        if role_filter:
            links_remark_query = links_remark_query.where(ProfileLink.role == role_filter)
        remark_criminals = db.execute(links_remark_query).scalars().all()
        for cid in remark_criminals:
            if cid not in seen_criminals:
                criminal_matches_order.append(cid)
                seen_criminals.add(cid)

    # Apply active_status filter to criminal results
    if params.active_status is not None:
        criminal_profiles_tmp = db.execute(
            select(Profile.id).where(Profile.id.in_(criminal_matches_order), Profile.active_status == params.active_status)
        ).scalars().all()
        allowed = set(criminal_profiles_tmp)
        criminal_matches_order = [cid for cid in criminal_matches_order if cid in allowed]

    criminal_ids = criminal_matches_order[: params.size]
    if not criminal_ids:
        return ([], [])

    profiles_map: dict[str, Profile] = {}
    profiles = db.execute(select(Profile).where(Profile.id.in_(criminal_ids))).scalars().all()
    profiles_map = {p.id: p for p in profiles}

    matched_profiles: list[ProfileOut] = []
    for cid in criminal_ids:
        p = profiles_map.get(cid)
        if not p:
            continue
        matched_profiles.append(
            ProfileOut(
                profile_id=p.id,
                kind=p.kind,
                name=p.name,
                image=p.image,
                social_media=p.social_media,
                organization=p.organization,
                fir_number=p.fir_number,
                details=p.details,
                active_status=p.active_status,
                remarks=p.remarks,
                info=p.info,
                created_at=p.created_at.isoformat() if p.created_at else None,
            )
        )

    # Related profiles: supporters/followers for matched criminals (with remark)
    related_profiles: list[RelationOut] = []
    rel_links_query = select(ProfileLink).where(ProfileLink.criminal_profile_id.in_(criminal_ids))
    if info_role_filter:
        rel_links_query = rel_links_query.where(ProfileLink.role == info_role_filter)
    if params.link_remark:
        rel_links_query = rel_links_query.where(ProfileLink.remark.ilike(f"%{params.link_remark}%"))

    links = db.execute(rel_links_query).scalars().all()
    for link in links:
        linked_profile = profiles_map.get(link.linked_profile_id)
        if not linked_profile:
            linked_profile = db.get(Profile, link.linked_profile_id)
        if not linked_profile:
            continue
        related_profiles.append(
            RelationOut(
                link_id=link.id,
                criminal_profile_id=link.criminal_profile_id,
                linked_profile_id=linked_profile.id,
                linked_kind=linked_profile.kind,
                linked_name=linked_profile.name,
                linked_image=linked_profile.image,
                role=link.role,
                remark=link.remark,
            )
        )

    return (matched_profiles, related_profiles)
