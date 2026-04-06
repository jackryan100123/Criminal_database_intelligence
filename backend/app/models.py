from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Column
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import JSON


Base = declarative_base()


ProfileKind = Literal["criminal", "user"]
LinkRole = Literal["supporter", "follower"]


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(150), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Profile(Base):
    __tablename__ = "profiles"

    # Using string UUIDs keeps request/response consistent with your spec ("profile_id": "12345"-like).
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    kind = Column(String(20), nullable=False)  # "criminal" | "user"

    name = Column(String(255), nullable=False)
    image = Column(String(1024), nullable=True)
    social_media = Column(String(1024), nullable=True)
    organization = Column(String(255), nullable=True)
    fir_number = Column(String(100), nullable=True)
    details = Column(Text, nullable=True)

    active_status = Column(Boolean, nullable=False, default=True, server_default="true")
    remarks = Column(Text, nullable=True)

    # Person / entity contact (distinct from login User.email); used for analyst-facing records.
    phone = Column(String(64), nullable=True)
    email_contact = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)

    # Universal extra data field for all profiles (analyst can store anything).
    # Stored as JSON and indexed in Elasticsearch as `info`.
    info = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ProfileLink(Base):
    __tablename__ = "profile_links"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    criminal_profile_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    linked_profile_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # "supporter" | "follower"
    remark = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("criminal_profile_id", "linked_profile_id", "role", name="uq_profile_link"),
    )


class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    # One row per token JTI.
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    jti = Column(String(36), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ProfilePhoto(Base):
    __tablename__ = "profile_photos"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    profile_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    image_url = Column(String(1024), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    # Analyst notes / observations for this image (preview & analysis workflow).
    analysis_notes = Column(Text, nullable=True)

