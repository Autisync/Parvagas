"""End-to-end regression test for overnight-audit W0.2: closing a job via
the actual endpoint a company can reach (delete_company_job, now wired to a
"Fechar vaga" button in Minhas-Vagas) must free up the plan's active-job
quota so a new job can be posted. The backend logic itself
(assert_job_quota excluding archived jobs) was already correct and tested
in isolation in test_company_billing_service.py — this proves the full
request chain the company actually exercises.
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models import Company, Job, Plan, User, UserRole
from app.api.v1.companies import create_company_job, delete_company_job


@pytest.fixture()
def db():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_closing_a_job_frees_the_quota_slot(db):
    db.add(Plan(code="free", name="free", price=0, interval="month", max_active_jobs=1))
    db.commit()

    owner = User(id=str(uuid.uuid4()), email=f"owner-{uuid.uuid4()}@x.com", full_name="Owner", password_hash="x", role=UserRole.company)
    db.add(owner)
    db.flush()
    company = Company(owner_user_id=owner.id, name="Acme", status="active")
    db.add(company)
    db.commit()

    job = Job(company_id=company.id, title="Vaga preenchida", status="approved", visibility="public")
    db.add(job)
    db.commit()

    # At the free-plan cap (1 active job) — a second post must be rejected.
    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_company_job({"title": "Segunda vaga"}, db=db, current_user=owner))
    assert exc.value.status_code == 402

    # Close the filled job via the endpoint the "Fechar vaga" button calls.
    result = asyncio.run(delete_company_job(job.id, db=db, current_user=owner))
    assert result == {"deleted": True, "jobId": job.id}
    db.refresh(job)
    assert job.status == "archived"

    # The quota slot is now free — posting a new job must succeed.
    created = asyncio.run(create_company_job({"title": "Segunda vaga"}, db=db, current_user=owner))
    assert created["job"]["title"] == "Segunda vaga"
