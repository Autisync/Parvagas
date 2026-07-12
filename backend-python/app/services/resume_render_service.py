"""WeasyPrint-driven resume rendering (EXECUTION_PLAN_NATIVE_CV_BUILDER.md
Phase B). The same Jinja2 HTML/CSS template renders both the browser
preview (GET /resumes/{id}/preview.html) and the exported PDF — the
single-source contract that guarantees preview=PDF parity, unlike Phase A's
reportlab path where the frontend's AtsClassic.tsx and this backend's
cv_export_service.to_pdf() are two hand-maintained implementations of the
same look.

Autoescape is mandatory here, not optional: resume field values are
candidate-supplied free text, and B3 will serve this same HTML to
unauthenticated visitors on a public share page — an unescaped fullName or
summary field would be a straightforward stored-XSS vector. Only the
hardcoded per-template CSS constant is marked `| safe`; every value derived
from `profile` goes through Jinja2's default auto-escaping.
"""
from __future__ import annotations

from typing import Any

from jinja2 import Environment, select_autoescape

from app.core.logging import get_logger
from app.services.cv_export_service import _fmt_range, _list, _list_of_dicts, _s

logger = get_logger(__name__)

_jinja_env = Environment(autoescape=select_autoescape(["html", "xml"]))

# A4 print-correctness rules shared by every template: each experience/
# education entry is wrapped in <div class="entry"> so `break-inside: avoid`
# keeps a header from stranding at the bottom of a page while its bullets
# spill to the next — the classic multi-page-CV pagination bug.
_PRINT_RULES = """
  @page { size: A4; margin: 15mm 20mm; }
  .entry { break-inside: avoid; page-break-inside: avoid; }
  h2 { break-after: avoid; page-break-after: avoid; }
"""

_ATS_CLASSIC_CSS = _PRINT_RULES + """
  body { font-family: 'DejaVu Sans', Helvetica, Arial, sans-serif; color: #1a1a2e; font-size: 10.5pt; }
  h1 { text-align: center; font-size: 20pt; margin: 0 0 4pt; color: #1a1a2e; }
  .title { text-align: center; font-size: 11pt; color: #555555; margin: 0 0 2pt; }
  .contact { text-align: center; font-size: 8.5pt; color: #555555; margin: 0 0 10pt; }
  h2 { font-size: 10pt; color: #8B0000; margin: 10pt 0 3pt; text-transform: uppercase; letter-spacing: 0.5pt; }
  hr { border: none; border-top: 0.5pt solid #CCCCCC; margin: 0 0 4pt; }
  .entry-header { font-size: 10pt; font-weight: bold; margin: 4pt 0 1pt; }
  .entry-header .range { font-weight: normal; color: #555555; }
  .entry-sub { font-size: 9pt; font-style: italic; color: #555555; margin: 0 0 1pt; }
  p, li { font-size: 9pt; margin: 0 0 1pt; line-height: 1.3; }
  ul { margin: 0 0 1pt; padding-left: 12pt; }
"""

# "Moderno" shares the single-column HTML skeleton — only the CSS differs:
# left-aligned header, Parvagas-red accent bar on section headings, no hr.
_MODERNO_CSS = _PRINT_RULES + """
  body { font-family: 'DejaVu Sans', Helvetica, Arial, sans-serif; color: #1f2937; font-size: 10.5pt; }
  h1 { text-align: left; font-size: 22pt; margin: 0 0 2pt; color: #111827; }
  .title { text-align: left; font-size: 11pt; color: #dc2626; font-weight: bold; margin: 0 0 2pt; }
  .contact { text-align: left; font-size: 8.5pt; color: #6b7280; margin: 0 0 12pt; }
  h2 { font-size: 10.5pt; color: #111827; margin: 12pt 0 4pt; text-transform: uppercase;
       letter-spacing: 1pt; border-left: 3pt solid #dc2626; padding-left: 6pt; }
  hr { display: none; }
  .entry-header { font-size: 10pt; font-weight: bold; margin: 5pt 0 1pt; color: #111827; }
  .entry-header .range { font-weight: normal; color: #6b7280; }
  .entry-sub { font-size: 9pt; color: #dc2626; margin: 0 0 1pt; }
  p, li { font-size: 9pt; margin: 0 0 1pt; line-height: 1.35; }
  ul { margin: 0 0 1pt; padding-left: 12pt; }
"""

_SINGLE_COLUMN_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><style>{{ css | safe }}</style></head>
<body>
  <h1>{{ full_name }}</h1>
  {% if title %}<p class="title">{{ title }}</p>{% endif %}
  {% if contact %}<p class="contact">{{ contact }}</p>{% endif %}

  {% if summary %}
  <h2>Resumo Profissional</h2><hr>
  <p>{{ summary }}</p>
  {% endif %}

  {% if experience %}
  <h2>Experiência Profissional</h2><hr>
  {% for exp in experience %}
  <div class="entry">
    <p class="entry-header">{{ exp.company_loc }}{% if exp.range %} <span class="range">— {{ exp.range }}</span>{% endif %}</p>
    {% if exp.job_title %}<p class="entry-sub">{{ exp.job_title }}</p>{% endif %}
    {% if exp.bullets %}<ul>{% for b in exp.bullets %}<li>{{ b }}</li>{% endfor %}</ul>{% endif %}
  </div>
  {% endfor %}
  {% endif %}

  {% if education %}
  <h2>Formação Académica</h2><hr>
  {% for edu in education %}
  <div class="entry">
    <p class="entry-header">{{ edu.inst_loc }}{% if edu.range %} <span class="range">— {{ edu.range }}</span>{% endif %}</p>
    {% if edu.degree_field %}<p class="entry-sub">{{ edu.degree_field }}</p>{% endif %}
  </div>
  {% endfor %}
  {% endif %}

  {% if hard_skills or techniques or tools %}
  <h2>Competências</h2><hr>
  {% if hard_skills %}<p><b>Hard Skills:</b> {{ hard_skills }}</p>{% endif %}
  {% if techniques %}<p><b>Técnicas:</b> {{ techniques }}</p>{% endif %}
  {% if tools %}<p><b>Ferramentas:</b> {{ tools }}</p>{% endif %}
  {% endif %}

  {% if languages %}
  <h2>Idiomas</h2><hr>
  <p>{{ languages }}</p>
  {% endif %}

  {% if certifications %}
  <h2>Certificações</h2><hr>
  <ul>{% for c in certifications %}<li>{{ c }}</li>{% endfor %}</ul>
  {% endif %}
</body></html>
"""

# "Executivo": two-column with a dark sidebar (contact/skills/languages/
# certifications) and a main column (summary/experience/education). Laid out
# with a table, not flexbox — table layout is the most reliably-paginated
# multi-column primitive in WeasyPrint, and it degrades identically in the
# editor's iframe preview.
_EXECUTIVO_CSS = _PRINT_RULES + """
  body { font-family: 'DejaVu Sans', Helvetica, Arial, sans-serif; color: #1f2937; font-size: 10pt; margin: 0; }
  table.layout { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; }
  td.side { width: 34%; background: #1e293b; color: #e2e8f0; padding: 12pt 10pt; }
  td.main { width: 66%; padding: 12pt 0 12pt 14pt; }
  h1 { font-size: 18pt; margin: 0 0 2pt; color: #ffffff; }
  .title { font-size: 10pt; color: #94a3b8; margin: 0 0 10pt; }
  .side h2 { font-size: 9pt; color: #f8fafc; margin: 10pt 0 3pt; text-transform: uppercase;
             letter-spacing: 1pt; border-bottom: 0.5pt solid #475569; padding-bottom: 2pt; }
  .side p, .side li { font-size: 8.5pt; color: #cbd5e1; margin: 0 0 2pt; line-height: 1.35; }
  .side ul { margin: 0; padding-left: 10pt; }
  .main h2 { font-size: 10.5pt; color: #1e293b; margin: 10pt 0 3pt; text-transform: uppercase;
             letter-spacing: 0.5pt; border-bottom: 1pt solid #1e293b; padding-bottom: 2pt; }
  .entry-header { font-size: 10pt; font-weight: bold; margin: 5pt 0 1pt; }
  .entry-header .range { font-weight: normal; color: #64748b; }
  .entry-sub { font-size: 9pt; font-style: italic; color: #64748b; margin: 0 0 1pt; }
  .main p, .main li { font-size: 9pt; margin: 0 0 1pt; line-height: 1.35; }
  .main ul { margin: 0 0 1pt; padding-left: 12pt; }
"""

_EXECUTIVO_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><style>{{ css | safe }}</style></head>
<body>
<table class="layout"><tr>
  <td class="side">
    <h1>{{ full_name }}</h1>
    {% if title %}<p class="title">{{ title }}</p>{% endif %}

    {% if contact_parts %}
    <h2>Contacto</h2>
    {% for part in contact_parts %}<p>{{ part }}</p>{% endfor %}
    {% endif %}

    {% if hard_skills or techniques or tools %}
    <h2>Competências</h2>
    {% if hard_skills %}<p><b>Hard Skills:</b> {{ hard_skills }}</p>{% endif %}
    {% if techniques %}<p><b>Técnicas:</b> {{ techniques }}</p>{% endif %}
    {% if tools %}<p><b>Ferramentas:</b> {{ tools }}</p>{% endif %}
    {% endif %}

    {% if languages %}
    <h2>Idiomas</h2>
    <p>{{ languages }}</p>
    {% endif %}

    {% if certifications %}
    <h2>Certificações</h2>
    <ul>{% for c in certifications %}<li>{{ c }}</li>{% endfor %}</ul>
    {% endif %}
  </td>
  <td class="main">
    {% if summary %}
    <h2>Resumo Profissional</h2>
    <p>{{ summary }}</p>
    {% endif %}

    {% if experience %}
    <h2>Experiência Profissional</h2>
    {% for exp in experience %}
    <div class="entry">
      <p class="entry-header">{{ exp.company_loc }}{% if exp.range %} <span class="range">— {{ exp.range }}</span>{% endif %}</p>
      {% if exp.job_title %}<p class="entry-sub">{{ exp.job_title }}</p>{% endif %}
      {% if exp.bullets %}<ul>{% for b in exp.bullets %}<li>{{ b }}</li>{% endfor %}</ul>{% endif %}
    </div>
    {% endfor %}
    {% endif %}

    {% if education %}
    <h2>Formação Académica</h2>
    {% for edu in education %}
    <div class="entry">
      <p class="entry-header">{{ edu.inst_loc }}{% if edu.range %} <span class="range">— {{ edu.range }}</span>{% endif %}</p>
      {% if edu.degree_field %}<p class="entry-sub">{{ edu.degree_field }}</p>{% endif %}
    </div>
    {% endfor %}
    {% endif %}
  </td>
</tr></table>
</body></html>
"""

# slug -> (html template string, css string). All templates consume the same
# _context_from_profile() context so the preview=PDF contract holds for
# every template, not just the default.
TEMPLATES: dict[str, tuple[str, str]] = {
    "ats-classic": (_SINGLE_COLUMN_HTML, _ATS_CLASSIC_CSS),
    "moderno": (_SINGLE_COLUMN_HTML, _MODERNO_CSS),
    "executivo": (_EXECUTIVO_HTML, _EXECUTIVO_CSS),
}
DEFAULT_TEMPLATE_SLUG = "ats-classic"


def _context_from_profile(profile: dict[str, Any]) -> dict[str, Any]:
    """Same field extraction as cv_export_service.to_pdf(), reshaped for
    template consumption instead of reportlab flowables."""
    full_name = _s(profile.get("fullName") or profile.get("full_name")) or "Nome do Candidato"
    title = _s(profile.get("professionalTitle") or profile.get("jobTitle") or profile.get("job_title"))
    email = _s(profile.get("email"))
    phone = _s(profile.get("phone"))
    location = _s(profile.get("location"))
    linkedin = _s(profile.get("linkedinUrl") or profile.get("linkedin_url"))
    contact_parts = [p for p in [location, phone, email, linkedin] if p]
    contact = "  |  ".join(contact_parts)

    summary = _s(profile.get("professionalSummary") or profile.get("professional_summary") or profile.get("summary"))

    experience = []
    for exp in _list_of_dicts(profile.get("workExperience") or profile.get("work_experience") or profile.get("experience")):
        company = _s(exp.get("company"))
        loc = _s(exp.get("location"))
        company_loc = f"{company}, {loc}" if loc and company else (company or loc)
        desc = _s(exp.get("description"))
        bullets = [b.strip().rstrip(".") + "." for b in desc.split(". ") if b.strip()] if desc else []
        experience.append({
            "company_loc": company_loc,
            "job_title": _s(exp.get("jobTitle") or exp.get("role")),
            "range": _fmt_range(
                _s(exp.get("startDate") or exp.get("start_date")),
                _s(exp.get("endDate") or exp.get("end_date")),
                bool(exp.get("current")),
            ),
            "bullets": bullets,
        })

    education = []
    for edu in _list_of_dicts(profile.get("education")):
        institution = _s(edu.get("institution"))
        loc = _s(edu.get("location"))
        inst_loc = f"{institution}, {loc}" if loc and institution else (institution or loc)
        degree = _s(edu.get("degree"))
        field = _s(edu.get("fieldOfStudy") or edu.get("field_of_study"))
        education.append({
            "inst_loc": inst_loc,
            "degree_field": " – ".join(p for p in [degree, field] if p),
            "range": _fmt_range(
                _s(edu.get("startDate") or edu.get("start_date")),
                _s(edu.get("endDate") or edu.get("end_date")),
            ),
        })

    hard = _list(profile.get("hardSkills") or profile.get("hard_skills"))
    techniques = _list(profile.get("techniques"))
    tools = _list(profile.get("tools"))
    if not (hard or techniques or tools):
        hard = _list(profile.get("skills"))

    return {
        "full_name": full_name,
        "title": title,
        "contact": contact,
        "contact_parts": contact_parts,
        "summary": summary,
        "experience": experience,
        "education": education,
        "hard_skills": ", ".join(hard),
        "techniques": ", ".join(techniques),
        "tools": ", ".join(tools),
        "languages": ", ".join(_list(profile.get("languages"))),
        "certifications": _list(profile.get("certifications")),
    }


def render_html(profile: dict[str, Any], template_slug: str | None = None) -> str:
    """Render a resume profile dict to a full standalone HTML document."""
    slug = template_slug if template_slug in TEMPLATES else DEFAULT_TEMPLATE_SLUG
    html_tpl, css = TEMPLATES[slug]
    context = _context_from_profile(profile)
    context["css"] = css
    return _jinja_env.from_string(html_tpl).render(**context)


def render_pdf(profile: dict[str, Any], template_slug: str | None = None) -> bytes:
    """Render via WeasyPrint. Always raises RuntimeError if WeasyPrint can't
    produce a PDF — callers should catch this and fall back to
    cv_export_service.to_pdf() (see resumes.py's export endpoint).

    Two distinct failure modes observed in practice, both normalized here:
    ImportError (package not installed) and OSError (package installed but
    the native pango/gobject shared libraries it dlopen()s at import time
    aren't on the system — e.g. this happens on a plain macOS dev machine
    with no Homebrew pango, and would happen in prod if the Dockerfile's
    Alpine `so:` packages were ever missing)."""
    try:
        from weasyprint import HTML
    except (ImportError, OSError) as exc:
        raise RuntimeError("weasyprint is unavailable (not installed or missing native libs)") from exc

    html = render_html(profile, template_slug)
    return HTML(string=html).write_pdf()
