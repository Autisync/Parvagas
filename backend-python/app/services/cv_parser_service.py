"""CV parsing service for extracting text from various formats."""
import json
from pathlib import Path
from typing import Dict, Optional, List
from app.core.logging import get_logger
from app.schemas import ParsedCVProfile

logger = get_logger(__name__)


class CVParserService:
    """CV parsing service."""
    
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
        elif mime_type == "text/plain":
            return CVParserService.extract_text_from_txt(file_path)
        else:
            logger.warning(f"Unsupported MIME type: {mime_type}")
            return ""
    
    @staticmethod
    def parse_cv_text(text: str) -> ParsedCVProfile:
        """Parse CV text and extract structured data."""
        # This is a basic implementation that would be replaced with
        # more sophisticated NLP/ML models in production
        
        profile = ParsedCVProfile()
        text_lower = text.lower()
        
        # Extract basic info using simple pattern matching
        lines = text.split("\n")
        
        # First non-empty line often contains name
        for line in lines:
            if line.strip() and len(line.strip()) < 100:
                parts = line.strip().split()
                if len(parts) >= 2:
                    profile.full_name = line.strip()
                    profile.first_name = parts[0] if parts else None
                    profile.last_name = parts[-1] if len(parts) > 1 else None
                    break
        
        # Extract email
        import re
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
        if email_match:
            profile.email = email_match.group()
        
        # Extract phone (simple UK pattern)
        phone_match = re.search(r'\+?44\s?\d{10,11}|0\d{10,11}', text)
        if phone_match:
            profile.phone = phone_match.group()
        
        # Extract skills (placeholder - would need ML model)
        common_skills = [
            "python", "javascript", "java", "c++", "sql", "html", "css",
            "react", "vue", "angular", "nodejs", "django", "flask",
            "aws", "docker", "kubernetes", "git", "agile", "scrum"
        ]
        found_skills = [skill for skill in common_skills if skill in text_lower]
        profile.skills = found_skills
        
        # Extract years of experience (placeholder)
        exp_match = re.search(r'(\d+)\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)', text_lower)
        if exp_match:
            profile.years_of_experience = int(exp_match.group(1))
        
        return profile
    
    @staticmethod
    def parse_cv_file(file_path: str, mime_type: str) -> Dict:
        """Parse CV file and return parsed profile."""
        try:
            # Extract text
            text = CVParserService.extract_text(file_path, mime_type)
            
            if not text.strip():
                return {
                    "success": False,
                    "warnings": ["Could not extract text from file"]
                }
            
            # Parse text
            profile = CVParserService.parse_cv_text(text)
            
            return {
                "success": True,
                "parsedProfile": profile.model_dump(),
                "confidence": {
                    "email": 0.9 if profile.email else 0.0,
                    "phone": 0.8 if profile.phone else 0.0,
                    "skills": 0.7,
                    "experience": 0.6
                },
                "warnings": []
            }
        
        except Exception as e:
            logger.error(f"CV parsing failed: {str(e)}")
            return {
                "success": False,
                "warnings": [str(e)]
            }
