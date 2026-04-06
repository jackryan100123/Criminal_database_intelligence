from __future__ import annotations

from typing import Any, Iterable

from elasticsearch import Elasticsearch

from app.core.config import settings


class ElasticsearchProfilesStore:
    def __init__(self) -> None:
        self.client = Elasticsearch(settings.ELASTICSEARCH_URL, request_timeout=settings.ELASTICSEARCH_TIMEOUT_SECONDS)

    @property
    def index(self) -> str:
        return settings.ELASTICSEARCH_INDEX

    def ensure_index(self) -> None:
        # Phase 1 mapping evolves quickly; recreate index to ensure fields like `info` exist.
        if self.client.indices.exists(index=self.index):
            self.client.indices.delete(index=self.index, ignore=[404])

        mapping: dict[str, Any] = {
            "mappings": {
                "properties": {
                    "id": {"type": "keyword"},
                    "kind": {"type": "keyword"},
                    # Prefix / typeahead: subfields _2gram, _3gram, _index_prefix for partial name search (e.g. "Tus" → "Tushar").
                    "name": {"type": "search_as_you_type", "max_shingle_size": 3},
                    "organization": {"type": "text", "fields": {"keyword": {"type": "keyword", "ignore_above": 256}}},
                    "details": {"type": "text"},
                    "active_status": {"type": "boolean"},
                    "remarks": {"type": "text"},
                    # Text + keyword for fuzzy / partial and exact filters.
                    "fir_number": {"type": "text", "fields": {"keyword": {"type": "keyword", "ignore_above": 256}}},
                    "social_media": {"type": "text", "fields": {"keyword": {"type": "keyword", "ignore_above": 256}}},
                    "phone": {"type": "text", "fields": {"keyword": {"type": "keyword", "ignore_above": 64}}},
                    "email_contact": {"type": "text", "fields": {"keyword": {"type": "keyword", "ignore_above": 256}}},
                    "address": {"type": "text"},
                    "image_url": {"type": "keyword"},
                    "info": {"type": "flattened"},
                    "supporter_ids": {"type": "keyword"},
                    "follower_ids": {"type": "keyword"},
                    "created_at": {"type": "date"},
                }
            }
        }

        # elasticsearch-py 8+: prefer explicit mappings (body= still works but this is clearer).
        self.client.indices.create(index=self.index, mappings=mapping["mappings"])

    def index_profile_doc(self, profile_id: str, doc: dict[str, Any]) -> None:
        # Using id=profile_id keeps CRUD sync simple.
        self.client.index(index=self.index, id=profile_id, document=doc, refresh="wait_for")

    def delete_profile_doc(self, profile_id: str) -> None:
        self.client.delete(index=self.index, id=profile_id, ignore=[404])

    def search_criminals(self, query: dict[str, Any], size: int) -> list[dict[str, Any]]:
        res = self.client.search(index=self.index, query=query, size=size)
        body = res.body if hasattr(res, "body") else res
        if not isinstance(body, dict):
            return []
        hits = body.get("hits", {}).get("hits", [])
        return [h.get("_source", {}) for h in hits if h.get("_source")]

    def mget_profiles(self, ids: Iterable[str]) -> list[dict[str, Any]]:
        ids_list = list(ids)
        if not ids_list:
            return []

        res = self.client.mget(index=self.index, ids=ids_list)
        body = res.body if hasattr(res, "body") else res
        if not isinstance(body, dict):
            return []
        docs: list[dict[str, Any]] = []
        for doc in body.get("docs", []):
            if doc.get("found") and doc.get("_source"):
                docs.append(doc["_source"])
        return docs

