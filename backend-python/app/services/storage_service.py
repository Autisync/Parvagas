"""Storage service for file uploads."""
import logging
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.minio_service import MinIOService

settings = get_settings()
logger = get_logger(__name__)


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
        from botocore.client import Config

        return boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            # MinIO behind a custom domain needs path-style addressing + SigV4 so
            # presigned URLs validate against the request host.
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
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
    def resolve_public_url(file_path: str | None, expires_in: int = 86400) -> str | None:
        """Turn a stored reference into something an <img src> can actually load.

        `save_file` returns opaque refs like "server:<key>" or "supabase:<key>" —
        those are DB-storage identifiers, not browsable URLs. Public-facing
        images (logos, ad creatives) must be resolved before being sent to the
        frontend, or the <img> tag just gets a broken non-URL string. Values
        that are already a plain http(s)/data/root-relative URL (legacy
        free-text entries, or admin-pasted external URLs) pass through
        unchanged.
        """
        if not file_path:
            return None
        if file_path.startswith(("http://", "https://", "data:", "/")):
            return file_path
        if file_path.startswith(("server:", "supabase:")):
            return StorageService.signed_url(file_path, expires_in=expires_in)
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
            logger.info(f"Saved file to local storage: {primary_path}")
            return str(primary_path)
        except PermissionError:
            fallback_dir = Path("/tmp/parvagas-uploads")
            fallback_dir.mkdir(parents=True, exist_ok=True)
            fallback_path = fallback_dir / file_name
            with open(fallback_path, "wb") as f:
                f.write(file_content)
            logger.warning(f"Saved file to fallback local storage: {fallback_path}")
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
            logger.exception("Failed to delete file from local storage")
            return False

    @staticmethod
    def file_exists(file_path: str) -> bool:
        """Check if a file exists (cloud refs are assumed present)."""
        if file_path and (file_path.startswith("supabase:") or file_path.startswith("server:")):
            return True
        return os.path.exists(file_path)

    @staticmethod
    def read_bytes(file_path: str) -> bytes:
        """Read a stored file's raw bytes regardless of backend.

        Resolves cloud references ('server:<key>', 'supabase:<key>') by
        downloading them; reads local paths directly. Raises on failure so
        callers can surface a real error instead of silently treating a
        download failure as 'empty file'.
        """
        if not file_path:
            raise ValueError("Empty file path")

        # Self-hosted S3 (MinIO / S3 on your own server)
        if file_path.startswith("server:"):
            key = file_path[len("server:"):]
            obj = StorageService._s3_client().get_object(Bucket=settings.S3_BUCKET, Key=key)
            return obj["Body"].read()

        # Supabase Storage
        if file_path.startswith("supabase:"):
            import httpx

            key = file_path[len("supabase:"):]
            url = f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_BUCKET}/{key}"
            resp = httpx.get(
                url,
                headers={"Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}"},
                timeout=30,
            )
            if resp.status_code != 200:
                raise RuntimeError(
                    f"Supabase download failed ({resp.status_code}): {resp.text[:200]}"
                )
            return resp.content

        # Local disk
        with open(file_path, "rb") as f:
            return f.read()

    @staticmethod
    @contextmanager
    def local_path(file_path: str):
        """Yield a local filesystem path for a stored file.

        For local files this is the path itself (no copy). For cloud
        references the object is downloaded to a NamedTemporaryFile that
        preserves the original suffix (so extension-based detection keeps
        working) and is removed on exit.
        """
        if file_path and (file_path.startswith("server:") or file_path.startswith("supabase:")):
            data = StorageService.read_bytes(file_path)
            # Preserve the real extension so downstream (.pdf/.docx/.png) detection works.
            suffix = Path(file_path).suffix
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            try:
                tmp.write(data)
                tmp.flush()
                tmp.close()
                yield tmp.name
            finally:
                try:
                    os.remove(tmp.name)
                except OSError:
                    pass
        else:
            yield file_path
