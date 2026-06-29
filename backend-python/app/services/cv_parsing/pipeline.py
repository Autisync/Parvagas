"""Rules-first CV parsing pipeline (Portuguese + English).

divide-and-conquer:
  1. language detection (whole doc, best-effort)
  2. section segmentation by PT/EN header keywords
  3. per-section handlers (contact, experience, education, skills, …)

Produces a structured dict; ``to_parsed_profile()`` maps it onto the existing
``ParsedCVProfile`` shape for backward compatibility with the current pipeline.
"""
from __future__ import annotations

import re
from typing import Any

from .dates import normalize_date, parse_date_range
from .gazetteers import (
    DEGREE_TERMS,
    PROFICIENCY_MARKERS,
    TOOLS_TAXONOMY,
    UNIVERSITIES,
    detect_section,
    detect_skill_subheader,
    norm,
)

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE = re.compile(r"(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){1,4}\d{2,4}")
_LINKEDIN = re.compile(r"(?:https?://)?(?:www\.)?linkedin\.com/[^\s,;]+", re.I)
_GITHUB = re.compile(r"(?:https?://)?(?:www\.)?github\.com/[^\s,;]+", re.I)
_URL = re.compile(r"(?:https?://)?(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:/[^\s,;]*)?", re.I)
_DATE_RANGE = re.compile(
    r"((?:\d{1,2}[/.]\d{4})|(?:[A-Za-zÀ-ÿ]{3,9}\.?\s*(?:de\s+)?\d{4})|(?:\b\d{4}\b))"
    r"\s*[-–—]\s*"
    r"((?:\d{1,2}[/.]\d{4})|(?:[A-Za-zÀ-ÿ]{3,9}\.?\s*(?:de\s+)?\d{4})|(?:\b\d{4}\b)|"
    r"(?:[Pp]resent\w*)|(?:[Aa]tual\w*)|(?:[Cc]urrent)|(?:até à data))",
)
_BULLET = re.compile(r"^\s*[•·▪◦‣*\-–]\s+")

_IGNORE_NAME_HINTS = {
    "curriculum", "curriculo", "resume", "cv", "contacto", "contato",
    "perfil", "profile", "experiencia", "education", "educacao",
}


def detect_language(text: str) -> str:
    try:
        from langdetect import detect, DetectorFactory

        DetectorFactory.seed = 0
        lang = detect(text[:4000])
        return "pt" if lang == "pt" else ("en" if lang == "en" else lang)
    except Exception:
        # Heuristic fallback: count distinctly-PT tokens.
        pt_markers = ("experiência", "formação", "competências", "licenciatura", "português", "ç", "ã")
        return "pt" if any(m in text.lower() for m in pt_markers) else "en"


# ── segmentation ───────────────────────────────────────────────────────────
def segment_sections(text: str) -> tuple[list[str], dict[str, list[str]]]:
    """Split lines into a leading header block + named sections."""
    lines = [ln.rstrip() for ln in text.split("\n")]
    header: list[str] = []
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        sec = detect_section(line)
        if sec:
            current = sec
            sections.setdefault(current, [])
            continue
        if current is None:
            header.append(line)
        else:
            sections[current].append(line)
    return header, sections


# ── contact ────────────────────────────────────────────────────────────────
def _looks_like_name(line: str) -> bool:
    parts = [p for p in re.split(r"\s+", line.strip()) if p]
    if not (2 <= len(parts) <= 4):
        return False
    if any(tok in norm(line) for tok in _IGNORE_NAME_HINTS):
        return False
    return all(re.match(r"^[A-Za-zÀ-ÖØ-öø-ÿ'`.-]+$", p) for p in parts)


def parse_contact(header: list[str], contact_lines: list[str]) -> dict[str, Any]:
    blob = "\n".join(header + contact_lines)
    out: dict[str, Any] = {"full_name": None, "headline": None, "email": None,
                           "phone": None, "location": None, "links": []}

    em = _EMAIL.search(blob)
    if em:
        out["email"] = em.group(0)
    for rx, label in ((_LINKEDIN, "linkedin"), (_GITHUB, "github")):
        m = rx.search(blob)
        if m:
            out["links"].append(m.group(0).rstrip("/"))

    # Name = first header line that looks like a person's name.
    for line in header[:5]:
        if _looks_like_name(line):
            out["full_name"] = line.strip()
            break
    # Headline = the line immediately after the name (title), if not contact-ish.
    if out["full_name"] and out["full_name"] in header:
        idx = header.index(out["full_name"])
        for cand in header[idx + 1: idx + 3]:
            if _EMAIL.search(cand) or _PHONE.fullmatch(cand.strip()) or _URL.search(cand):
                continue
            if len(cand) <= 60 and cand[:1].isalpha():
                out["headline"] = cand.strip()
                break

    # Explode lines on inline separators ("City • +351 … • email • linkedin"),
    # so a single combined contact line still yields each field.
    pieces: list[str] = []
    for line in header + contact_lines:
        for piece in re.split(r"\s*[•·|│]\s*", line):
            piece = piece.strip().lstrip("•·-* ")
            if piece:
                pieces.append(piece)

    # Phone: the piece that is mostly digits/+()-.
    for cand in pieces:
        if _EMAIL.search(cand) or "linkedin" in cand.lower() or "github" in cand.lower():
            continue
        digits = sum(c.isdigit() for c in cand)
        if digits >= 7 and digits / max(len(cand), 1) > 0.4:
            m = _PHONE.search(cand)
            if m:
                out["phone"] = m.group(0).strip()
                break

    # Location: a piece with a comma that isn't email/phone/url/name.
    for cand in pieces:
        low = cand.lower()
        if _EMAIL.search(cand) or "linkedin" in low or "github" in low or "http" in low:
            continue
        if sum(c.isdigit() for c in cand) > 4:
            continue
        if "," in cand and 3 <= len(cand) <= 60 and not _looks_like_name(cand):
            out["location"] = cand
            break
    return out


# ── experience / education ──────────────────────────────────────────────────
def _extract_dates(text: str) -> tuple[str | None, str | None]:
    m = _DATE_RANGE.search(text)
    if m:
        return parse_date_range(m.group(0))
    return None, None


def _anchor_entries(lines: list[str]) -> list[dict[str, Any]]:
    """Split a dated section into entries anchored on each date-range line.

    Layout assumed (the dominant CV shape):
        Company, Location          <- header (above anchor)
        Optional description        <- header (above anchor)
        Role            DATES       <- ANCHOR line
        • bullet                    <- bullets (below anchor)
    The company/role sit around the date anchor, NOT on separate broken entries.
    """
    anchors = [i for i, ln in enumerate(lines) if _DATE_RANGE.search(ln)]
    if not anchors:
        return []
    entries: list[dict[str, Any]] = []
    for idx, a in enumerate(anchors):
        line = lines[a]
        start, end = parse_date_range(_DATE_RANGE.search(line).group(0))
        role = _DATE_RANGE.sub("", line).strip(" ,·•–-—\t") or None

        # Header lines = contiguous non-bullet lines above the anchor, stopping
        # at a bullet (end of previous entry) or the previous anchor.
        lo = anchors[idx - 1] + 1 if idx > 0 else 0
        header_lines: list[str] = []
        for j in range(a - 1, lo - 1, -1):
            if _BULLET.match(lines[j]):
                break
            header_lines.insert(0, lines[j].strip())

        # Below the anchor: non-bullet lines (e.g. a role on its own line) then
        # bullet lines, until the next anchor's header.
        hi = anchors[idx + 1] if idx + 1 < len(anchors) else len(lines)
        below_nonbullet: list[str] = []
        bullets: list[str] = []
        for k in range(a + 1, hi):
            if _BULLET.match(lines[k]):
                bullets.append(_BULLET.sub("", lines[k]).strip())
            elif not bullets:  # non-bullet lines only count before bullets start
                below_nonbullet.append(lines[k].strip())

        entries.append({
            "header_lines": header_lines, "role": role, "below_nonbullet": below_nonbullet,
            "start_date": start, "end_date": end, "bullets": bullets,
        })
    return entries


def _split_company(line: str) -> tuple[str | None, str | None]:
    bits = [b.strip() for b in line.split(",")]
    if len(bits) == 1:
        return bits[0] or None, None
    return bits[0] or None, ", ".join(bits[1:]) or None


def parse_experience(lines: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for e in _anchor_entries(lines):
        header_lines = e["header_lines"]
        anchor_role = e["role"]  # text on the date line minus the date
        company = location = role = None

        # Structure B: the date line itself is "Company, Location  DATES" — the
        # role then sits on the line BELOW the anchor.
        if anchor_role and "," in anchor_role:
            company, location = _split_company(anchor_role)
            role = e["below_nonbullet"][0] if e["below_nonbullet"] else None
        else:
            # Structure A: the date line is the role; company is a header above.
            role = anchor_role
            comp_line = next((h for h in header_lines if "," in h), header_lines[0] if header_lines else None)
            if comp_line:
                company, location = _split_company(comp_line)
            if not role:  # role not on the date line and not a header → use below
                role = e["below_nonbullet"][0] if e["below_nonbullet"] else \
                    next((h for h in header_lines if h != comp_line), None)
        out.append({
            "company": company, "role": role, "location": location,
            "start_date": e["start_date"], "end_date": e["end_date"], "bullets": e["bullets"],
        })
    return out


def _find_degree(text: str) -> str | None:
    low = norm(text)
    for key in sorted(DEGREE_TERMS, key=len, reverse=True):
        if key in low:
            return DEGREE_TERMS[key]
    return None


_EDU_FIELD_SPLIT = re.compile(
    r"(?:bacharelato|licenciatura|mestrado|doutoramento|pos-?graduacao|"
    r"bachelor(?:\s+of\s+\w+)?|master(?:\s+of\s+\w+)?|bsc|msc|ph\.?d|mba|diploma)"
    r"\s*(?:[-–—]|\bin\b|\bem\b|\bof\b|\bde\b)?\s*",
    re.I,
)


def _education_entry(block_lines: list[str], start: str | None, end: str | None) -> dict[str, Any]:
    """Build one education entry from its lines (+ optional dates)."""
    joined = " | ".join(block_lines)
    # Date may be a single token on its own line (e.g. "06/2005" or "2011").
    if not start and not end:
        for ln in block_lines:
            d = normalize_date(ln)
            if d and d != "present":
                start = end = d
                break
    institution = location = None
    for ln in block_lines:
        if any(u in norm(ln) for u in UNIVERSITIES):
            inst_part = re.split(r"\s{2,}|\t", ln.strip())[0]
            institution, location = _split_company(inst_part)
            break
    if not institution and block_lines:
        inst_part = re.split(r"\s{2,}|\t", block_lines[0].strip())[0]
        institution, location = _split_company(inst_part)
    degree = _find_degree(joined)
    # Field = text after the degree phrase / dash (strip the degree itself).
    field = None
    for ln in block_lines:
        if _find_degree(ln):
            parts = _EDU_FIELD_SPLIT.split(ln, maxsplit=1)
            if len(parts) > 1 and parts[1].strip():
                field = re.split(r"\s{2,}|\t|\|", parts[1].strip())[0].strip(" ,-|")
            break
    return {"institution": institution, "degree": degree, "field_of_study": field,
            "location": location, "start_date": start, "end_date": end}


def parse_education(lines: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    entries = _anchor_entries(lines)
    if entries:
        for e in entries:
            block = (e["header_lines"] or []) + ([e["role"]] if e["role"] else []) + e["below_nonbullet"]
            out.append(_education_entry(block, e["start_date"], e["end_date"]))
        return out

    # No date ranges: split into entries on lines that look like an institution
    # (gazetteer hit), each carrying the following lines until the next one.
    block_lines = [ln for ln in lines if not _BULLET.match(ln)]
    groups: list[list[str]] = []
    for ln in block_lines:
        if any(u in norm(ln) for u in UNIVERSITIES) or not groups:
            groups.append([ln])
        else:
            groups[-1].append(ln)
    for grp in groups:
        out.append(_education_entry(grp, None, None))
    return out


# ── skills ──────────────────────────────────────────────────────────────────
def _clean_skill(token: str) -> str:
    t = re.sub(r"\(.*?\)", "", token).strip(" ·•-\t")
    low = norm(t)
    for marker in PROFICIENCY_MARKERS:
        low = low.replace(marker, "")
    return t.strip(" ·•-\t,")


def parse_skills(lines: list[str]) -> dict[str, list[str]]:
    buckets: dict[str, list[str]] = {"hard_skills": [], "techniques": [], "tools": [], "languages": []}
    current = "hard_skills"
    for raw in lines:
        line = raw.strip()
        # Detect both "Techniques" on its own line and "Techniques: a, b, c".
        label_part = line.split(":", 1)[0] if ":" in line else line
        sub = detect_skill_subheader(label_part)
        if sub:
            current = sub
            line = line.split(":", 1)[1] if ":" in line else ""
        items = [i for i in re.split(r"[•·,;|•]|\s{2,}", line) if i.strip()]
        for it in items:
            cleaned = _clean_skill(it)
            if not cleaned or len(cleaned) < 2:
                continue
            bucket = current
            if current not in ("languages",) and norm(cleaned) in TOOLS_TAXONOMY:
                bucket = "tools"
            if cleaned not in buckets[bucket]:
                buckets[bucket].append(cleaned)
    return buckets


def parse_simple_list(lines: list[str]) -> list[str]:
    out: list[str] = []
    for raw in lines:
        for it in re.split(r"[•·,;|•]|\s{2,}", raw.strip()):
            v = it.strip(" ·•-\t")
            if v and len(v) > 1 and v not in out:
                out.append(v)
    return out


# ── orchestrator ─────────────────────────────────────────────────────────────
def parse_structured(text: str) -> dict[str, Any]:
    header, sections = segment_sections(text)
    contact = parse_contact(header, sections.get("contact", []))
    skills = parse_skills(sections.get("skills", []))
    languages = parse_simple_list(sections.get("languages", []))
    if languages and not skills["languages"]:
        skills["languages"] = languages
    elif languages:
        for lng in languages:
            if lng not in skills["languages"]:
                skills["languages"].append(lng)
    return {
        "language": detect_language(text),
        "contact": contact,
        "experience": parse_experience(sections.get("experience", [])),
        "education": parse_education(sections.get("education", [])),
        "skills": skills,
        "certifications": parse_simple_list(sections.get("certifications", [])),
        "projects": parse_simple_list(sections.get("projects", [])),
        "volunteering": parse_simple_list(sections.get("volunteering", [])),
    }


def to_parsed_profile(structured: dict[str, Any]) -> dict[str, Any]:
    """Map the structured result onto the existing ParsedCVProfile dict shape.

    work_experience and education items are normalized to camelCase keys so
    they round-trip cleanly through the DB and the _profile_to_payload()
    serializer without breaking the wizard's field expectations.
    """
    c = structured.get("contact", {})
    full = c.get("full_name") or ""
    parts = full.split()
    skills = structured.get("skills", {})
    all_skills = skills.get("hard_skills", []) + skills.get("techniques", []) + skills.get("tools", [])
    links = c.get("links", [])
    linkedin = next((lnk for lnk in links if "linkedin" in lnk.lower()), None)
    github = next((lnk for lnk in links if "github" in lnk.lower()), None)

    work_experience = [
        {
            "jobTitle": e.get("role") or "",
            "company": e.get("company") or "",
            "location": e.get("location") or "",
            "startDate": e.get("start_date") or "",
            "endDate": e.get("end_date") or "",
            "current": e.get("end_date") == "present",
            "description": " ".join(e.get("bullets", [])),
        }
        for e in structured.get("experience", [])
    ]
    education = [
        {
            "degree": e.get("degree") or "",
            "institution": e.get("institution") or "",
            "fieldOfStudy": e.get("field_of_study") or "",
            "location": e.get("location") or "",
            "startDate": e.get("start_date") or "",
            "endDate": e.get("end_date") or "",
            "description": "",
        }
        for e in structured.get("education", [])
    ]
    return {
        "first_name": parts[0] if parts else None,
        "last_name": parts[-1] if len(parts) > 1 else None,
        "full_name": full or None,
        "email": c.get("email"),
        "phone": c.get("phone"),
        "location": c.get("location"),
        "linkedin_url": linkedin,
        "github_url": github,
        "job_title": c.get("headline"),
        "professional_summary": None,
        "skills": all_skills,
        "hard_skills": skills.get("hard_skills", []),
        "techniques": skills.get("techniques", []),
        "tools": skills.get("tools", []),
        "languages": skills.get("languages", []),
        "work_experience": work_experience,
        "education": education,
        "certifications": structured.get("certifications", []),
    }
