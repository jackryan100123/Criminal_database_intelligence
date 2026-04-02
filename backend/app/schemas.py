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
    custom_attributes: Optional[dict[str, Any]] = None


class ProfileCreate(ProfileBase):
    pass


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    image: Optional[str] = None
    social_media: Optional[str] = None
    organization: Optional[str] = None
    fir_number: Optional[str] = None
    details: Optional[str] = None
    custom_attributes: Optional[dict[str, Any]] = None


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
    created_at: Optional[str] = None


class LinkRequest(BaseModel):
    follower_id: str
    role: LinkRole


class LinkedProfileOut(BaseModel):
    profile_id: str
    kind: ProfileKind
    name: str
    role: LinkRole
    image: Optional[str] = None


class SearchRequest(BaseModel):
    name: Optional[str] = None
    fir_number: Optional[str] = None
    social_media: Optional[str] = None
    organization: Optional[str] = None
    details: Optional[str] = None
    size: int = 10


class SearchResponse(BaseModel):
    profiles: list[ProfileOut]
    related_profiles: list[ProfileOut]


class ImageUploadRequest(BaseModel):
    image: str

