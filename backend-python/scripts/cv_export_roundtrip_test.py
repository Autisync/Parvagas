"""Round-trip test: generate CV (DOCX + PDF + JSON) then parse it back.

Verifies that key fields survive the export → parse loop with ≥80% fuzzy
similarity, confirming the ATS generator produces machine-readable output.

    /tmp/cvtest-venv/bin/python scripts/cv_export_roundtrip_test.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rapidfuzz import fuzz  # noqa: E402

from app.services.cv_export_service import to_docx, to_pdf, to_json_resume  # noqa: E402
from app.services.cv_parser_service import CVParserService  # noqa: E402

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"
_results: list[tuple[bool, str, str]] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    _results.append((bool(condition), name, detail))
    print(f"  [{PASS if condition else FAIL}] {name}" + (f" — {detail}" if detail and not condition else ""))


def _m(gold: str, pred: str, threshold: int = 80) -> bool:
    return fuzz.token_set_ratio(str(gold or ""), str(pred or "")) >= threshold


# ── Gold profile ──────────────────────────────────────────────────────────────
PROFILE = {
    "fullName": "Ana Pereira",
    "email": "ana.pereira@example.com",
    "phone": "+244 912 000 001",
    "location": "Luanda, Angola",
    "professionalTitle": "Engenheira de Software",
    "professionalSummary": "Engenheira com 5 anos de experiência em backend Python e sistemas distribuídos.",
    "hardSkills": ["Arquitectura de sistemas", "Análise de dados"],
    "techniques": ["Microservices", "REST APIs"],
    "tools": ["Python", "FastAPI", "Docker", "PostgreSQL"],
    "skills": ["Arquitectura de sistemas", "Análise de dados", "Microservices", "REST APIs",
               "Python", "FastAPI", "Docker", "PostgreSQL"],
    "languages": ["Português (Nativo)", "Inglês (Fluente)"],
    "certifications": ["AWS Solutions Architect", "Google Cloud Professional"],
    "workExperience": [
        {
            "company": "Sonangol",
            "jobTitle": "Engenheira de Software Sénior",
            "location": "Luanda, Angola",
            "startDate": "2021-01",
            "endDate": "present",
            "current": True,
            "description": "Desenvolveu APIs REST em Python. Liderou equipa de 4 engenheiros.",
        },
        {
            "company": "Multichoice Angola",
            "jobTitle": "Programadora",
            "location": "Luanda, Angola",
            "startDate": "2018-06",
            "endDate": "2020-12",
            "current": False,
            "description": "Criou dashboards de BI e pipelines de dados.",
        },
    ],
    "education": [
        {
            "institution": "Universidade Agostinho Neto",
            "degree": "Licenciatura",
            "fieldOfStudy": "Engenharia Informática",
            "location": "Luanda, Angola",
            "startDate": "2013-09",
            "endDate": "2018-07",
        }
    ],
}


def _tmp(suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    return path


# ── JSON-Resume (no round-trip parse needed — schema check only) ─────────────
print("\n# 1. JSON-Resume export")
jr = to_json_resume(PROFILE)
check("json: has $schema", "$schema" in jr and "jsonresume" in jr["$schema"])
check("json: name", jr.get("basics", {}).get("name") == "Ana Pereira")
check("json: email", jr.get("basics", {}).get("email") == "ana.pereira@example.com")
check("json: phone", jr.get("basics", {}).get("phone") == "+244 912 000 001")
check("json: 2 work entries", len(jr.get("work", [])) == 2)
check("json: 1 edu entry",  len(jr.get("education", [])) == 1)
check("json: skills present", len(jr.get("skills", [])) > 0)
check("json: languages present", len(jr.get("languages", [])) == 2)
check("json: work[0] company", jr["work"][0].get("name") == "Sonangol")
check("json: edu institution", jr["education"][0].get("institution") == "Universidade Agostinho Neto")
check("json: edu degree",      jr["education"][0].get("studyType") == "Licenciatura")
check("json: cert present", any(c.get("name") == "AWS Solutions Architect" for c in jr.get("certificates", [])))


# ── PDF round-trip ────────────────────────────────────────────────────────────
print("\n# 2. PDF export → parse round-trip")
pdf_bytes = to_pdf(PROFILE)
check("pdf: produced bytes", len(pdf_bytes) > 1000, f"got {len(pdf_bytes)}")

pdf_path = _tmp(".pdf")
with open(pdf_path, "wb") as f:
    f.write(pdf_bytes)

result = CVParserService.parse_cv_file(pdf_path, "application/pdf")
check("pdf-parse: success", result.get("success") is True, str(result.get("warnings")))
p = result.get("parsedProfile", {})
check("pdf-parse: full_name", _m("Ana Pereira", p.get("full_name")), repr(p.get("full_name")))
check("pdf-parse: email",     _m("ana.pereira@example.com", p.get("email")), repr(p.get("email")))
check("pdf-parse: phone",     _m("+244 912 000 001", p.get("phone")), repr(p.get("phone")))
check("pdf-parse: location",  _m("Luanda, Angola", p.get("location")), repr(p.get("location")))

we = p.get("work_experience") or []
check("pdf-parse: ≥1 experience", len(we) >= 1, f"got {len(we)}")
if we:
    first_exp = we[0] if isinstance(we[0], dict) else {}
    check("pdf-parse: exp company", _m("Sonangol", first_exp.get("company")), repr(first_exp.get("company")))

edu = p.get("education") or []
check("pdf-parse: ≥1 education", len(edu) >= 1, f"got {len(edu)}")
if edu:
    first_edu = edu[0] if isinstance(edu[0], dict) else {}
    check("pdf-parse: edu institution", _m("Agostinho Neto", first_edu.get("institution")), repr(first_edu.get("institution")))

all_skills = (p.get("skills") or [])
check("pdf-parse: skills present", len(all_skills) > 0, f"got {all_skills}")
langs = p.get("languages") or []
check("pdf-parse: languages present", len(langs) > 0, f"got {langs}")


# ── DOCX round-trip ───────────────────────────────────────────────────────────
print("\n# 3. DOCX export → parse round-trip")
docx_bytes = to_docx(PROFILE)
check("docx: produced bytes", len(docx_bytes) > 5000, f"got {len(docx_bytes)}")

docx_path = _tmp(".docx")
with open(docx_path, "wb") as f:
    f.write(docx_bytes)

result_d = CVParserService.parse_cv_file(
    docx_path,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
)
check("docx-parse: success", result_d.get("success") is True, str(result_d.get("warnings")))
pd = result_d.get("parsedProfile", {})
check("docx-parse: full_name", _m("Ana Pereira", pd.get("full_name")), repr(pd.get("full_name")))
check("docx-parse: email",     _m("ana.pereira@example.com", pd.get("email")), repr(pd.get("email")))

skills_d = pd.get("skills") or []
check("docx-parse: skills present", len(skills_d) > 0, f"got {skills_d}")


# ── Summary ───────────────────────────────────────────────────────────────────
total  = len(_results)
passed = sum(1 for ok, _, _ in _results if ok)
print(f"\n{'=' * 50}")
print(f"RESULT: {passed}/{total} checks passed")
if passed < total:
    print("FAILURES:")
    for ok, name, detail in _results:
        if not ok:
            print(f"  - {name}: {detail}")
sys.exit(0 if passed == total else 1)
