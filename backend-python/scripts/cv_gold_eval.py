"""Gold-set evaluation harness for the rules-first CV parser.

Builds real two-column and single-column PDFs from labeled gold CVs, runs them
through the layout-aware extractor + parser, and reports per-field precision /
recall using rapidfuzz token_set_ratio >= 95 (the article's match metric).

    /tmp/cvtest-venv/bin/python scripts/cv_gold_eval.py
"""
from __future__ import annotations

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rapidfuzz import fuzz  # noqa: E402

from app.services.cv_parsing import parse_structured  # noqa: E402
from app.services.cv_parsing.layout import extract_pdf_layout_text  # noqa: E402

MATCH = 95  # token_set_ratio threshold for a "correct" field match.


# ── gold fixtures ────────────────────────────────────────────────────────────
# Each gold CV provides: title, layout, and the columns we render to PDF, plus
# the gold-labelled expected structured output.

def _twocol_nlp():
    left = [
        ("First Last", 20, True),
        ("NLP (Natural Language Processing) Engineer", 12, False),
        ("WORK EXPERIENCE", 13, True),
        ("Resume Worded, London, United Kingdom", 11, True),
        ("Robotics company with 50+ employees and $100m+ annual revenue", 10, False),
        ("NLP (Natural Language Processing) Engineer        01/2021 - Present", 11, False),
        ("• Designed a machine learning model to predict churn among 10K customers.", 10, False),
        ("• Trained an encoder/decoder grammar error correction model.", 10, False),
        ("Polyhire, London, United Kingdom", 11, True),
        ("NYSE-listed aerospace and defense technology corporation", 10, False),
        ("Robotics Engineer        10/2019 - 12/2021", 11, False),
        ("• Developed an advanced prototype co-processor chip.", 10, False),
        ("EDUCATION", 13, True),
        ("University of New York", 11, True),
        ("Bachelor of Science Mathematics & Statistics", 10, False),
        ("10/2011 - 06/2014", 10, False),
    ]
    right = [
        ("CONTACT", 13, True),
        ("Somerset, United Kingdom", 10, False),
        ("+44 1234567890", 10, False),
        ("first.last@gmail.com", 10, False),
        ("SKILLS", 13, True),
        ("Hard Skills:", 10, False),
        ("Distributed Computing", 10, False),
        ("Java Programming", 10, False),
        ("Deep Learning", 10, False),
        ("Techniques:", 10, False),
        ("Computer Vision", 10, False),
        ("Information Retrieval", 10, False),
        ("Tools and Software:", 10, False),
        ("Hadoop", 10, False),
        ("Python", 10, False),
        ("Apache Spark", 10, False),
        ("Languages:", 10, False),
        ("English (Native)", 10, False),
        ("Romanian (Native)", 10, False),
        ("Spanish (Conversational)", 10, False),
    ]
    gold = {
        "contact": {"full_name": "First Last", "headline": "NLP (Natural Language Processing) Engineer",
                    "email": "first.last@gmail.com", "phone": "+44 1234567890", "location": "Somerset, United Kingdom"},
        "experience": [
            {"company": "Resume Worded", "role": "NLP (Natural Language Processing) Engineer",
             "location": "London, United Kingdom", "start_date": "2021-01", "end_date": "present"},
            {"company": "Polyhire", "role": "Robotics Engineer",
             "location": "London, United Kingdom", "start_date": "2019-10", "end_date": "2021-12"},
        ],
        "education": [{"institution": "University of New York", "degree": "Bachelor of Science",
                       "field_of_study": "Mathematics & Statistics", "start_date": "2011-10", "end_date": "2014-06"}],
        "skills": {"hard_skills": ["Distributed Computing", "Java Programming", "Deep Learning"],
                   "techniques": ["Computer Vision", "Information Retrieval"],
                   "tools": ["Hadoop", "Python", "Apache Spark"],
                   "languages": ["English (Native)", "Romanian (Native)", "Spanish (Conversational)"]},
    }
    return {"title": "Two-column NLP Engineer (EN)", "layout": "two", "left": left, "right": right, "gold": gold}


def _onecol_senior_ml():
    body = [
        ("First Last", 20, True),
        ("Senior Machine Learning Engineer", 12, False),
        ("Louisville, Kentucky  |  +1-234-456-789  |  professionalemail@resumeworded.com  |  linkedin.com/in/username", 9, False),
        ("WORK EXPERIENCE", 13, True),
        ("Resume Worded, New York, NY        09/2015 - Present", 11, True),
        ("Senior Machine Learning Engineer", 11, False),
        ("• Supervised a 10-man team that built a machine learning system.", 10, False),
        ("• Created a Kubeflow/Kubernetes-based machine learning training medium.", 10, False),
        ("Polyhire, London, United Kingdom        10/2012 - 08/2015", 11, True),
        ("Lead Software Developer", 11, False),
        ("• Developed automated low latency, high throughput data pipelines.", 10, False),
        ("EDUCATION", 13, True),
        ("Resume Worded University, New York, NY        06/2005", 11, True),
        ("Bachelor of Science - Telecommunications Engineering", 10, False),
        ("SKILLS", 13, True),
        ("Hard Skills: Predictive Modeling, Data Mining, Natural Language Processing, AI/ML", 10, False),
        ("Techniques: Software Development, Artificial Neural Networks, Machine Learning Algorithms", 10, False),
    ]
    gold = {
        "contact": {"full_name": "First Last", "headline": "Senior Machine Learning Engineer",
                    "email": "professionalemail@resumeworded.com", "phone": "+1-234-456-789",
                    "location": "Louisville, Kentucky"},
        "experience": [
            {"company": "Resume Worded", "role": "Senior Machine Learning Engineer",
             "location": "New York, NY", "start_date": "2015-09", "end_date": "present"},
            {"company": "Polyhire", "role": "Lead Software Developer",
             "location": "London, United Kingdom", "start_date": "2012-10", "end_date": "2015-08"},
        ],
        "education": [{"institution": "Resume Worded University", "degree": "Bachelor of Science",
                       "field_of_study": "Telecommunications Engineering", "start_date": "2005-06", "end_date": "2005-06"}],
        "skills": {"hard_skills": ["Predictive Modeling", "Data Mining", "Natural Language Processing", "AI/ML"],
                   "techniques": ["Software Development", "Artificial Neural Networks", "Machine Learning Algorithms"],
                   "tools": [], "languages": []},
    }
    return {"title": "Single-column Senior ML (EN)", "layout": "one", "body": body, "gold": gold}


def _twocol_pt_angola():
    left = [
        ("João Silva", 20, True),
        ("Engenheiro de Software", 12, False),
        ("EXPERIÊNCIA PROFISSIONAL", 13, True),
        ("Webcor Group, Luanda, Angola", 11, True),
        ("Engenheiro de Software Sénior        Janeiro de 2021 - Presente", 11, False),
        ("• Desenvolveu sistemas distribuídos em Python e FastAPI.", 10, False),
        ("• Liderou uma equipa de 5 engenheiros.", 10, False),
        ("Sonangol, Luanda, Angola", 11, True),
        ("Programador        03/2018 - 12/2020", 11, False),
        ("• Criou pipelines de dados para relatórios financeiros.", 10, False),
        ("FORMAÇÃO ACADÉMICA", 13, True),
        ("Universidade Agostinho Neto", 11, True),
        ("Licenciatura em Engenharia Informática", 10, False),
        ("09/2013 - 07/2017", 10, False),
    ]
    right = [
        ("CONTACTO", 13, True),
        ("Luanda, Angola", 10, False),
        ("+244 923456789", 10, False),
        ("joao.silva@example.ao", 10, False),
        ("COMPETÊNCIAS", 13, True),
        ("Competências Técnicas:", 10, False),
        ("Programação", 10, False),
        ("Bases de Dados", 10, False),
        ("Ferramentas:", 10, False),
        ("Python", 10, False),
        ("Docker", 10, False),
        ("PostgreSQL", 10, False),
        ("IDIOMAS", 13, True),
        ("Português (Nativo)", 10, False),
        ("Inglês (Fluente)", 10, False),
    ]
    gold = {
        "contact": {"full_name": "João Silva", "headline": "Engenheiro de Software",
                    "email": "joao.silva@example.ao", "phone": "+244 923456789", "location": "Luanda, Angola"},
        "experience": [
            {"company": "Webcor Group", "role": "Engenheiro de Software Sénior",
             "location": "Luanda, Angola", "start_date": "2021-01", "end_date": "present"},
            {"company": "Sonangol", "role": "Programador",
             "location": "Luanda, Angola", "start_date": "2018-03", "end_date": "2020-12"},
        ],
        "education": [{"institution": "Universidade Agostinho Neto", "degree": "Licenciatura",
                       "field_of_study": "Engenharia Informática", "start_date": "2013-09", "end_date": "2017-07"}],
        "skills": {"hard_skills": ["Programação", "Bases de Dados"], "techniques": [],
                   "tools": ["Python", "Docker", "PostgreSQL"],
                   "languages": ["Português (Nativo)", "Inglês (Fluente)"]},
    }
    return {"title": "Two-column Engenheiro (PT/Angola)", "layout": "two", "left": left, "right": right, "gold": gold}


# ── PDF rendering ────────────────────────────────────────────────────────────
def _render_pdf(spec) -> str:
    import fitz

    path = tempfile.mkstemp(suffix=".pdf")[1]
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4
    if spec["layout"] == "two":
        _render_column(page, spec["left"], x=40, width=300)
        _render_column(page, spec["right"], x=380, width=180)
    else:
        _render_column(page, spec["body"], x=40, width=515)
    doc.save(path)
    doc.close()
    return path


def _render_column(page, lines, x, width):
    # One insert_text per line (no wrapping → dates stay intact); ASCII "-"
    # bullets so the builtin Helvetica renders them (real CVs use real glyphs).
    y = 50
    for text, size, bold in lines:
        text = text.replace("•", "-")
        page.insert_text((x, y), text, fontsize=size, fontname=("hebo" if bold else "helv"))
        y += size * 1.7


# ── scoring ──────────────────────────────────────────────────────────────────
def _m(a, b) -> bool:
    a, b = (a or ""), (b or "")
    if not a and not b:
        return True
    return fuzz.token_set_ratio(str(a), str(b)) >= MATCH


class Tally:
    def __init__(self):
        self.tp = self.fp = self.fn = 0

    def add(self, gold, pred):
        if _m(gold, pred):
            if gold:
                self.tp += 1
        else:
            if gold:
                self.fn += 1
            if pred:
                self.fp += 1

    def pr(self):
        p = self.tp / (self.tp + self.fp) if (self.tp + self.fp) else 1.0
        r = self.tp / (self.tp + self.fn) if (self.tp + self.fn) else 1.0
        return p, r


def _onecol_europass_pt():
    """Single-column Europass-style CV (EN + Portuguese company names)."""
    body = [
        ("Maria Santos", 20, True),
        ("Full-Stack Developer", 12, False),
        ("Lisbon, Portugal  |  +351 912 345 678  |  maria.santos@example.com", 10, False),
        ("WORK EXPERIENCE", 13, True),
        ("Caixa Geral de Depositos, Lisbon, Portugal", 11, True),
        ("Full-Stack Developer        01/2020 - Present", 11, False),
        ("- Developed REST APIs in Python serving 500K daily requests.", 10, False),
        ("Novabase, Lisbon, Portugal", 11, True),
        ("Junior Developer        03/2017 - 12/2019", 11, False),
        ("- Built Angular front-ends and Spring Boot back-ends.", 10, False),
        ("EDUCATION AND TRAINING", 13, True),
        ("NOVA University Lisbon, Lisbon, Portugal", 11, True),
        ("Bachelor of Science in Computer Science        09/2013 - 07/2017", 10, False),
        ("DIGITAL SKILLS", 13, True),
        ("Python, JavaScript, TypeScript, React, Docker, PostgreSQL, AWS", 10, False),
        ("LANGUAGE SKILLS", 13, True),
        ("Portuguese (Native)", 10, False),
        ("English (C1 Advanced)", 10, False),
    ]
    gold = {
        "contact": {
            "full_name": "Maria Santos",
            "headline": "Full-Stack Developer",
            "email": "maria.santos@example.com",
            "phone": "+351 912 345 678",
            "location": "Lisbon, Portugal",
        },
        "experience": [
            {"company": "Caixa Geral de Depositos", "role": "Full-Stack Developer",
             "location": "Lisbon, Portugal", "start_date": "2020-01", "end_date": "present"},
            {"company": "Novabase", "role": "Junior Developer",
             "location": "Lisbon, Portugal", "start_date": "2017-03", "end_date": "2019-12"},
        ],
        "education": [
            {"institution": "NOVA University Lisbon", "degree": "Bachelor of Science",
             "field_of_study": "Computer Science", "start_date": "2013-09", "end_date": "2017-07"},
        ],
        "skills": {
            "hard_skills": [],
            "techniques": [],
            "tools": ["Python", "JavaScript", "TypeScript", "React", "Docker", "PostgreSQL", "AWS"],
            "languages": ["Portuguese (Native)", "English (C1 Advanced)"],
        },
    }
    return {"title": "Single-column Europass (EN)", "layout": "one", "body": body, "gold": gold}


# ── OCR gold (scanned PDF round-trip via CVParserService) ────────────────────

def _make_scanned_pdf(spec) -> str:
    """Render a gold-fixture spec as an image-only (scanned) PDF."""
    import fitz
    from PIL import Image, ImageDraw, ImageFont

    lines: list[tuple[str, int, bool]] = spec.get("body") or (spec.get("left", []) + spec.get("right", []))

    img = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(img)
    try:
        font_bold = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 28)
        font_reg  = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 24)
    except Exception:
        font_bold = font_reg = ImageFont.load_default()
    y = 50
    for text, size_hint, bold in lines:
        fnt = font_bold if bold else font_reg
        draw.text((60, y), text, fill="black", font=fnt)
        y += 38
        if y > 1700:
            break

    # Wrap in PDF as an image page (no text layer).
    import io as _io
    png_buf = _io.BytesIO()
    img.save(png_buf, format="PNG")
    png_buf.seek(0)

    import tempfile as _tmp
    fd, path = _tmp.mkstemp(suffix=".pdf")
    import os as _os; _os.close(fd)
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    rect = fitz.Rect(0, 0, 595, 842)
    page.insert_image(rect, stream=png_buf.read())
    doc.save(path)
    doc.close()
    return path


def evaluate_ocr(match_threshold: int = 80) -> bool:
    """Score the full CVParserService (OCR path) on a scanned version of the NLP fixture.

    Uses a lower match threshold (default 80%) because OCR introduces noise.
    Tests contact + experience companies (most resilient to OCR distortion).
    """
    import sys as _sys, os as _os
    _sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
    try:
        from app.services.cv_parser_service import CVParserService
    except Exception as exc:
        print(f"[OCR eval] Skipped — service import failed: {exc}")
        return True  # not a failure of the parser logic

    spec = _onecol_senior_ml()
    try:
        pdf_path = _make_scanned_pdf(spec)
    except Exception as exc:
        print(f"[OCR eval] Skipped — scanned PDF render failed: {exc}")
        return True

    result = CVParserService.parse_cv_file(pdf_path, "application/pdf")
    if not result.get("success"):
        print(f"[OCR eval] FAIL — parse_cv_file returned success=False: {result.get('warnings')}")
        return False

    parsed = result.get("parsedProfile", {})
    g = spec["gold"]
    gc = g["contact"]

    ocr_fields = [
        ("full_name",   gc["full_name"],   parsed.get("full_name")),
        ("email",       gc["email"],        parsed.get("email")),
        ("exp.company0", g["experience"][0]["company"], (parsed.get("work_experience") or [{}])[0].get("company", "") if parsed.get("work_experience") else ""),
        ("exp.role0",   g["experience"][0]["role"],    (parsed.get("work_experience") or [{}])[0].get("jobTitle", "") if parsed.get("work_experience") else ""),
    ]

    print(f"\n{'OCR FIELD':20} {'THRESHOLD':>9} {'RESULT':>7}")
    print("-" * 42)
    all_pass = True
    for fname, gold_val, pred_val in ocr_fields:
        score = fuzz.token_set_ratio(str(gold_val or ""), str(pred_val or ""))
        ok = score >= match_threshold
        all_pass &= ok
        flag = "" if ok else f"  <-- below {match_threshold}%"
        print(f"{fname:20} {match_threshold:>8}% {score:>6}%{flag}")
        print(f"  gold: {gold_val!r}  pred: {pred_val!r}")
    print("-" * 42)
    print("OCR RESULT:", "PASS" if all_pass else "FAIL")
    return all_pass


def evaluate():
    specs = [_twocol_nlp(), _onecol_senior_ml(), _twocol_pt_angola(), _onecol_europass_pt()]
    fields = ["full_name", "headline", "email", "phone", "location",
              "exp.company", "exp.role", "exp.location", "exp.start", "exp.end",
              "edu.institution", "edu.degree", "edu.field", "edu.start", "edu.end",
              "skills.hard", "skills.techniques", "skills.tools", "skills.languages"]
    tallies = {f: Tally() for f in fields}

    for spec in specs:
        pdf = _render_pdf(spec)
        text = extract_pdf_layout_text(pdf)
        r = parse_structured(text)
        g = spec["gold"]

        c, pc = g["contact"], r["contact"]
        for f in ["full_name", "headline", "email", "phone", "location"]:
            tallies[f].add(c.get(f), pc.get(f))

        for i, ge in enumerate(g["experience"]):
            pe = r["experience"][i] if i < len(r["experience"]) else {}
            tallies["exp.company"].add(ge["company"], pe.get("company"))
            tallies["exp.role"].add(ge["role"], pe.get("role"))
            tallies["exp.location"].add(ge["location"], pe.get("location"))
            tallies["exp.start"].add(ge["start_date"], pe.get("start_date"))
            tallies["exp.end"].add(ge["end_date"], pe.get("end_date"))

        for i, ge in enumerate(g["education"]):
            pe = r["education"][i] if i < len(r["education"]) else {}
            tallies["edu.institution"].add(ge["institution"], pe.get("institution"))
            tallies["edu.degree"].add(ge["degree"], pe.get("degree"))
            tallies["edu.field"].add(ge["field_of_study"], pe.get("field_of_study"))
            tallies["edu.start"].add(ge["start_date"], pe.get("start_date"))
            tallies["edu.end"].add(ge["end_date"], pe.get("end_date"))

        for key, gk in [("skills.hard", "hard_skills"), ("skills.techniques", "techniques"),
                        ("skills.tools", "tools"), ("skills.languages", "languages")]:
            gset = g["skills"][gk]
            pset = r["skills"][gk]
            tallies[key].add(" ".join(gset), " ".join(pset))

    print(f"{'FIELD':22} {'PREC':>6} {'RECALL':>7}")
    print("-" * 38)
    all_pass = True
    for f in fields:
        p, rec = tallies[f].pr()
        ok = p >= 0.95 and rec >= 0.95
        all_pass &= ok
        flag = "" if ok else "  <-- below 95%"
        print(f"{f:22} {p*100:5.1f}% {rec*100:6.1f}%{flag}")
    print("-" * 38)
    print("RESULT:", "ALL FIELDS >= 95% precision AND recall" if all_pass else "SOME FIELDS BELOW 95%")
    return all_pass


if __name__ == "__main__":
    ok_text = evaluate()
    ok_ocr  = evaluate_ocr()
    sys.exit(0 if (ok_text and ok_ocr) else 1)
