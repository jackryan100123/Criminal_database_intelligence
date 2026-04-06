from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


ProfileKind = Literal["criminal", "user"]
LinkRole = Literal["supporter", "follower"]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str


class MessageResponse(BaseModel):
    message: str


class ProfileBase(BaseModel):
    name: str
    image: Optional[str] = Field(default=None, description="image_url")
    social_media: Optional[str] = None
    organization: Optional[str] = None
    fir_number: Optional[str] = None
    details: Optional[str] = None
    kind: ProfileKind = "criminal"
    active_status: bool = True
    remarks: Optional[str] = None
    phone: Optional[str] = None
    email_contact: Optional[str] = None
    address: Optional[str] = None
    # Universal extra data field for all profiles.
    # Example: {"alias": "X", "case_number": "12/2024", "location": "Chennai"}
    info: Optional[dict[str, Any]] = None


class ProfileCreate(ProfileBase):
    pass


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    image: Optional[str] = None
    social_media: Optional[str] = None
    organization: Optional[str] = None
    fir_number: Optional[str] = None
    details: Optional[str] = None
    active_status: Optional[bool] = None
    remarks: Optional[str] = None
    phone: Optional[str] = None
    email_contact: Optional[str] = None
    address: Optional[str] = None
    info: Optional[dict[str, Any]] = None


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    profile_id: str
    kind: ProfileKind
    name: str
    image: Optional[str] = None
    social_media: Optional[str] = None
    organization: Optional[str] = None
    fir_number: Optional[str] = None
    details: Optional[str] = None
    active_status: bool = True
    remarks: Optional[str] = None
    phone: Optional[str] = None
    email_contact: Optional[str] = None
    address: Optional[str] = None
    info: Optional[dict[str, Any]] = None
    created_at: Optional[str] = None


class LinkedToCriminalOut(BaseModel):
    """This person (user entity) appears on these criminal files."""

    link_id: str
    criminal_profile_id: str
    criminal_name: str
    criminal_active: bool
    role: LinkRole
    remark: Optional[str] = None


class ConvertToCriminalRequest(BaseModel):
    """Promote a person/entity profile to a criminal record (same profile id, new investigation)."""

    fir_number: str
    organization: Optional[str] = None
    details: Optional[str] = None
    remarks: Optional[str] = None


class LinkRequest(BaseModel):
    follower_id: str
    role: LinkRole
    remark: Optional[str] = None


class RelationOut(BaseModel):
    link_id: str
    criminal_profile_id: str
    linked_profile_id: str
    linked_kind: ProfileKind
    linked_name: str
    linked_image: Optional[str] = None
    role: LinkRole
    remark: Optional[str] = None


class SearchRequest(BaseModel):
    # Global fuzzy search across names, FIR, org, details, remarks, social, flattened info.*, etc.
    q: Optional[str] = None
    name: Optional[str] = None
    fir_number: Optional[str] = None
    social_media: Optional[str] = None
    organization: Optional[str] = None
    details: Optional[str] = None
    active_status: Optional[bool] = None
    role: Optional[LinkRole] = None  # filter related profiles by role
    link_remark: Optional[str] = None

    # Filter by analyst-defined info fields: {"case_number": "12", "location":"Chennai"}
    info: Optional[dict[str, Any]] = None

    size: int = 10


class LinkUpdateRequest(BaseModel):
    remark: Optional[str] = None


class ProfilePhotoUpdate(BaseModel):
    analysis_notes: Optional[str] = None


class SearchResponse(BaseModel):
    profiles: list[ProfileOut]
    related_profiles: list[RelationOut]
    # Direct Elasticsearch hits for person/entity (user) profiles — not only via criminal expansion.
    entity_profiles: list[ProfileOut] = Field(default_factory=list)


class ImageUploadRequest(BaseModel):
    image: str

