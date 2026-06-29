"""Deep, self-contained test harness for the CV parsing + OCR pipeline.

Generates REAL fixtures on the fly (text PDF, scanned/image PDF, image CV,
DOCX, TXT, garbage, pixel-bomb) and runs them through CVParserService end to
end, asserting the extracted text and the heuristic field parsing.

Run with the OCR stack available:
    /tmp/cvtest-venv/bin/python scripts/cv_parser_deeptest.py
"""
from __future__ import annotations

import io
import os
import sys
import tempfile
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.cv_parser_service import CVParserService  # noqa: E402

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"

_results: list[tuple[bool, str, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    _results.append((bool(condition), name, detail))
    print(f"  [{PASS if condition else FAIL}] {name}" + (f" — {detail}" if detail and not condition else ""))


# A realistic Portuguese/English CV used across fixtures.
CV_TEXT = """JOAO MANUEL SILVA
Engenheiro de Software
joao.silva@example.com
+244 923 456 789
Luanda, Angola
https://github.com/joaosilva
https://www.linkedin.com/in/joaosilva

RESUMO
Engenheiro de software com 6 anos de experiencia em desenvolvimento web e
sistemas distribuidos, com foco em Python e React.

COMPETENCIAS
Python, JavaScript, React, FastAPI, Docker, PostgreSQL, SQL

EXPERIENCIA
Senior Developer - Webcor Group
Backend Developer - Standard Bank

EDUCACAO
Licenciatura em Engenharia Informatica - Universidade Agostinho Neto

IDIOMAS
Portugues, Ingles

CERTIFICACOES
AWS Certified, Scrum Master
"""


def _tmp(suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    return path


def make_text_pdf(text: str) -> str:
    import fitz

    path = _tmp(".pdf")
    doc = fitz.open()
    # Split across two pages to exercise multi-page joining.
    chunks = [text[: len(text) // 2], text[len(text) // 2 :]]
    for chunk in chunks:
        page = doc.new_page()
        page.insert_text((50, 60), chunk, fontsize=11)
    doc.save(path)
    doc.close()
    return path


def make_scanned_pdf(text: str) -> str:
    """A PDF whose pages are IMAGES of text (no text layer) → forces OCR."""
    import fitz
    from PIL import Image, ImageDraw, ImageFont

    # Render text to a high-contrast image.
    img = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 28)
    except Exception:
        font = ImageFont.load_default()
    y = 40
    for line in text.splitlines():
        draw.text((50, y), line, fill="black", font=font)
        y += 40
    img_bytes = io.BytesIO()
    img.save(img_bytes, format="PNG")
    img_bytes.seek(0)

    path = _tmp(".pdf")
    doc = fitz.open()
    page = doc.new_page(width=1240 / 2, height=1754 / 2)
    page.insert_image(page.rect, stream=img_bytes.read())
    doc.save(path)
    doc.close()
    return path


def make_image_cv(text: str, fmt: str, suffix: str) -> str:
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 30)
    except Exception:
        font = ImageFont.load_default()
    y = 40
    for line in text.splitlines():
        draw.text((50, y), line, fill="black", font=font)
        y += 42
    path = _tmp(suffix)
    img.save(path, format=fmt)
    return path


def make_docx(text: str) -> str:
    from docx import Document

    path = _tmp(".docx")
    doc = Document()
    for line in text.splitlines():
        doc.add_paragraph(line)
    doc.save(path)
    return path


def make_txt(text: str) -> str:
    path = _tmp(".txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path


def make_pixel_bomb() -> str:
    """A tiny PNG that decodes to a huge canvas (decompression bomb)."""
    from PIL import Image

    path = _tmp(".png")
    # 9000x9000 = 81 MP > the 40 MP cap; solid colour compresses tiny.
    Image.new("RGB", (9000, 9000), "white").save(path, format="PNG", optimize=True)
    return path


def assert_fields(tag: str, profile_dict: dict, *, require_contact: bool = True) -> None:
    if require_contact:
        check(f"{tag}: email parsed", profile_dict.get("email") == "joao.silva@example.com",
              f"got {profile_dict.get('email')!r}")
        phone = (profile_dict.get("phone") or "").replace(" ", "")
        check(f"{tag}: phone parsed", "923456789" in phone, f"got {profile_dict.get('phone')!r}")
        check(f"{tag}: github parsed", "github.com/joaosilva" in (profile_dict.get("github_url") or ""),
              f"got {profile_dict.get('github_url')!r}")
    skills = [s.lower() for s in (profile_dict.get("skills") or [])]
    check(f"{tag}: skills found", any(s in skills for s in ["python", "react", "fastapi", "docker"]),
          f"got {profile_dict.get('skills')!r}")


def _ocr_available() -> bool:
    """True only when the full OCR stack (fitz + PIL + tesseract binary) is present."""
    import importlib.util
    import shutil

    if not all(importlib.util.find_spec(m) for m in ("fitz", "PIL", "pytesseract")):
        return False
    return shutil.which("tesseract") is not None


def run() -> None:
    svc = CVParserService
    ocr = _ocr_available()
    if not ocr:
        print("NOTE: OCR stack (PyMuPDF/Pillow/pytesseract/tesseract) not all "
              "available — skipping OCR/PDF-image sections.")

    # ---- 1. Heuristic parsing on clean text (no extraction involved) --------
    print("\n# 1. Heuristic field extraction (parse_cv_text)")
    prof = svc.parse_cv_text(CV_TEXT).model_dump()
    assert_fields("text", prof)
    check("text: full_name parsed", (prof.get("full_name") or "").upper().startswith("JOAO"),
          f"got {prof.get('full_name')!r}")
    check("text: linkedin parsed", "linkedin.com/in/joaosilva" in (prof.get("linkedin_url") or ""),
          f"got {prof.get('linkedin_url')!r}")
    check("text: years_of_experience", prof.get("years_of_experience") == 6,
          f"got {prof.get('years_of_experience')!r}")
    check("text: languages found", len(prof.get("languages") or []) >= 1, f"got {prof.get('languages')!r}")

    # ---- 2. TXT end-to-end --------------------------------------------------
    print("\n# 2. TXT (text/plain)")
    p = make_txt(CV_TEXT)
    res = svc.parse_cv_file(p, "text/plain")
    check("txt: success", res.get("success") is True, str(res.get("warnings")))
    assert_fields("txt", res.get("parsedProfile", {}))

    # ---- 3. DOCX end-to-end -------------------------------------------------
    print("\n# 3. DOCX")
    p = make_docx(CV_TEXT)
    res = svc.parse_cv_file(p, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    check("docx: success", res.get("success") is True, str(res.get("warnings")))
    assert_fields("docx", res.get("parsedProfile", {}))

    if ocr:
        # ---- 4. Text PDF (PyMuPDF text layer, no OCR) -----------------------
        print("\n# 4. Text PDF (PyMuPDF extraction)")
        p = make_text_pdf(CV_TEXT)
        raw = svc.extract_text_from_pdf(p)
        check("text-pdf: extracted email present", "joao.silva@example.com" in raw)
        check("text-pdf: multi-page joined", "EDUCACAO" in raw or "EDUCA" in raw)
        res = svc.parse_cv_file(p, "application/pdf")
        check("text-pdf: success", res.get("success") is True, str(res.get("warnings")))
        assert_fields("text-pdf", res.get("parsedProfile", {}))

        # ---- 5. Scanned/image PDF (forces OCR fallback) --------------------
        print("\n# 5. Scanned image PDF (OCR fallback)")
        p = make_scanned_pdf(CV_TEXT)
        # Confirm there's effectively NO text layer (so OCR must kick in).
        import fitz
        with fitz.open(p) as d:
            layer = "".join(pg.get_text("text") for pg in d)
        check("scanned-pdf: no text layer", len(layer.strip()) < 20, f"text-layer len={len(layer.strip())}")
        raw = svc.extract_text_from_pdf(p)
        check("scanned-pdf: OCR recovered email", "joao.silva@example.com" in raw.replace(" ", "").replace("\n", "")
              or "joao.silva@example.com" in raw, f"ocr len={len(raw)}")
        check("scanned-pdf: OCR recovered name token", "SILVA" in raw.upper() or "JOAO" in raw.upper(),
              f"ocr sample={raw[:80]!r}")
        res = svc.parse_cv_file(p, "application/pdf")
        check("scanned-pdf: parse success", res.get("success") is True, str(res.get("warnings")))

        # ---- 6. Image CV: PNG, JPG, WEBP ----------------------------------
        print("\n# 6. Image CVs (direct OCR)")
        for fmt, suffix, mime in [("PNG", ".png", "image/png"), ("JPEG", ".jpg", "image/jpeg"), ("WEBP", ".webp", "image/webp")]:
            p = make_image_cv(CV_TEXT, fmt, suffix)
            raw = svc.extract_text_from_image(p)
            check(f"image[{fmt}]: OCR produced text", len(raw.strip()) > 50, f"len={len(raw.strip())}")
            res = svc.parse_cv_file(p, mime)
            check(f"image[{fmt}]: parse success", res.get("success") is True, str(res.get("warnings")))
            assert_fields(f"image[{fmt}]", res.get("parsedProfile", {}), require_contact=False)

        # ---- 7. Generic octet-stream MIME falls back to extension ---------
        print("\n# 7. Generic application/octet-stream → extension routing")
        p = make_image_cv(CV_TEXT, "PNG", ".png")
        raw = svc.extract_text(p, "application/octet-stream")  # mime unknown, ext .png
        check("octet-stream+.png: routed to OCR", len(raw.strip()) > 50, f"len={len(raw.strip())}")
        p2 = make_text_pdf(CV_TEXT)
        raw2 = svc.extract_text(p2, "application/octet-stream")  # ext .pdf
        check("octet-stream+.pdf: routed to PDF", "joao.silva@example.com" in raw2)

    # ---- 8. Failure & edge cases -------------------------------------------
    print("\n# 8. Edge cases / failure modes")
    # 8a. Empty/garbage file → graceful failure, Portuguese message.
    p = _tmp(".pdf")
    with open(p, "wb") as f:
        f.write(b"%PDF-1.4 not really a pdf \x00\x01\x02")
    res = svc.parse_cv_file(p, "application/pdf")
    check("garbage-pdf: returns success=False", res.get("success") is False, str(res))
    warn = " ".join(res.get("warnings", []))
    check("garbage-pdf: Portuguese guidance", "ficheiro" in warn.lower() or "extrair" in warn.lower(), warn)

    # 8b. Empty txt.
    p = make_txt("   \n  \n")
    res = svc.parse_cv_file(p, "text/plain")
    check("empty-txt: returns success=False", res.get("success") is False, str(res))

    # 8c. Pixel bomb is rejected by the guard (no OOM, returns '').
    if ocr:
        try:
            p = make_pixel_bomb()
            raw = svc.extract_text_from_image(p)
            check("pixel-bomb: guarded (empty result, no crash)", raw == "", f"len={len(raw)}")
        except Exception as e:  # noqa: BLE001
            check("pixel-bomb: guarded (no crash)", False, f"raised {e!r}")

    # 8d. msword legacy returns empty (documented limitation), no crash.
    raw = svc.extract_text("/nonexistent.doc", "application/msword")
    check("legacy-doc: empty, no crash", raw == "")

    # ---- 9. OCR disabled switch --------------------------------------------
    if ocr:
        print("\n# 9. CV_OCR_ENABLED=false disables image OCR")
        from app.core.config import get_settings
        get_settings().__dict__["CV_OCR_ENABLED"] = False  # force-flip on the cached settings
        try:
            p = make_image_cv(CV_TEXT, "PNG", ".png")
            raw = svc.extract_text_from_image(p)
            check("ocr-disabled: image returns empty", raw == "", f"len={len(raw)}")
        finally:
            get_settings().__dict__["CV_OCR_ENABLED"] = True

    # ---- summary ------------------------------------------------------------
    total = len(_results)
    passed = sum(1 for ok, _, _ in _results if ok)
    print(f"\n{'='*60}\nRESULT: {passed}/{total} checks passed")
    failures = [(n, d) for ok, n, d in _results if not ok]
    if failures:
        print("\nFAILURES:")
        for n, d in failures:
            print(f"  - {n}: {d}")
        sys.exit(1)
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    try:
        run()
    except Exception:
        traceback.print_exc()
        sys.exit(2)
