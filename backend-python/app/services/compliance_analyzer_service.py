"""Compliance analyzer — cross-references a described new/changed feature
against Parvagas's actual legal document set and returns concrete,
section-level guidance (Wave L3b, EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md).

Deliberately rule-based, not LLM-based: a legal-compliance tool that
confidently hallucinates a false "no issues found" is worse than useless.
The category table below is the actual source of truth — each category is
a yes/no question an admin answers about the feature, mapped to which of
the 14 real documents it implicates and what to do about it before
launch. This is a triage aid, not a legal opinion — every finding says so,
and the tool is explicit that a "no" answer everywhere is not proof of
compliance, just "this checklist found nothing obvious."
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session

from app.services import legal_service

if TYPE_CHECKING:
    from app.models import ComplianceCheck

_SEVERITY_RANK = {"none": 0, "low": 1, "medium": 2, "high": 3}

# Each category is a yes/no question surfaced to the admin as a checklist.
# `affected_docs` are LegalDocument slugs this category's guidance refers
# to — resolved against the LIVE current published version at analysis
# time, so a finding always reflects what the document actually says
# today, not a frozen assumption.
CATEGORIES: list[dict[str, Any]] = [
    {
        "key": "new_data_type",
        "question": "A funcionalidade recolhe um novo tipo de dado pessoal não descrito na Política de Privacidade atual?",
        "severity": "high",
        "affected_docs": ["privacidade", "politica-retencao"],
        "guidance": (
            "Antes do lançamento: (1) adicionar o novo tipo de dado à tabela da Secção 2 da Política de "
            "Privacidade; (2) definir um período de retenção específico na Política de Retenção de Dados; "
            "(3) confirmar a base legal aplicável (consentimento, execução contratual, ou interesse legítimo)."
        ),
    },
    {
        "key": "new_subprocessor",
        "question": "A funcionalidade introduz um novo fornecedor/subcontratante com acesso a dados pessoais (ex.: novo serviço de IA, novo fornecedor de armazenamento)?",
        "severity": "high",
        "affected_docs": ["privacidade", "dpa"],
        "guidance": (
            "Antes do lançamento: adicionar o subcontratante à tabela de subcontratantes da Política de "
            "Privacidade e ao anexo do DPA. Se o fornecedor processar dados fora do Espaço Económico Europeu, "
            "confirmar um mecanismo de transferência válido ANTES de ativar o fluxo de dados. Comunicar aos "
            "titulares/Clientes com antecedência, nos termos já prometidos nesses documentos."
        ),
    },
    {
        "key": "ai_automated_decision",
        "question": "A funcionalidade utiliza IA ou processamento automatizado para pontuar, classificar, recomendar ou tomar decisões sobre um utilizador?",
        "severity": "high",
        "affected_docs": ["consentimento-cv-ia", "privacidade"],
        "guidance": (
            "Confirmar que: (1) nenhuma decisão com efeito jurídico ou similarmente significativo é tomada sem "
            "revisão humana; (2) se envolve novo tratamento de CV/perfil por IA fora do já descrito, estender o "
            "Consentimento do Candidato — CV e IA para cobrir esta nova finalidade antes do lançamento; (3) o "
            "utilizador pode sempre rever e rejeitar o resultado gerado."
        ),
    },
    {
        "key": "payment_billing_change",
        "question": "A funcionalidade introduz um novo método de pagamento, altera preços/planos, ou muda o comportamento de renovação/cancelamento?",
        "severity": "medium",
        "affected_docs": ["reembolsos", "termos-empregador", "msa"],
        "guidance": (
            "Rever se a Política de Reembolsos ainda cobre corretamente o novo fluxo — um novo método de "
            "pagamento pode ter mecânica de reembolso distinta. Se afeta preços/faturação de planos de Empresa, "
            "atualizar os Termos de Empregador e/ou o MSA. A política de reembolso deve continuar a ser "
            "apresentada ANTES do pagamento — bloqueador de lançamento se deixar de ser o caso."
        ),
    },
    {
        "key": "admin_access_change",
        "question": "A funcionalidade adiciona uma nova ação administrativa (ex.: novo tipo de exportação, nova permissão, novo painel sensível)?",
        "severity": "medium",
        "affected_docs": ["acesso-administrativo"],
        "guidance": (
            "Adicionar a nova ação à tabela de permissões da Política de Acesso e Operações Administrativas, "
            "indicando se é permitida a Moderador ou reservada a Super-Admin. Confirmar que a ação fica "
            "registada no log de auditoria."
        ),
    },
    {
        "key": "minors_or_age",
        "question": "A funcionalidade pode ser utilizada por, ou recolher dados sobre, menores de idade?",
        "severity": "high",
        "affected_docs": ["termos", "privacidade"],
        "guidance": (
            "Os Termos Gerais assumem atualmente que todos os utilizadores têm idade legal para trabalhar. "
            "Qualquer funcionalidade que possa envolver menores requer revisão jurídica dedicada antes do "
            "lançamento — não avançar apenas com base neste checklist automático."
        ),
    },
    {
        "key": "cross_border_transfer",
        "question": "A funcionalidade envia dados pessoais para um país fora de Angola/UE que ainda não consta da tabela de subcontratantes?",
        "severity": "high",
        "affected_docs": ["privacidade", "dpa"],
        "guidance": (
            "Confirmar um mecanismo de transferência válido (Cláusulas Contratuais-Tipo, decisão de adequação) "
            "ANTES de ativar o fluxo de dados. Documentar o novo destino na tabela de subcontratantes da "
            "Política de Privacidade e no DPA."
        ),
    },
    {
        "key": "cookie_tracking_change",
        "question": "A funcionalidade adiciona ou altera cookies, pixels, ou tecnologias de rastreamento?",
        "severity": "low",
        "affected_docs": ["cookies"],
        "guidance": (
            "Atualizar a tabela de cookies da Política de Cookies. Se o cookie não for estritamente necessário, "
            "confirmar que só é ativado após consentimento explícito no banner."
        ),
    },
    {
        "key": "candidate_employer_data_sharing",
        "question": "A funcionalidade altera que dados de candidatos são partilhados com empresas, ou como/quando essa partilha ocorre?",
        "severity": "medium",
        "affected_docs": ["consentimento-cv-ia", "dpa", "termos-empregador"],
        "guidance": (
            "Confirmar que o candidato continua a controlar quais campos são partilhados por candidatura. "
            "Verificar se a nova partilha se enquadra no objeto de tratamento já definido no DPA ou se requer "
            "atualização desse âmbito."
        ),
    },
    {
        "key": "content_moderation_change",
        "question": "A funcionalidade altera as regras sobre que conteúdo é permitido na plataforma (vagas, perfis, mensagens)?",
        "severity": "low",
        "affected_docs": ["utilizacao-aceitavel", "termos-empregador"],
        "guidance": (
            "Rever se a Política de Utilização Aceitável e/ou os Termos de Empregador continuam a refletir as "
            "regras de conteúdo atualizadas."
        ),
    },
]

_CATEGORY_BY_KEY = {c["key"]: c for c in CATEGORIES}


def list_categories() -> list[dict[str, Any]]:
    """The checklist questions, for the admin intake form."""
    return [{"key": c["key"], "question": c["question"]} for c in CATEGORIES]


def _build_findings(db: Session, intake: dict[str, bool]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for category in CATEGORIES:
        if not intake.get(category["key"]):
            continue
        doc_findings = []
        for slug in category["affected_docs"]:
            document = legal_service.get_document_by_slug(db, slug)
            if not document:
                doc_findings.append({"slug": slug, "title": None, "status": "missing"})
                continue
            current = legal_service.get_current_version(db, document.id)
            doc_findings.append({
                "slug": slug,
                "title": document.title,
                "status": "published" if current else "unpublished",
                "versionLabel": current.version_label if current else None,
            })
        # A category whose referenced document doesn't exist yet at all is
        # escalated to high — that's a genuine gap, not just "go edit doc X".
        severity = category["severity"]
        if any(f["status"] == "missing" for f in doc_findings):
            severity = "high"

        findings.append({
            "category": category["key"],
            "question": category["question"],
            "severity": severity,
            "guidance": category["guidance"],
            "documents": doc_findings,
        })
    return findings


def _severity_summary(findings: list[dict[str, Any]]) -> str:
    if not findings:
        return "none"
    return max((f["severity"] for f in findings), key=lambda s: _SEVERITY_RANK.get(s, 0))


def analyze_feature(
    db: Session,
    *,
    feature_name: str,
    feature_description: str,
    intake: dict[str, bool],
    created_by_user_id: str | None = None,
) -> "ComplianceCheck":
    """Run the checklist against `intake` (category_key -> bool) and
    persist the result. Unknown keys in `intake` are ignored rather than
    rejected, so the frontend checklist can evolve without a hard
    coupling to this exact category list."""
    from app.models import ComplianceCheck

    valid_intake = {k: bool(v) for k, v in intake.items() if k in _CATEGORY_BY_KEY}
    findings = _build_findings(db, valid_intake)
    severity = _severity_summary(findings)

    check = ComplianceCheck(
        feature_name=feature_name.strip() or "Funcionalidade sem nome",
        feature_description=feature_description.strip(),
        intake=json.dumps(valid_intake),
        findings=json.dumps(findings),
        severity_summary=severity,
        status="open",
        created_by_user_id=created_by_user_id,
    )
    db.add(check)
    db.commit()
    db.refresh(check)
    return check


def list_checks(db: Session, *, status_filter: str | None = None) -> list["ComplianceCheck"]:
    from app.models import ComplianceCheck

    query = db.query(ComplianceCheck)
    if status_filter:
        query = query.filter(ComplianceCheck.status == status_filter)
    return query.order_by(ComplianceCheck.created_at.desc()).all()


def get_check(db: Session, check_id: str) -> "ComplianceCheck | None":
    from app.models import ComplianceCheck

    return db.query(ComplianceCheck).filter(ComplianceCheck.id == check_id).first()


def resolve_check(db: Session, check: "ComplianceCheck", *, resolved_by_user_id: str, dismissed: bool = False) -> "ComplianceCheck":
    check.status = "dismissed" if dismissed else "resolved"
    check.resolved_at = datetime.utcnow()
    check.resolved_by_user_id = resolved_by_user_id
    db.commit()
    db.refresh(check)
    return check
