"""MinIO storage support for Parvagas."""
from datetime import timedelta
from pathlib import Path
from typing import Optional

from minio import Minio
from minio.error import S3Error

from app.core.config import get_settings
from app.core.logging import get_logger

settings = get_settings()
logger = get_logger(__name__)


class MinIOService:
    """S3-compatible storage helper for MinIO."""

    @staticmethod
    def _client() -> Minio:
        return Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )

    @staticmethod
    def _ensure_bucket() -> None:
        client = MinIOService._client()
        bucket = settings.MINIO_BUCKET
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
            logger.info(f"Created MinIO bucket: {bucket}")

    @staticmethod
    def save_file(file_content: bytes, object_name: str) -> str:
        """Save bytes to MinIO and return a canonical object URI."""
        MinIOService._ensure_bucket()
        client = MinIOService._client()
        object_name = object_name.replace(" ", "_")
        content_length = len(file_content)
        try:
            client.put_object(
                bucket_name=settings.MINIO_BUCKET,
                object_name=object_name,
                data=bytes(file_content),
                length=content_length,
            )
        except S3Error as exc:
            logger.error(f"MinIO upload failed: {exc}")
            raise

        return f"minio://{settings.MINIO_BUCKET}/{object_name}"

    @staticmethod
    def get_presigned_url(object_name: str, expires: int = 3600) -> Optional[str]:
        """Generate a pre-signed URL for a MinIO object."""
        try:
            client = MinIOService._client()
            return client.presigned_get_object(
                bucket_name=settings.MINIO_BUCKET,
                object_name=object_name,
                expires=timedelta(seconds=expires),
            )
        except S3Error as exc:
            logger.error(f"MinIO presigned URL generation failed: {exc}")
            return None

    @staticmethod
    def delete_file(object_name: str) -> bool:
        """Delete a file from MinIO."""
        try:
            client = MinIOService._client()
            client.remove_object(settings.MINIO_BUCKET, object_name)
            return True
        except S3Error as exc:
            logger.error(f"MinIO delete failed: {exc}")
            return False

    @staticmethod
    def file_exists(object_name: str) -> bool:
        """Check whether a MinIO object exists."""
        try:
            client = MinIOService._client()
            client.stat_object(settings.MINIO_BUCKET, object_name)
            return True
        except S3Error:
            return False
