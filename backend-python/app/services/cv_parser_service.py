"""CV parsing service for extracting text from various formats."""
import json
import re
from typing import Dict, List
import httpx
from app.core.config import get_settings
from app.core.logging import get_logger
from app.schemas import ParsedCVProfile

logger = get_logger(__name__)
settings = get_settings()


class CVParserService:
    """CV parsing service."""

    _COMMON_SKILLS = [
        "python", "javascript", "java", "c++", "sql", "html", "css", "react", "vue", "angular",
        "node", "nodejs", "django", "flask", "fastapi", "aws", "docker", "kubernetes", "git",
        "agile", "scrum", "excel", "power bi", "powerbi", "figma", "photoshop", "typescript",
        "atendimento", "vendas", "marketing", "suporte", "analise", "analítica", "autocad",
    ]

    _SECTION_HEADINGS = {
        "skills": ["skills", "competencias", "competências", "habilidades", "tecnologias"],
        "languages": ["languages", "idiomas", "linguas", "línguas"],
        "certifications": ["certifications", "certificacoes", "certificações", "cursos"],
        "experience": ["experience", "experiencia", "experiência", "historico profissional", "professional experience"],
        "education": ["education", "educacao", "educação", "formacao", "formação", "academic background"],
    }

    _IGNORE_NAME_HINTS = {
        "curriculum", "curriculo", "currículo", "resume", "cv", "contacto", "contato",
        "perfil", "profile", "experiencia", "experiência", "education", "educacao", "educação",
    }
    
    @staticmethod
    def extract_text_from_pdf(file_path: str) -> str:
        """Extract text from PDF file."""
        try:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            return text
        except Exception as e:
            logger.error(f"Failed to parse PDF: {str(e)}")
            return ""
    
    @staticmethod
    def extract_text_from_docx(file_path: str) -> str:
        """Extract text from DOCX file."""
        try:
            from docx import Document
            doc = Document(file_path)
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text
        except Exception as e:
            logger.error(f"Failed to parse DOCX: {str(e)}")
            return ""
    
    @staticmethod
    def extract_text_from_txt(file_path: str) -> str:
        """Extract text from TXT file."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            logger.error(f"Failed to parse TXT: {str(e)}")
            return ""
    
    @staticmethod
    def extract_text(file_path: str, mime_type: str) -> str:
        """Extract text from file based on MIME type."""
        if mime_type == "application/pdf":
            return CVParserService.extract_text_from_pdf(file_path)
        elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            return CVParserService.extract_text_from_docx(file_path)
        elif mime_type == "application/msword":
            # Legacy .doc is not reliably parseable without extra dependencies.
            return ""
        elif mime_type == "text/plain":
            return CVParserService.extract_text_from_txt(file_path)
        else:
            logger.warning(f"Unsupported MIME type: {mime_type}")
            return ""

    @staticmethod
    def _normalize_text(text: str) -> str:
        """Normalize extracted text to improve regex/heuristic parsing quality."""
        if not text:
            return ""

        normalized = text.replace("\ufeff", "").replace("\r", "\n")
        normalized = re.sub(r"\u00a0", " ", normalized)
        normalized = re.sub(r"[ \t]+", " ", normalized)
        normalized = re.sub(r"\n{3,}", "\n\n", normalized)
        return normalized.strip()

    @staticmethod
    def _extract_fallback_text_from_bytes(file_path: str) -> str:
        """Fallback extraction for low-text/scanned documents by decoding raw bytes."""
        try:
            raw = open(file_path, "rb").read()
        except Exception:
            return ""

        # Try multiple decodings to recover any embedded text snippets.
        chunks: List[str] = []
        for encoding in ("utf-8", "latin-1"):
            try:
                decoded = raw.decode(encoding, errors="ignore")
            except Exception:
                continue

            if decoded:
                # Keep only printable-ish lines to avoid noisy binary blocks.
                cleaned_lines = []
                for line in decoded.splitlines():
                    line = re.sub(r"[^\x20-\x7E\u00A0-\u024F]", " ", line)
                    line = re.sub(r"\s+", " ", line).strip()
                    if len(line) >= 3:
                        cleaned_lines.append(line)
                chunks.append("\n".join(cleaned_lines))

        return CVParserService._normalize_text("\n".join(chunks))

    @staticmethod
    def _extract_name(lines: List[str]) -> tuple[str | None, str | None, str | None]:
        """Attempt to infer candidate name from top lines."""
        for raw_line in lines[:12]:
            line = re.sub(r"\s+", " ", raw_line).strip(" -|:\t")
            if not line or len(line) < 4 or len(line) > 80:
                continue

            lower = line.lower()
            if any(token in lower for token in CVParserService._IGNORE_NAME_HINTS):
                continue

            # Prefer two to four alpha words (common for person names).
            parts = [p for p in line.split(" ") if p]
            if 2 <= len(parts) <= 4 and all(re.match(r"^[A-Za-zÀ-ÖØ-öø-ÿ'`.-]+$", p) for p in parts):
                full_name = " ".join(parts)
                first = parts[0]
                last = parts[-1]
                return full_name, first, last

        return None, None, None

    @staticmethod
    def _extract_section_items(lines: List[str], section_keys: List[str]) -> List[str]:
        """Extract comma/bullet separated values under a section heading."""
        items: List[str] = []
        collecting = False

        for line in lines:
            clean = line.strip()
            lower = clean.lower()

            if any(key in lower for key in section_keys) and len(clean) < 60:
                collecting = True
                continue

            if collecting:
                # Stop if we reached another heading-like short label.
                if len(clean) < 50 and clean.endswith(":"):
                    break

                # Accept up to a few lines below heading.
                if not clean:
                    break

                parts = re.split(r"[,;|•·]", clean)
                normalized_parts = [p.strip() for p in parts if p.strip()]
                items.extend(normalized_parts)
                if len(items) >= 20:
                    break

        deduped: List[str] = []
        seen = set()
        for item in items:
            key = item.lower()
            if key not in seen and len(item) > 1:
                deduped.append(item)
                seen.add(key)
        return deduped

    @staticmethod
    def _extract_section_lines(lines: List[str], section_keys: List[str], max_lines: int = 12) -> List[str]:
        """Collect raw lines that appear below a section heading."""
        collected: List[str] = []
        collecting = False
        all_headings = {
            heading
            for headings in CVParserService._SECTION_HEADINGS.values()
            for heading in headings
        }

        for line in lines:
            clean = line.strip()
            lower = clean.lower()

            if any(key in lower for key in section_keys) and len(clean) < 80:
                collecting = True
                continue

            if collecting:
                if not clean:
                    if collected:
                        break
                    continue

                if collected and any(heading in lower for heading in all_headings if heading not in section_keys) and len(clean) < 80:
                    break

                if len(clean) < 60 and clean.endswith(":"):
                    break

                collected.append(clean)
                if len(collected) >= max_lines:
                    break

        return collected

    @staticmethod
    def _parse_experience_entries(lines: List[str]) -> List[dict]:
        """Parse experience section lines into lightweight structured entries."""
        entries: List[dict] = []
        date_pattern = re.compile(r"(19|20)\d{2}")

        for line in lines:
            clean = line.strip(" -*•|")
            if not clean or len(clean) < 4:
                continue

            parts = [part.strip() for part in re.split(r"\s+[\-|@]\s+|\s+na\s+|\s+at\s+", clean) if part.strip()]
            job_title = parts[0] if parts else clean
            company = parts[1] if len(parts) > 1 else ""

            # Skip lines that look like summary sentences rather than job entries.
            if len(parts) == 1 and len(clean.split()) > 10 and not date_pattern.search(clean):
                continue

            entries.append({
                "jobTitle": job_title,
                "company": company,
                "location": "",
                "startDate": "",
                "endDate": "",
                "current": "actual" in clean.lower() or "current" in clean.lower(),
                "description": clean,
            })

        return entries[:6]

    @staticmethod
    def _parse_education_entries(lines: List[str]) -> List[dict]:
        """Parse education section lines into lightweight structured entries."""
        entries: List[dict] = []

        for line in lines:
            clean = line.strip(" -*•|")
            if not clean or len(clean) < 4:
                continue

            parts = [part.strip() for part in re.split(r"\s+[\-|@]\s+|\s+na\s+|\s+at\s+", clean) if part.strip()]
            degree = parts[0] if parts else clean
            institution = parts[1] if len(parts) > 1 else ""

            entries.append({
                "degree": degree,
                "institution": institution,
                "location": "",
                "startDate": "",
                "endDate": "",
                "description": clean,
            })

        return entries[:6]

    @staticmethod
    def _ai_enabled() -> bool:
        """Return whether AI extraction is configured and enabled."""
        return bool(
            settings.CV_PARSER_AI_ENABLED
            and settings.CV_PARSER_AI_API_KEY.strip()
            and settings.CV_PARSER_AI_MODEL.strip()
        )

    @staticmethod
    def _ai_provider() -> str:
        """Return normalized AI provider name."""
        return (settings.CV_PARSER_AI_PROVIDER or "openai").strip().lower()

    @staticmethod
    def _build_ai_prompt(text: str) -> str:
        """Build a strict extraction prompt for CV autofill."""
        return (
            "Extract structured resume data from the CV text below. "
            "Return ONLY valid JSON with these exact keys: "
            "first_name, last_name, full_name, email, phone, location, postcode, linkedin_url, portfolio_url, github_url, "
            "professional_summary, job_title, years_of_experience, skills, work_experience, education, certifications, languages. "
            "For arrays, always return arrays. work_experience items must use keys: jobTitle, company, location, startDate, endDate, current, description. "
            "education items must use keys: degree, institution, location, startDate, endDate, description. "
            "If unknown, return empty string, null, false, or empty array as appropriate. "
            "Do not invent facts. Prefer Portuguese or English values exactly as found in the CV.\n\n"
            f"CV TEXT:\n{text[:18000]}"
        )

    @staticmethod
    def _normalize_ai_payload(payload: dict) -> dict:
        """Normalize AI JSON payload to the existing parsed profile schema."""
        normalized = {
            "first_name": str(payload.get("first_name") or "").strip() or None,
            "last_name": str(payload.get("last_name") or "").strip() or None,
            "full_name": str(payload.get("full_name") or "").strip() or None,
            "email": str(payload.get("email") or "").strip() or None,
            "phone": str(payload.get("phone") or "").strip() or None,
            "location": str(payload.get("location") or "").strip() or None,
            "postcode": str(payload.get("postcode") or "").strip() or None,
            "linkedin_url": str(payload.get("linkedin_url") or "").strip() or None,
            "portfolio_url": str(payload.get("portfolio_url") or "").strip() or None,
            "github_url": str(payload.get("github_url") or "").strip() or None,
            "professional_summary": str(payload.get("professional_summary") or "").strip() or None,
            "job_title": str(payload.get("job_title") or "").strip() or None,
            "years_of_experience": payload.get("years_of_experience"),
            "skills": payload.get("skills") if isinstance(payload.get("skills"), list) else [],
            "work_experience": payload.get("work_experience") if isinstance(payload.get("work_experience"), list) else [],
            "education": payload.get("education") if isinstance(payload.get("education"), list) else [],
            "certifications": payload.get("certifications") if isinstance(payload.get("certifications"), list) else [],
            "languages": payload.get("languages") if isinstance(payload.get("languages"), list) else [],
        }
        return normalized

    @staticmethod
    def _ai_request_parts(text: str) -> tuple[str, dict, dict]:
        """Build provider-specific AI request URL, headers, and body."""
        provider = CVParserService._ai_provider()
        base_url = settings.CV_PARSER_AI_BASE_URL.rstrip("/")
        prompt = CVParserService._build_ai_prompt(text)
        body = {
            "model": settings.CV_PARSER_AI_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a precise resume parser. Return strict JSON only.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }

        if provider == "azure":
            headers = {
                "api-key": settings.CV_PARSER_AI_API_KEY,
                "Content-Type": "application/json",
            }
            url = (
                f"{base_url}/openai/deployments/{settings.CV_PARSER_AI_MODEL}/chat/completions"
                f"?api-version={settings.CV_PARSER_AI_AZURE_API_VERSION}"
            )
            body.pop("model", None)
            return url, headers, body

        headers = {
            "Authorization": f"Bearer {settings.CV_PARSER_AI_API_KEY}",
            "Content-Type": "application/json",
        }
        if settings.CV_PARSER_AI_ORGANIZATION.strip():
            headers["OpenAI-Organization"] = settings.CV_PARSER_AI_ORGANIZATION.strip()
        if settings.CV_PARSER_AI_PROJECT.strip():
            headers["OpenAI-Project"] = settings.CV_PARSER_AI_PROJECT.strip()
        if provider == "openrouter":
            headers["HTTP-Referer"] = settings.CV_PARSER_AI_SITE_URL.strip() or settings.FRONTEND_URL
            headers["X-Title"] = settings.CV_PARSER_AI_APP_NAME.strip() or "Parvagas CV Parser"

        url = f"{base_url}/chat/completions"
        return url, headers, body

    @staticmethod
    def _try_ai_parse(text: str) -> Dict | None:
        """Try extracting structured CV data with a configured AI provider."""
        if not CVParserService._ai_enabled() or len(text.strip()) < 40:
            return None

        url, headers, body = CVParserService._ai_request_parts(text)

        try:
            with httpx.Client(timeout=settings.CV_PARSER_AI_TIMEOUT_SECONDS) as client:
                response = client.post(url, headers=headers, json=body)
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            logger.warning(f"AI CV parsing unavailable, falling back to heuristics: {exc}")
            return None

        try:
            content = data["choices"][0]["message"]["content"]
            payload = json.loads(content)
            normalized = CVParserService._normalize_ai_payload(payload)
            profile = ParsedCVProfile(**normalized)
        except Exception as exc:
            logger.warning(f"AI CV parsing returned invalid JSON, falling back to heuristics: {exc}")
            return None

        confidence = {
            "fullName": 0.95 if profile.full_name else 0.0,
            "email": 0.95 if profile.email else 0.0,
            "phone": 0.9 if profile.phone else 0.0,
            "skills": 0.9 if profile.skills else 0.2,
            "experience": 0.92 if profile.work_experience or profile.years_of_experience is not None else 0.2,
            "education": 0.9 if profile.education else 0.2,
        }
        return {
            "success": True,
            "parsedProfile": profile.model_dump(),
            "confidence": confidence,
            "warnings": [f"AI-assisted extraction used ({CVParserService._ai_provider()})."],
            "source": f"ai:{CVParserService._ai_provider()}",
        }
    
    @staticmethod
    def parse_cv_text(text: str) -> ParsedCVProfile:
        """Parse CV text and extract structured data."""
        profile = ParsedCVProfile()
        normalized_text = CVParserService._normalize_text(text)
        text_lower = normalized_text.lower()
        lines = [line.strip() for line in normalized_text.split("\n") if line.strip()]

        # Name
        full_name, first_name, last_name = CVParserService._extract_name(lines)
        profile.full_name = full_name
        profile.first_name = first_name
        profile.last_name = last_name

        # Email
        email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", normalized_text)
        if email_match:
            profile.email = email_match.group()

        # Phone (supports Angola/international formats)
        phone_match = re.search(r"(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}", normalized_text)
        if phone_match:
            profile.phone = phone_match.group()

        # URLs
        linkedin = re.search(r"https?://(?:www\.)?linkedin\.com/[^\s]+", normalized_text, re.IGNORECASE)
        github = re.search(r"https?://(?:www\.)?github\.com/[^\s]+", normalized_text, re.IGNORECASE)
        portfolio = re.search(r"https?://[^\s]+", normalized_text)
        if linkedin:
            profile.linkedin_url = linkedin.group()
        if github:
            profile.github_url = github.group()
        if portfolio and portfolio.group() not in {profile.linkedin_url, profile.github_url}:
            profile.portfolio_url = portfolio.group()

        # Skills: keyword scan + section-based extraction
        found_skills = [skill for skill in CVParserService._COMMON_SKILLS if skill in text_lower]
        section_skills = CVParserService._extract_section_items(lines, CVParserService._SECTION_HEADINGS["skills"])
        merged_skills = []
        seen = set()
        for item in found_skills + section_skills:
            key = item.lower()
            if key not in seen:
                merged_skills.append(item)
                seen.add(key)
        profile.skills = merged_skills[:20]

        # Languages and certifications
        profile.languages = CVParserService._extract_section_items(lines, CVParserService._SECTION_HEADINGS["languages"])[:10]
        profile.certifications = CVParserService._extract_section_items(lines, CVParserService._SECTION_HEADINGS["certifications"])[:15]

        # Experience and education blocks for onboarding autofill.
        experience_lines = CVParserService._extract_section_lines(lines, CVParserService._SECTION_HEADINGS["experience"])
        education_lines = CVParserService._extract_section_lines(lines, CVParserService._SECTION_HEADINGS["education"])
        profile.work_experience = CVParserService._parse_experience_entries(experience_lines)
        profile.education = CVParserService._parse_education_entries(education_lines)

        # Years of experience (PT + EN variants)
        exp_match = re.search(r"(\d{1,2})\s*(?:years?|yrs?|anos?)\s*(?:of\s*)?(?:experience|experiencia|experiência|exp)", text_lower)
        if exp_match:
            profile.years_of_experience = int(exp_match.group(1))

        # Lightweight summary draft from first meaningful long lines
        long_lines = [line for line in lines if len(line) >= 40][:3]
        if long_lines:
            profile.professional_summary = " ".join(long_lines)[:600]
        
        return profile
    
    @staticmethod
    def parse_cv_file(file_path: str, mime_type: str) -> Dict:
        """Parse CV file and return parsed profile."""
        try:
            # Extract text
            text = CVParserService._normalize_text(CVParserService.extract_text(file_path, mime_type))

            # Fallback when extracted text is empty/very short (common in scanned PDFs).
            fallback_text = ""
            used_fallback = False
            if len(text) < 80:
                fallback_text = CVParserService._extract_fallback_text_from_bytes(file_path)
                used_fallback = bool(fallback_text)
                if fallback_text and fallback_text not in text:
                    text = f"{text}\n{fallback_text}".strip()

            if not text.strip():
                return {
                    "success": False,
                    "warnings": ["Could not extract readable text from file"]
                }

            ai_result = CVParserService._try_ai_parse(text)
            if ai_result:
                return ai_result
            
            # Parse text
            profile = CVParserService.parse_cv_text(text)

            confidence = {
                "fullName": 0.85 if profile.full_name else 0.0,
                "email": 0.9 if profile.email else 0.0,
                "phone": 0.8 if profile.phone else 0.0,
                "skills": 0.75 if profile.skills else 0.2,
                "experience": 0.8 if (profile.work_experience or profile.years_of_experience is not None) else 0.3,
                "education": 0.8 if profile.education else 0.2,
            }

            if used_fallback:
                # Reduce confidence for fields when only fallback decoding was usable.
                confidence = {k: round(v * 0.8, 2) for k, v in confidence.items()}

            warnings: List[str] = []
            if used_fallback:
                warnings.append("Low-text document detected. Used fallback extraction.")
            if not profile.full_name:
                warnings.append("Could not confidently identify full name.")
            if not profile.email:
                warnings.append("Could not identify email address.")
            
            return {
                "success": True,
                "parsedProfile": profile.model_dump(),
                "confidence": confidence,
                "warnings": warnings
            }
        
        except Exception as e:
            logger.error(f"CV parsing failed: {str(e)}")
            return {
                "success": False,
                "warnings": [str(e)]
            }
