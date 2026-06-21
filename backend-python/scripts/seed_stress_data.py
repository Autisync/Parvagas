"""Seed a realistic dataset for functional + stress testing.

Idempotent-ish: clears previously seeded rows (marked by the STRESS tag) before
re-inserting, so re-running keeps the dataset stable. Run inside the API container:

    docker compose exec backend-python python -m scripts.seed_stress_data
"""
import json
import random
import uuid
from datetime import datetime, timedelta

from app.db.session import SessionLocal
from app.core.security import hash_password
from app.models import (
    User, UserRole, CandidateProfile, Company, Job, JobApplication, SavedJob, AdCampaign,
)

random.seed(42)  # deterministic dataset
TAG = "[stress]"
PWD = "Teste#2026"

CITIES = ["Luanda", "Benguela", "Huambo", "Lobito", "Lubango", "Cabinda", "Malanje", "Namibe"]
CATEGORIES = ["Tecnologia", "Energia", "Saude", "Banca e Financas", "Logistica", "Recursos Humanos", "Comercial"]
WORK_MODES = ["Presencial", "Remoto", "Hibrido", "Rotativo"]
CONTRACTS = ["Efectivo", "Contrato", "Estagio", "Temporario"]
SKILLS = ["Python", "JavaScript", "React", "SQL", "Excel", "Power BI", "AWS", "Gestao", "Vendas",
          "Atendimento ao cliente", "Contabilidade", "Logistica", "Enfermagem", "Electricidade"]
JOB_TITLES = [
    "Engenheiro de Software", "Analista de Dados", "Gestor de Projeto", "Tecnico de Redes",
    "Contabilista", "Enfermeiro", "Electricista Industrial", "Gestor de Logistica",
    "Representante Comercial", "Especialista de RH", "Operador de Caixa", "Designer Grafico",
    "Engenheiro Civil", "Tecnico de Energia Solar", "Gestor de Marketing",
]
JOB_STATUSES = ["approved", "approved", "approved", "pending_platform_review", "archived"]
COMPANY_STATUSES = ["active", "active", "active", "pending_verification", "rejected"]
APP_STATUSES = ["submitted", "under_review", "shortlisted", "interview", "hired", "rejected", "withdrawn"]


def _clear_previous(db):
    # Remove rows from prior stress seeds (identified by TAG).
    stress_users = db.query(User).filter(User.full_name.like(f"%{TAG}%")).all()
    ids = [u.id for u in stress_users]
    if ids:
        db.query(SavedJob).filter(SavedJob.candidate_user_id.in_(ids)).delete(synchronize_session=False)
        db.query(JobApplication).filter(JobApplication.candidate_user_id.in_(ids)).delete(synchronize_session=False)
        db.query(CandidateProfile).filter(CandidateProfile.user_id.in_(ids)).delete(synchronize_session=False)
        comp_ids = [c.id for c in db.query(Company).filter(Company.owner_user_id.in_(ids)).all()]
        if comp_ids:
            db.query(Job).filter(Job.company_id.in_(comp_ids)).delete(synchronize_session=False)
            db.query(JobApplication).filter(JobApplication.company_id.in_(comp_ids)).delete(synchronize_session=False)
            db.query(Company).filter(Company.id.in_(comp_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(ids)).delete(synchronize_session=False)
    db.query(AdCampaign).filter(AdCampaign.title.like(f"%{TAG}%")).delete(synchronize_session=False)
    db.commit()


def main(n_companies=8, n_candidates=20, jobs_per_company=6, apps_per_job=4, n_ads=6):
    db = SessionLocal()
    try:
        _clear_previous(db)
        now = datetime.utcnow()

        # Companies + owners + jobs
        companies, jobs = [], []
        for ci in range(n_companies):
            ou = User(
                id=str(uuid.uuid4()), email=f"stress-co{ci}@parvagas.pt",
                full_name=f"Empresa {ci} {TAG}", password_hash=hash_password(PWD),
                role=UserRole.company, email_verified=True, email_verified_at=now,
            )
            db.add(ou); db.flush()
            status = COMPANY_STATUSES[ci % len(COMPANY_STATUSES)]
            co = Company(
                id=str(uuid.uuid4()), owner_user_id=ou.id,
                name=f"{random.choice(['Acme','Nova','Atlas','Kwanza','Sonangol-X','TecAngola','Global'])} {ci} Lda",
                nif=f"50{ci:08d}", status=status, email=f"geral{ci}@empresa.ao",
                website="https://empresa.example", description="Empresa de teste para QA e stress.",
                has_seen_tutorial=bool(ci % 2),
            )
            db.add(co); db.flush()
            companies.append(co)
            for ji in range(jobs_per_company):
                jstatus = JOB_STATUSES[(ci + ji) % len(JOB_STATUSES)]
                job = Job(
                    id=str(uuid.uuid4()), company_id=co.id,
                    title=random.choice(JOB_TITLES),
                    description="Procuramos profissional dedicado para integrar a nossa equipa em crescimento.",
                    responsibilities=json.dumps(["Executar tarefas da funcao", "Colaborar com a equipa"]),
                    required_skills=json.dumps(random.sample(SKILLS, k=random.randint(2, 5))),
                    location=random.choice(CITIES), work_mode=random.choice(WORK_MODES),
                    category=random.choice(CATEGORIES), contract_type=random.choice(CONTRACTS),
                    salary_range=f"{random.randint(150,400)}.000 - {random.randint(450,900)}.000 Kz",
                    required_experience_years=random.randint(0, 8),
                    status=jstatus, visibility="public",
                    published_at=now - timedelta(days=random.randint(0, 60)) if jstatus == "approved" else None,
                )
                db.add(job); jobs.append(job)
        db.flush()

        approved_jobs = [j for j in jobs if j.status == "approved"]

        # Candidates + profiles
        candidates = []
        for ki in range(n_candidates):
            cu = User(
                id=str(uuid.uuid4()), email=f"stress-cand{ki}@parvagas.pt",
                full_name=f"Candidato {ki} {TAG}", password_hash=hash_password(PWD),
                role=UserRole.candidate, email_verified=True, email_verified_at=now,
            )
            db.add(cu); db.flush()
            db.add(CandidateProfile(
                id=str(uuid.uuid4()), user_id=cu.id, first_name=f"Candidato{ki}", last_name="Teste",
                phone=f"9{random.randint(10000000,99999999)}", location=random.choice(CITIES),
                job_title=random.choice(JOB_TITLES), years_of_experience=random.randint(0, 12),
                skills=json.dumps(random.sample(SKILLS, k=random.randint(3, 6))),
                has_completed_onboarding=bool(ki % 3), has_seen_tutorial=bool(ki % 2),
            ))
            candidates.append(cu)
        db.flush()

        # Applications + saved jobs
        n_apps = 0
        for job in approved_jobs:
            for _ in range(random.randint(0, apps_per_job)):
                cand = random.choice(candidates)
                db.add(JobApplication(
                    id=str(uuid.uuid4()), job_id=job.id, company_id=job.company_id,
                    candidate_user_id=cand.id, applicant_full_name=cand.full_name,
                    applicant_email=cand.email, applicant_phone="912000000",
                    applicant_location=random.choice(CITIES),
                    cover_letter="Tenho grande interesse nesta oportunidade.",
                    profile_source="main_profile", status=random.choice(APP_STATUSES),
                    created_at=now - timedelta(days=random.randint(0, 30)),
                ))
                n_apps += 1
        # saved jobs (unique per candidate/job)
        n_saved = 0
        for cand in candidates:
            for job in random.sample(approved_jobs, k=min(3, len(approved_jobs))):
                exists = db.query(SavedJob).filter(
                    SavedJob.candidate_user_id == cand.id, SavedJob.job_id == job.id
                ).first()
                if not exists:
                    db.add(SavedJob(id=str(uuid.uuid4()), candidate_user_id=cand.id, job_id=job.id))
                    n_saved += 1

        # Ads
        for ai in range(n_ads):
            db.add(AdCampaign(
                id=str(uuid.uuid4()), title=f"Campanha {ai} {TAG}",
                placement=random.choice(["sidebar", "jobs_top", "home_hero"]),
                link="https://anunciante.example", image_url="https://picsum.photos/600/200",
                status=random.choice(["draft", "published", "active"]),
                active=bool(ai % 2), budget=random.randint(50000, 500000),
                clicks=random.randint(0, 500), impressions=random.randint(100, 10000),
                start_date=now - timedelta(days=10), end_date=now + timedelta(days=20),
            ))

        db.commit()
        print("Seed complete:")
        print(f"  companies={len(companies)} jobs={len(jobs)} (approved={len(approved_jobs)})")
        print(f"  candidates={len(candidates)} applications={n_apps} savedJobs={n_saved} ads={n_ads}")
        # totals
        print(f"  DB totals -> jobs={db.query(Job).count()} apps={db.query(JobApplication).count()} "
              f"companies={db.query(Company).count()} users={db.query(User).count()}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
