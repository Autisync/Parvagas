"""Seed real, curated job openings into the scraped-jobs review queue.

These are genuine openings aggregated from public Angola job boards (June 2026),
inserted with status="pending" so an admin can review and publish them from
Portal/Admin → Scraped Jobs (the review action creates a public Job owned by the
"Parvagas Aggregator" company).

Idempotent: dedupes on the same content hash (title|company|location) or source
URL, so running it repeatedly will not create duplicates. Run inside the API
container:

    docker compose exec backend-python python -m scripts.seed_scraped_jobs

Source attribution is kept on every row (source + source_url). Descriptions are
short factual summaries written for this queue — not copied from the source.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from app.db.session import SessionLocal
from app.models import ScrapedJob
from app.services.scraper_service import content_hash

# Shelf life for aggregated listings, matching the admin review flow (45 days).
_SHELF_LIFE_DAYS = 45
_SOURCE = "Ango Emprego (curadoria)"

# Real, named-employer openings (Luanda, Angola — June 2026).
CURATED_JOBS: list[dict[str, str]] = [
    {
        "title": "Plant Finance Manager",
        "company": "Webcor Group",
        "location": "Luanda, Angola",
        "category": "Contabilidade e Finanças",
        "description": (
            "O Webcor Group procura um Plant Finance Manager para liderar o "
            "controlo financeiro de uma unidade industrial em Luanda: orçamentação, "
            "análise de custos, reporting e apoio à gestão. Requer experiência sólida "
            "em finanças/controlo de gestão no setor industrial e fluência em português."
        ),
        "source_url": "https://angoemprego.com/vagas/plant-finance-manager-2/",
    },
    {
        "title": "Credit Analyst Manager",
        "company": "Webcor Group",
        "location": "Luanda, Angola",
        "category": "Banca e Seguros",
        "description": (
            "Vaga para Credit Analyst Manager no Webcor Group, responsável pela "
            "avaliação de risco de crédito de clientes, definição de limites e "
            "acompanhamento da carteira. Procura-se experiência em análise de crédito "
            "e forte capacidade analítica."
        ),
        "source_url": "https://angoemprego.com/vagas/credit-analyst-manager/",
    },
    {
        "title": "Gestor de TI e Plataformas Digitais",
        "company": "Webmasters",
        "location": "Luanda, Angola",
        "category": "Tecnologia",
        "description": (
            "A Webmasters recruta um Gestor de TI e Plataformas Digitais para gerir "
            "infraestrutura, sistemas e presença digital da empresa. Inclui gestão de "
            "websites/aplicações, segurança e suporte. Requer experiência em gestão de "
            "TI e conhecimento de plataformas web."
        ),
        "source_url": "https://angoemprego.com/vagas/gestor-de-ti-e-plataformas-digitais/",
    },
    {
        "title": "Técnico(a) de Monitorização, Avaliação e Aprendizagem (MEAL)",
        "company": "Expertise France",
        "location": "Luanda, Angola",
        "category": "Gestão de Projectos",
        "description": (
            "A Expertise France procura um(a) Técnico(a) de Monitorização, Avaliação, "
            "Responsabilização e Aprendizagem (MEAL) para apoiar projetos de "
            "desenvolvimento em Angola: definição de indicadores, recolha e análise de "
            "dados e elaboração de relatórios. Experiência em M&A de projetos é valorizada."
        ),
        "source_url": "https://angoemprego.com/vagas/tecnicoa-de-monitorizacao-avaliacao-responsabilizacao-e-aprendizagem-angola-h-f/",
    },
    {
        "title": "Formador(a) a Tempo Inteiro — Academia de Formação",
        "company": "Training Key",
        "location": "Luanda, Angola",
        "category": "Educação, Formação e Ensino",
        "description": (
            "A Training Key abre várias vagas para Formadores a tempo inteiro numa "
            "academia em Luanda, em diferentes áreas de formação profissional. "
            "Procuram-se profissionais com experiência pedagógica e domínio da sua área "
            "técnica."
        ),
        "source_url": "https://angoemprego.com/vagas/varias-vagas-para-formadores-a-tempo-inteiro-numa-academia/",
    },
]


def main() -> None:
    db = SessionLocal()
    now = datetime.utcnow()
    created = 0
    skipped = 0
    try:
        for spec in CURATED_JOBS:
            title = spec["title"].strip()
            company = spec["company"].strip()
            location = spec["location"].strip()
            source_url = spec["source_url"].strip()
            chash = content_hash(title, company, location)

            # Dedupe on content hash OR an already-ingested source URL.
            existing = db.query(ScrapedJob).filter(ScrapedJob.content_hash == chash).first()
            if not existing and source_url:
                existing = db.query(ScrapedJob).filter(ScrapedJob.source_url == source_url).first()
            if existing:
                existing.last_seen_at = now
                skipped += 1
                print(f"  ~ skip (already present): {title} — {company}")
                continue

            db.add(ScrapedJob(
                id=str(uuid.uuid4()),
                source=_SOURCE,
                source_url=source_url,
                title=title,
                company_name=company,
                location=location,
                category=spec.get("category") or None,
                description=spec.get("description") or None,
                status="pending",
                content_hash=chash,
                last_seen_at=now,
                expires_at=now + timedelta(days=_SHELF_LIFE_DAYS),
            ))
            created += 1
            print(f"  + queued: {title} — {company} ({location})")

        db.commit()
        print("\nSeed complete.")
        print(f"  created: {created}   skipped (duplicate): {skipped}")
        print("  Review & publish at: Portal/Admin → Scraped Jobs (status: pending)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
