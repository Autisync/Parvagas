"""Keyword gazetteers for CV parsing — Portuguese (Portugal + Angola) and English.

All lookups are intended to run against diacritic-free, lower-cased text via
``norm()`` so 'Educação' matches 'educacao'.
"""
from __future__ import annotations

import unicodedata


def norm(text: str) -> str:
    """Lower-case + strip diacritics for accent-insensitive matching."""
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


# ── Section headers ────────────────────────────────────────────────────────
# Canonical section → header variants (PT and EN treated as equally primary).
SECTION_HEADERS: dict[str, list[str]] = {
    "summary": [
        "resumo", "perfil", "sobre mim", "objetivo", "apresentacao",
        "summary", "profile", "professional summary", "about me", "objective",
    ],
    "experience": [
        "experiencia profissional", "experiencia", "percurso profissional",
        "historico profissional", "experiencia laboral", "atividade profissional",
        "work experience", "professional experience", "experience", "employment",
        "employment history", "relevant work experience", "previous experience",
        "work history",
    ],
    "education": [
        "formacao academica", "habilitacoes literarias", "habilitacoes academicas",
        "educacao", "formacao", "escolaridade",
        "education", "education and training", "academic background",
        "academic qualifications", "qualifications",
    ],
    "skills": [
        "competencias", "competencias tecnicas", "aptidoes", "conhecimentos",
        "competencias profissionais", "competencias digitais",
        "skills", "technical skills", "core competencies", "competencies", "expertise",
        "digital skills", "computer skills", "it skills",
    ],
    "languages": [
        "idiomas", "linguas", "competencias linguisticas",
        "languages", "language skills",
    ],
    "certifications": [
        "certificacoes", "certificados", "cursos", "formacao complementar",
        "certifications", "certificates", "licenses", "licenses & certifications",
    ],
    "projects": [
        "projetos", "projetos pessoais", "portfolio",
        "projects", "personal projects", "selected projects",
    ],
    "volunteering": [
        "voluntariado", "atividades de voluntariado", "trabalho voluntario",
        "volunteering", "volunteer experience", "volunteering activities and extracurriculars",
        "extracurriculars",
    ],
    "contact": [
        "contacto", "contactos", "informacao de contacto", "dados pessoais",
        "contact", "contact information", "personal details", "details", "other",
    ],
}

# ── Skill sub-categories (the explicit sub-labels seen inside Skills) ───────
SKILL_SUBHEADERS: dict[str, list[str]] = {
    "hard_skills": ["hard skills", "competencias tecnicas", "technical skills", "hard"],
    "techniques": ["techniques", "tecnicas", "metodologias", "methodologies"],
    "tools": [
        "tools and software", "tools & software", "tools", "ferramentas",
        "ferramentas e software", "software", "tecnologias", "technologies",
    ],
    "languages": ["languages", "idiomas", "linguas"],
}

# ── Degrees (PT + EN) → canonical label ────────────────────────────────────
DEGREE_TERMS: dict[str, str] = {
    "licenciatura": "Licenciatura",
    "bacharelato": "Bacharelato",
    "mestrado": "Mestrado",
    "mestre": "Mestrado",
    "doutoramento": "Doutoramento",
    "doutorado": "Doutoramento",
    "pos-graduacao": "Pós-Graduação",
    "pos graduacao": "Pós-Graduação",
    "mba": "MBA",
    "ensino secundario": "Ensino Secundário",
    "ensino medio": "Ensino Médio",
    "bachelor": "Bachelor",
    "bachelor of science": "Bachelor of Science",
    "bachelor of arts": "Bachelor of Arts",
    "bsc": "BSc",
    "b.sc": "BSc",
    "master": "Master",
    "master of science": "Master of Science",
    "msc": "MSc",
    "m.sc": "MSc",
    "phd": "PhD",
    "ph.d": "PhD",
    "doctorate": "Doctorate",
    "high school": "High School",
    "associate": "Associate",
    "diploma": "Diploma",
}

# ── Universities — Angola + Portugal + generic markers ─────────────────────
UNIVERSITIES: list[str] = [
    # Angola
    "universidade agostinho neto", "universidade catolica de angola",
    "universidade lusiada de angola", "universidade metodista de angola",
    "universidade jean piaget de angola", "universidade independente de angola",
    "instituto superior politecnico", "instituto superior de tecnologias",
    "universidade mandume ya ndemufayo", "universidade kimpa vita",
    "universidade onze de novembro",
    # Portugal
    "universidade de lisboa", "universidade do porto", "universidade de coimbra",
    "universidade nova de lisboa", "iscte", "instituto superior tecnico",
    "universidade do minho", "universidade de aveiro", "universidade de braga",
    "universidade catolica portuguesa", "instituto politecnico",
    # Generic markers (any language)
    "universidade", "university", "instituto", "institute", "faculdade", "faculty",
    "politecnico", "polytechnic", "college", "escola superior",
]

# ── Company legal-form suffixes (PT/AO + intl) ─────────────────────────────
COMPANY_SUFFIXES: list[str] = [
    "unipessoal lda", "lda", "s.a", "sa", "s.g.p.s", "sgps", "ltda",
    "ltd", "limited", "inc", "llc", "gmbh", "pte ltd", "corp", "co",
]

# ── Tool / software taxonomy (fallback classifier for skill bucketing) ─────
# When a Skills section has no explicit sub-labels, these names classify as
# "tools"; everything else defaults to "hard_skills".
TOOLS_TAXONOMY: set[str] = {
    norm(s) for s in [
        "python", "java", "javascript", "typescript", "c++", "c#", "go", "rust",
        "r", "sql", "scala", "kotlin", "php", "ruby", "swift",
        "react", "angular", "vue", "node", "nodejs", "django", "flask", "fastapi",
        "spring", "express", "next.js", ".net",
        "docker", "kubernetes", "git", "jenkins", "terraform", "ansible",
        "hadoop", "apache spark", "spark", "kafka", "airflow",
        "tensorflow", "pytorch", "keras", "scikit-learn", "scikit learn",
        "numpy", "pandas", "scipy", "matplotlib",
        "aws", "azure", "gcp", "google cloud", "postgresql", "postgres", "mysql",
        "mongodb", "redis", "elasticsearch", "minio",
        "excel", "power bi", "powerbi", "tableau", "figma", "photoshop", "autocad",
        "jira", "confluence", "slack", "linux",
    ]
}

# ── Proficiency markers stripped from language/skill entries when bucketing ─
PROFICIENCY_MARKERS = [
    "native", "fluent", "conversational", "basic", "intermediate", "advanced",
    "nativo", "nativa", "fluente", "avancado", "avancada", "intermedio",
    "intermediario", "basico", "elementar", "proficiente", "experienced",
]


def detect_section(line: str) -> str | None:
    """Return the canonical section name if ``line`` is a section header."""
    n = norm(line).strip(" :.-—|\t")
    if not n or len(n) > 45:
        return None
    for canonical, variants in SECTION_HEADERS.items():
        if n in variants:
            return canonical
    # Allow a header that is a variant followed by nothing meaningful.
    for canonical, variants in SECTION_HEADERS.items():
        if any(n == v for v in variants):
            return canonical
    return None


def detect_skill_subheader(line: str) -> str | None:
    """Return the skill bucket if ``line`` is a skills sub-label."""
    n = norm(line).strip(" :.-—|\t")
    if not n or len(n) > 30:
        return None
    for bucket, variants in SKILL_SUBHEADERS.items():
        if n in variants:
            return bucket
    return None
