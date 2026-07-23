"""Resolves which Company a user may act as, covering BOTH ownership and
team membership.

Every company-scoped endpoint across companies.py, payments.py, and
applications.py used to look a company up strictly by
`Company.owner_user_id == current_user.id`. A team member who accepted an
invite (CompanyInvite -> CompanyMember, see auth.py's accept-invite path)
is never the owner — only a CompanyMember row exists for them — so every
one of those endpoints 404'd for anyone but the owner. The invite feature
worked right up until an invited teammate actually tried to use the
portal. This module is the single fix point for that: owner first, then
any CompanyMember row, so team invites are viable in practice.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Company, CompanyMember, User


def resolve_company_for_user_or_none(db: Session, user: User) -> Company | None:
    """Same resolution as resolve_company_for_user (owner, then any
    CompanyMember seat) but returns None instead of raising — for callers
    that fold the "no company" case into their own permission check rather
    than wanting an immediate 404 (e.g. an ownership check against a
    specific resource)."""
    company = db.query(Company).filter(Company.owner_user_id == user.id).first()
    if company:
        return company

    membership = db.query(CompanyMember).filter(CompanyMember.user_id == user.id).first()
    if membership:
        return db.query(Company).filter(Company.id == membership.company_id).first()

    return None


def resolve_company_for_user(db: Session, user: User) -> Company:
    """The company `user` may act on behalf of — as owner or as an invited
    team member — or 404. Does not distinguish role; callers that need to
    gate a specific mutation to owner-only should additionally check
    `member_role_for(db, user, company)`."""
    company = resolve_company_for_user_or_none(db, user)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


def member_role_for(db: Session, user: User, company: Company) -> str:
    """The caller's role on `company`: 'owner', a CompanyMember.role value
    ('recruiter' | 'viewer'), or 'none' if they have no seat at all (a 404
    from resolve_company_for_user should already have ruled this out for
    the happy path, but callers checking a *different* company than the one
    resolve_company_for_user returned — e.g. from a path param — need this
    guard too)."""
    if company.owner_user_id == user.id:
        return "owner"
    membership = (
        db.query(CompanyMember)
        .filter(CompanyMember.company_id == company.id, CompanyMember.user_id == user.id)
        .first()
    )
    return membership.role if membership else "none"
