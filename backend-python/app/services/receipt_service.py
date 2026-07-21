"""Numbered payment receipts and refund bookkeeping (Wave P3,
EXECUTION_PLAN_LEGAL_AND_PAYMENTS.md) — reembolsos.md Section 5 promises a
receipt for every payment; nothing generated one before this.
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Transaction

_ENTITY_NAME = "Usolu Tech Ltd"
_ENTITY_NIF = "NIF 5001246658"
_ENTITY_ADDRESS = "Luanda, Angola"


def assign_receipt_number(db: Session, tx: Transaction) -> Transaction:
    """Called exactly once, at the moment a transaction is confirmed paid.
    Idempotent — a transaction that already has a number keeps it. Free
    (amount == 0) transactions never get one; there is nothing to receipt.

    Numbering is best-effort sequential per calendar year (count of already-
    numbered transactions that year + 1) rather than backed by a dedicated
    atomic counter table — acceptable for this system's transaction volume,
    but note this is NOT a gap-free fiscal sequence under concurrent writes;
    a jurisdiction requiring strictly gapless numbering would need a
    dedicated counter with row-level locking.
    """
    if tx.receipt_number or tx.amount <= 0:
        return tx
    year = (tx.created_at or datetime.utcnow()).year
    count = (
        db.query(Transaction)
        .filter(Transaction.receipt_number.like(f"REC-{year}-%"))
        .count()
    )
    tx.receipt_number = f"REC-{year}-{count + 1:06d}"
    db.commit()
    db.refresh(tx)
    return tx


def generate_receipt_pdf(
    tx: Transaction, *, party_name: str, party_email: str, description: str,
) -> bytes:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.lib.colors import HexColor
    except ImportError as exc:
        raise RuntimeError("reportlab is required for receipt export") from exc

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=25 * mm, rightMargin=25 * mm, topMargin=25 * mm, bottomMargin=25 * mm)
    styles = getSampleStyleSheet()
    st_title = ParagraphStyle("ReceiptTitle", parent=styles["Normal"], fontSize=16, leading=20,
                              textColor=HexColor("#1a1a2e"), fontName="Helvetica-Bold", spaceAfter=2)
    st_entity = ParagraphStyle("ReceiptEntity", parent=styles["Normal"], fontSize=9, textColor=HexColor("#555555"), spaceAfter=14)
    st_label = ParagraphStyle("ReceiptLabel", parent=styles["Normal"], fontSize=10, textColor=HexColor("#333333"))
    st_footer = ParagraphStyle("ReceiptFooter", parent=styles["Normal"], fontSize=8, textColor=HexColor("#888888"), spaceBefore=20)

    status_label = {"paid": "Pago", "refunded": "Reembolsado"}.get(tx.status, tx.status)

    elements: list[Any] = [
        Paragraph("Recibo de Pagamento", st_title),
        Paragraph(f"{_ENTITY_NAME} · {_ENTITY_NIF} · {_ENTITY_ADDRESS}", st_entity),
    ]

    rows = [
        ["Número do recibo", tx.receipt_number or "—"],
        ["Data", tx.created_at.strftime("%d/%m/%Y") if tx.created_at else "—"],
        ["Cliente", party_name or "—"],
        ["Email", party_email or "—"],
        ["Descrição", description],
        ["Método de pagamento", tx.provider],
        ["Referência", tx.reference or "—"],
        ["Montante", f"{tx.amount:,.2f} {tx.currency}"],
        ["Estado", status_label],
    ]
    if tx.status == "refunded" and tx.refunded_at:
        rows.append(["Reembolsado em", tx.refunded_at.strftime("%d/%m/%Y")])
        if tx.refund_reference:
            rows.append(["Referência de reembolso", tx.refund_reference])

    table = Table([[Paragraph(k, st_label), Paragraph(str(v), st_label)] for k, v in rows], colWidths=[55 * mm, 105 * mm])
    table.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, HexColor("#e5e5e5")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(
        "Este recibo refere-se a um pagamento processado através de redes de pagamento locais "
        "(Multicaixa Express, Unitel Money ou transferência bancária). Consulte a nossa "
        "Política de Reembolsos e Cancelamento em parvagas.pt/reembolsos.",
        st_footer,
    ))

    doc.build(elements)
    return buf.getvalue()
