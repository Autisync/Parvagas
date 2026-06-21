"""Seed deterministic test users (candidate, company, admin) + a sample job.

Idempotent: safe to run repeatedly (upserts by email). Bypasses the email/celery
flow so it works without a mail provider. Run inside the API container:

    docker compose exec backend-python python -m scripts.seed_test_users
"""
import json
import uuid
from datetime import datetime

from app.db.session import SessionLocal
from app.core.security import hash_password
from app.models import User, UserRole, CandidateProfile, Company, Job

TEST_PASSWORD = "Teste#2026"

# NOTE: avoid the reserved `.test` TLD — email-validator (pydantic EmailStr) rejects it.
CANDIDATE_EMAIL = "candidato@parvagas.pt"
COMPANY_EMAIL = "empresa@parvagas.pt"


def _get_or_create_user(db, *, email, full_name, role, admin_level=None):
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(id=str(uuid.uuid4()), email=email)
        db.add(user)
    user.full_name = full_name
    user.password_hash = hash_password(TEST_PASSWORD)
    user.role = role
    user.email_verified = True
    user.email_verified_at = datetime.utcnow()
    user.suspended = False
    user.failed_login_attempts = 0
    user.locked_until = None
    if admin_level is not None:
        user.admin_level = admin_level
    db.flush()
    return user


def main() -> None:
    db = SessionLocal()
    try:
        # Candidate
        candidate = _get_or_create_user(
            db, email=CANDIDATE_EMAIL, full_name="Candidato Teste", role=UserRole.candidate
        )
        if not db.query(CandidateProfile).filter(CandidateProfile.user_id == candidate.id).first():
            db.add(CandidateProfile(
                id=str(uuid.uuid4()), user_id=candidate.id,
                first_name="Candidato", last_name="Teste",
                location="Luanda", job_title="Engenheiro de Software",
                skills=json.dumps(["Python", "FastAPI", "React"]),
                has_completed_onboarding=True, has_seen_tutorial=True,
            ))

        # Company owner + company profile
        company_user = _get_or_create_user(
            db, email=COMPANY_EMAIL, full_name="Empresa Teste", role=UserRole.company
        )
        company = db.query(Company).filter(Company.owner_user_id == company_user.id).first()
        if company is None:
            company = Company(id=str(uuid.uuid4()), owner_user_id=company_user.id, name="Acme Lda")
            db.add(company)
        company.status = "active"
        company.email = COMPANY_EMAIL
        company.website = "https://acme.example"
        company.description = "Empresa de teste para o ambiente de desenvolvimento."
        db.flush()

        # One approved sample job so the public listing is not empty
        sample = db.query(Job).filter(Job.company_id == company.id, Job.title == "Engenheiro Backend (Exemplo)").first()
        if sample is None:
            db.add(Job(
                id=str(uuid.uuid4()), company_id=company.id,
                title="Engenheiro Backend (Exemplo)",
                description="Vaga de exemplo criada pelo seed de desenvolvimento.",
                responsibilities=json.dumps(["Construir e manter APIs", "Colaborar com a equipa de produto"]),
                required_skills=json.dumps(["Python", "FastAPI", "PostgreSQL"]),
                location="Luanda", work_mode="Remoto", category="Tecnologia",
                contract_type="Efectivo", salary_range="250.000 - 400.000 Kz",
                status="approved", visibility="public", published_at=datetime.utcnow(),
            ))

        db.commit()
        print("Seed complete.")
        print(f"  candidate: {CANDIDATE_EMAIL} / {TEST_PASSWORD}")
        print(f"  company:   {COMPANY_EMAIL} / {TEST_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
