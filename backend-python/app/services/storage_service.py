"""Storage service for file uploads."""
import os
from pathlib import Path
from app.core.config import get_settings

settings = get_settings()


class StorageService:
    """Storage service for managing file uploads."""
    
    @staticmethod
    def ensure_upload_dir() -> None:
        """Ensure upload directory exists."""
        Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    
    @staticmethod
    def scan_clean(file_content: bytes) -> bool:
        """Antivirus hook. No-op (clean) unless ANTIVIRUS_ENABLED + a scanner is
        wired (e.g. ClamAV via clamd). Returns True when the file is safe."""
        if os.getenv("ANTIVIRUS_ENABLED", "false").lower() != "true":
            return True
        try:
            import clamd  # type: ignore

            cd = clamd.ClamdNetworkSocket(
                host=os.getenv("CLAMAV_HOST", "clamav"),
                port=int(os.getenv("CLAMAV_PORT", "3310")),
            )
            result = cd.instream(__import__("io").BytesIO(file_content))
            return result.get("stream", ["", ""])[0] == "OK"
        except Exception:
            # Fail-closed only if explicitly required; default fail-open to avoid
            # blocking uploads when the scanner is misconfigured.
            return os.getenv("ANTIVIRUS_FAIL_OPEN", "true").lower() == "true"

    @staticmethod
    def save_file(file_content: bytes, file_name: str) -> str:
        """Save file to disk and return path."""
        StorageService.ensure_upload_dir()

        primary_path = Path(settings.UPLOAD_DIR) / file_name
        try:
            with open(primary_path, "wb") as f:
                f.write(file_content)
            return str(primary_path)
        except PermissionError:
            # Some container volumes are mounted as root-only; fallback keeps upload flows working.
            fallback_dir = Path("/tmp/parvagas-uploads")
            fallback_dir.mkdir(parents=True, exist_ok=True)
            fallback_path = fallback_dir / file_name
            with open(fallback_path, "wb") as f:
                f.write(file_content)
            return str(fallback_path)
    
    @staticmethod
    def delete_file(file_path: str) -> bool:
        """Delete file from disk."""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            return False
        except Exception:
            return False
    
    @staticmethod
    def file_exists(file_path: str) -> bool:
        """Check if file exists."""
        return os.path.exists(file_path)
