"""Layout-aware text extraction — the two-column failure mode.

Many CV templates (incl. the Resume-Worded family and Europass) put contact /
skills / languages in a narrow side column. Reading the page in raw stream
order interleaves the two columns line-by-line and destroys every section.

This module uses PyMuPDF block geometry to detect a column split and read each
column top-to-bottom, left column first. Falls back to plain reading order when
the page is single-column or PyMuPDF is unavailable.
"""
from __future__ import annotations

from app.core.logging import get_logger

logger = get_logger(__name__)

# A page is "two-column" only if both sides hold a meaningful share of content.
_MIN_SIDE_SHARE = 0.18


def _blocks_to_columns(blocks: list, page_width: float) -> str:
    """Order text blocks as left-column-then-right-column when two columns exist."""
    text_blocks = [b for b in blocks if len(b) >= 5 and isinstance(b[4], str) and b[4].strip()]
    if not text_blocks:
        return ""

    mid = page_width / 2.0
    # A block "belongs" to a side by where its left edge sits.
    left = [b for b in text_blocks if b[0] < mid]
    right = [b for b in text_blocks if b[0] >= mid]

    total = len(text_blocks)
    two_column = (
        total >= 4
        and len(left) / total >= _MIN_SIDE_SHARE
        and len(right) / total >= _MIN_SIDE_SHARE
    )

    if not two_column:
        # Single column: pure top-to-bottom, then left-to-right for ties.
        ordered = sorted(text_blocks, key=lambda b: (round(b[1] / 4), b[0]))
        return "\n".join(b[4].strip() for b in ordered)

    # Two columns: each side top-to-bottom; left column first.
    left_sorted = sorted(left, key=lambda b: (round(b[1] / 4), b[0]))
    right_sorted = sorted(right, key=lambda b: (round(b[1] / 4), b[0]))
    parts = [b[4].strip() for b in left_sorted] + [b[4].strip() for b in right_sorted]
    return "\n".join(parts)


def extract_pdf_layout_text(file_path: str) -> str:
    """Extract a PDF as text, preserving column order across all pages.

    Returns '' if PyMuPDF is unavailable or the document has no text layer
    (caller falls back to OCR / pypdf).
    """
    try:
        import fitz  # PyMuPDF
    except Exception as exc:  # pragma: no cover
        logger.warning(f"PyMuPDF unavailable for layout extraction: {exc}")
        return ""

    try:
        page_texts: list[str] = []
        with fitz.open(file_path) as doc:
            for page in doc:
                blocks = page.get_text("blocks") or []
                page_texts.append(_blocks_to_columns(blocks, page.rect.width))
        return "\n".join(pt for pt in page_texts if pt.strip())
    except Exception as exc:  # pragma: no cover
        logger.warning(f"Layout extraction failed: {exc}")
        return ""


def order_text_lines_from_blocks(blocks: list, page_width: float) -> str:
    """Public helper: column-aware ordering for a single page's blocks."""
    return _blocks_to_columns(blocks, page_width)
