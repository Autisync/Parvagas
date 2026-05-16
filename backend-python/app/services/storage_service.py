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
    def save_file(file_content: bytes, file_name: str) -> str:
        """Save file to disk and return path."""
        StorageService.ensure_upload_dir()
        
        file_path = Path(settings.UPLOAD_DIR) / file_name
        
        with open(file_path, "wb") as f:
            f.write(file_content)
        
        return str(file_path)
    
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
