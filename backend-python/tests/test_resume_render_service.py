"""Tests for resume_render_service (EXECUTION_PLAN_NATIVE_CV_BUILDER.md
Phase B1) — the Jinja2 HTML template that drives both the preview endpoint
and the WeasyPrint PDF export.

render_pdf() itself isn't exercised end-to-end here: this sandbox has no
pango/gobject native libraries (confirmed via a manual `import weasyprint`
attempt during implementation — it raises OSError trying to dlopen
libgobject-2.0), which is exactly the scenario render_pdf() is designed to
turn into a clean RuntimeError so callers fall back to reportlab. That
RuntimeError-on-missing-native-libs behavior IS tested below since it's the
actual, reproducible behavior in this environment — real PDF byte output
needs a real pango install (CI/prod, via the Dockerfile's Alpine packages).
"""
import pytest

from app.services import resume_render_service as rrs

_FULL_PROFILE = {
    "fullName": "Ana Sousa",
    "professionalTitle": "Engenheira de Software",
    "email": "ana@example.com",
    "phone": "+244 900 000 000",
    "location": "Luanda, Angola",
    "linkedinUrl": "https://linkedin.com/in/ana",
    "professionalSummary": "Engenheira com 5 anos de experiência.",
    "workExperience": [
        {
            "company": "Acme", "jobTitle": "Dev", "location": "Luanda",
            "startDate": "2020-01", "endDate": "2023-06",
            "description": "Geri uma equipa de 5. Entreguei o projeto no prazo.",
        },
        {"company": "Startup Co", "jobTitle": "Junior Dev", "startDate": "2022-01", "current": True},
    ],
    "education": [
        {"institution": "UAN", "location": "Luanda", "degree": "Licenciatura", "fieldOfStudy": "Informática", "startDate": "2015-09", "endDate": "2019-07"},
    ],
    "hardSkills": ["Python", "SQL"],
    "techniques": ["Scrum"],
    "tools": ["Docker"],
    "languages": ["Português", "Inglês"],
    "certifications": ["AWS Certified"],
}


def test_render_html_includes_all_sections_for_a_full_profile():
    html = rrs.render_html(_FULL_PROFILE)
    assert "Ana Sousa" in html
    assert "Engenheira de Software" in html
    assert "Resumo Profissional" in html
    assert "Experiência Profissional" in html
    assert "Acme, Luanda" in html
    assert "01/2020 – 06/2023" in html
    assert "Presente" in html  # current position, no endDate
    assert "Formação Académica" in html
    assert "UAN, Luanda" in html
    assert "Competências" in html
    assert "Python, SQL" in html
    assert "Idiomas" in html
    assert "Certificações" in html
    assert "AWS Certified" in html


def test_render_html_on_empty_profile_still_renders_placeholder_name():
    html = rrs.render_html({})
    assert "Nome do Candidato" in html
    assert "Resumo Profissional" not in html
    assert "Experiência Profissional" not in html


def test_render_html_never_crashes_on_malformed_data():
    html = rrs.render_html({"workExperience": "not-a-list", "education": None, "hardSkills": 42})
    assert "Nome do Candidato" in html


def test_render_html_escapes_user_supplied_html():
    """Resume fields are candidate-supplied free text, and B3 will serve
    this same HTML to unauthenticated visitors — an unescaped field is a
    stored-XSS vector, so autoescape must actually be on."""
    html = rrs.render_html({
        "fullName": "<script>alert(1)</script>",
        "professionalSummary": "A & B <b>bold</b>",
    })
    assert "<script>" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "A &amp; B &lt;b&gt;bold&lt;/b&gt;" in html


def test_render_html_falls_back_to_default_template_for_unknown_slug():
    html_known = rrs.render_html(_FULL_PROFILE, "ats-classic")
    html_unknown = rrs.render_html(_FULL_PROFILE, "some-slug-that-does-not-exist")
    assert html_known == html_unknown


def test_moderno_template_renders_all_sections_with_distinct_styling():
    html = rrs.render_html(_FULL_PROFILE, "moderno")
    assert "Ana Sousa" in html
    assert "Experiência Profissional" in html
    assert "Formação Académica" in html
    assert "AWS Certified" in html
    assert html != rrs.render_html(_FULL_PROFILE, "ats-classic")
    assert "#dc2626" in html  # the moderno accent, proving its CSS was used


def test_executivo_template_renders_sidebar_and_main_column():
    html = rrs.render_html(_FULL_PROFILE, "executivo")
    assert 'class="side"' in html and 'class="main"' in html
    assert "Ana Sousa" in html
    assert "Contacto" in html
    assert "+244 900 000 000" in html  # individual contact_parts, not the joined line
    assert "Experiência Profissional" in html
    assert "AWS Certified" in html


def test_every_template_escapes_user_supplied_html():
    payload = {"fullName": "<script>alert(1)</script>", "certifications": ["<img src=x onerror=alert(1)>"]}
    for slug in rrs.TEMPLATES:
        html = rrs.render_html(payload, slug)
        assert "<script>" not in html, f"unescaped <script> in template {slug}"
        assert "<img" not in html, f"unescaped <img> in template {slug}"


def test_every_template_has_page_break_rules():
    """A4 print-correctness (plan B2): every template must carry the shared
    break-inside/break-after rules so multi-page CVs paginate cleanly."""
    for slug in rrs.TEMPLATES:
        html = rrs.render_html(_FULL_PROFILE, slug)
        assert "break-inside: avoid" in html, f"missing break-inside rule in {slug}"
        assert 'class="entry"' in html, f"entries not wrapped for pagination in {slug}"


def test_render_pdf_raises_runtime_error_when_native_libs_unavailable():
    """This sandbox has weasyprint installed but no pango/gobject native
    libs — the realistic "package present, native deps missing" failure
    mode. render_pdf() must normalize that into RuntimeError, not let a raw
    OSError/ImportError escape, since callers (resumes.py's export
    endpoint) catch Exception to fall back to reportlab."""
    with pytest.raises(RuntimeError):
        rrs.render_pdf(_FULL_PROFILE)
