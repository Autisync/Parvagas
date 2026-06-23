"""Storage service for file uploads."""
import logging
import os
from pathlib import Path
from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


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

    # --- Supabase Storage (S3-free REST adapter) --------------------------
    @staticmethod
    def _supabase_enabled() -> bool:
        return (
            settings.STORAGE_PROVIDER == "supabase"
            and bool(settings.SUPABASE_URL)
            and bool(settings.SUPABASE_SERVICE_KEY)
        )

    @staticmethod
    def _supabase_upload(file_content: bytes, file_name: str) -> str:
        """Upload to Supabase Storage; returns a 'supabase:<key>' reference."""
        import httpx
        import mimetypes

        key = file_name.lstrip("/")
        url = f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_BUCKET}/{key}"
        ctype = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
        resp = httpx.post(
            url, content=file_content,
            headers={
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "Content-Type": ctype,
                "x-upsert": "true",
            },
            timeout=30,
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Supabase upload failed ({resp.status_code}): {resp.text[:200]}")
        return f"supabase:{key}"

    # --- Self-hosted S3-compatible object store (MinIO/S3 on your own server) ---
    # Final-stage option: flip STORAGE_PROVIDER=server + S3_* env. Requires boto3
    # (add `boto3` to requirements before launch). Supabase remains the temp default.
    @staticmethod
    def _server_enabled() -> bool:
        return (
            settings.STORAGE_PROVIDER == "server"
            and bool(settings.S3_ENDPOINT_URL)
            and bool(settings.S3_ACCESS_KEY)
            and bool(settings.S3_SECRET_KEY)
        )

    @staticmethod
    def _s3_client():
        import boto3  # lazy — only needed when STORAGE_PROVIDER=server

        return boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
        )

    @staticmethod
    def _server_upload(file_content: bytes, file_name: str) -> str:
        import mimetypes

        key = file_name.lstrip("/")
        ctype = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
        StorageService._s3_client().put_object(
            Bucket=settings.S3_BUCKET, Key=key, Body=file_content, ContentType=ctype
        )
        return f"server:{key}"

    @staticmethod
    def signed_url(file_path: str, expires_in: int = 3600) -> str | None:
        """Return a time-limited download URL for cloud objects (None for local files)."""
        if not file_path:
            return None
        # Self-hosted S3 (server)
        if file_path.startswith("server:"):
            try:
                key = file_path[len("server:"):]
                return StorageService._s3_client().generate_presigned_url(
                    "get_object",
                    Params={"Bucket": settings.S3_BUCKET, "Key": key},
                    ExpiresIn=expires_in,
                )
            except Exception:
                return None
        # Supabase (temp)
        if file_path.startswith("supabase:"):
            try:
                import httpx

                key = file_path[len("supabase:"):]
                url = f"{settings.SUPABASE_URL}/storage/v1/object/sign/{settings.SUPABASE_BUCKET}/{key}"
                resp = httpx.post(
                    url, json={"expiresIn": expires_in},
                    headers={"Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}"},
                    timeout=15,
                )
                if resp.status_code == 200:
                    signed = resp.json().get("signedURL") or resp.json().get("signedUrl")
                    if signed:
                        return f"{settings.SUPABASE_URL}/storage/v1{signed}"
            except Exception:
                return None
        return None

    @staticmethod
    def save_file(file_content: bytes, file_name: str) -> str:
        """Save a file to the configured backend and return a reference/path."""
        if StorageService._server_enabled():
            return StorageService._server_upload(file_content, file_name)
        if StorageService._supabase_enabled():
            return StorageService._supabase_upload(file_content, file_name)

        # Misconfiguration guard: provider asked for a remote store but its
        # credentials are missing, so we're about to write to local disk. In a
        # beta/prod container local disk is ephemeral — make this loud.
        if settings.STORAGE_PROVIDER in ("supabase", "server"):
            logger.warning(
                "STORAGE_PROVIDER=%s but credentials are incomplete — falling back "
                "to LOCAL DISK (ephemeral). Uploads will NOT persist to the remote "
                "store. Set %s.",
                settings.STORAGE_PROVIDER,
                "SUPABASE_URL + SUPABASE_SERVICE_KEY"
                if settings.STORAGE_PROVIDER == "supabase"
                else "S3_ENDPOINT_URL + S3_ACCESS_KEY + S3_SECRET_KEY",
            )

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
        """Delete a file from the configured backend."""
        if file_path and file_path.startswith("server:"):
            try:
                key = file_path[len("server:"):]
                StorageService._s3_client().delete_object(Bucket=settings.S3_BUCKET, Key=key)
                return True
            except Exception:
                return False
        if file_path and file_path.startswith("supabase:"):
            try:
                import httpx

                key = file_path[len("supabase:"):]
                url = f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_BUCKET}/{key}"
                resp = httpx.delete(url, headers={"Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}"}, timeout=15)
                return resp.status_code in (200, 204)
            except Exception:
                return False
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            return False
        except Exception:
            return False

    @staticmethod
    def file_exists(file_path: str) -> bool:
        """Check if a file exists (cloud refs are assumed present)."""
        if file_path and (file_path.startswith("supabase:") or file_path.startswith("server:")):
            return True
        return os.path.exists(file_path)
