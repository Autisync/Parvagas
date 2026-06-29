# Multi-stage build for Python backend

# Base stage
FROM python:3.12-alpine AS base

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    gcc \
    musl-dev \
    postgresql-dev \
    libffi-dev \
    openssl-dev

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Runtime stage
FROM python:3.12-alpine

WORKDIR /app

# Install runtime dependencies.
# tesseract-ocr (+ English/Portuguese language data) powers CV OCR for scanned
# PDFs and image CVs. OCR runs in the Celery worker, which uses this same image.
RUN apk add --no-cache \
    postgresql-libs \
    libffi \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    tesseract-ocr-data-por

# Copy Python packages and executables from base
COPY --from=base /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=base /usr/local/bin /usr/local/bin

# Copy application code
COPY app ./app
COPY alembic.ini ./alembic.ini
COPY migrations ./migrations
COPY scripts ./scripts
COPY gunicorn_conf.py ./gunicorn_conf.py
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Create uploads directory
RUN mkdir -p /app/uploads && chmod 755 /app/uploads

# Create non-root user
RUN addgroup -g 1000 appuser && adduser -D -u 1000 -G appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# Health check (liveness)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import requests,sys; sys.exit(0 if requests.get('http://localhost:8000/health').ok else 1)" || exit 1

# Entrypoint runs migrations, then starts Gunicorn (uvicorn workers).
ENTRYPOINT ["./docker-entrypoint.sh"]
