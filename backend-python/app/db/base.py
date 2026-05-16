"""Database base and declarative setup."""
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, String, DateTime, func
from datetime import datetime

Base = declarative_base()


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps."""
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class IdMixin:
    """Mixin for UUID primary key."""
    
    id = Column(String(36), primary_key=True, default=lambda: str(__import__('uuid').uuid4()))
