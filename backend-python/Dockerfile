# Multi-stage build for Python backend

# ─── Build stage ──────────────────────────────────────────────────────────
FROM python:3.12-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    gcc \
    musl-dev \
    postgresql-dev \
    libffi-dev \
    openssl-dev

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Runtime base stage ───────────────────────────────────────────────────
FROM python:3.12-alpine AS runtime

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql-libs \
    libffi \
    curl \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    tesseract-ocr-data-por

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY app ./app
COPY alembic.ini ./alembic.ini
COPY migrations ./migrations
COPY scripts ./scripts
COPY gunicorn_conf.py ./gunicorn_conf.py
COPY docker-entrypoint.sh ./docker-entrypoint.sh
COPY wsgi_websocket.py ./wsgi_websocket.py
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh

# Create uploads directory
RUN mkdir -p /app/uploads && chmod 755 /app/uploads

# Create non-root user
RUN addgroup -g 1000 appuser && adduser -D -u 1000 -G appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

# ─── API Service stage (default) ──────────────────────────────────────────
FROM runtime AS api-service

ENV SERVICE_TYPE=api

# Health check for API service
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Entrypoint runs migrations, then starts Gunicorn (uvicorn workers)
# Using shell form to execute the script properly on Alpine
ENTRYPOINT ["/bin/sh", "-c", "alembic upgrade heads && exec gunicorn app.main:app -c gunicorn_conf.py"]

# ─── WebSocket Service stage ──────────────────────────────────────────────
FROM runtime AS websocket-service

ENV SERVICE_TYPE=websocket

# Health check for WebSocket service
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Start WebSocket service directly
CMD ["python", "-m", "uvicorn", "app.websocket_app:app", "--host", "0.0.0.0", "--port", "8001", "--log-level", "info"]
