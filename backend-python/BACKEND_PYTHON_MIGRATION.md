# Python Backend Migration Guide

## Overview

This guide explains the Python/FastAPI backend migration from Node.js/Express.

## Structure

```
backend-python/
├── app/
│   ├── main.py                 # FastAPI application
│   ├── core/                   # Core configuration
│   │   ├── config.py          # Settings from environment
│   │   ├── security.py        # JWT, password hashing
│   │   ├── errors.py          # Custom exceptions
│   │   └── logging.py         # Logging setup
│   ├── db/
│   │   ├── session.py         # Database session management
│   │   └── base.py            # SQLAlchemy base classes
│   ├── models/                # SQLAlchemy models
│   ├── schemas/               # Pydantic schemas
│   ├── api/
│   │   └── v1/
│   │       ├── auth.py        # Auth endpoints
│   │       ├── candidates.py  # Candidate endpoints
│   │       ├── companies.py   # Company endpoints
│   │       ├── cv.py          # CV upload/parse
│   │       └── health.py      # Health checks
│   ├── services/              # Business logic
│   │   ├── auth_service.py
│   │   ├── email_service.py
│   │   ├── cv_parser_service.py
│   │   └── storage_service.py
│   └── workers/               # Celery tasks
│       ├── celery_app.py
│       └── tasks.py
├── migrations/                # Alembic migrations
├── tests/                     # Unit/integration tests
├── requirements.txt           # Python dependencies
├── Dockerfile                 # Container definition
├── alembic.ini               # Alembic config
└── .env.example              # Environment template
```

## Setup

### 1. Prerequisites

- Python 3.12+
- Docker and Docker Compose
- PostgreSQL 16+
- Redis 7+

### 2. Environment Configuration

```bash
cp backend-python/.env.example backend-python/.env
# Edit .env with your values
```

### 3. Docker Build

```bash
docker compose up -d --build backend-python postgres redis
```

### 4. Database Migrations

```bash
docker compose exec backend-python alembic upgrade head
```

### 5. Run Backend

```bash
docker compose up -d backend-python celery-worker
```

## API Endpoints

### Health Checks
- `GET /health` - Health status
- `GET /ready` - Readiness status

### Authentication
- `POST /api/v1/auth/register` - Register user
- `POST /api/v1/auth/login` - Login and get token
- `POST /api/v1/auth/verify-email` - Verify email with token
- `POST /api/v1/auth/resend-verification-email` - Resend verification
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password with token

### Candidates
- `GET /api/v1/candidates/profile` - Get candidate profile
- `PUT /api/v1/candidates/profile` - Update candidate profile

### Companies
- `GET /api/v1/companies/profile` - Get company profile
- `PUT /api/v1/companies/profile` - Update company profile

### CV
- `POST /api/v1/cv/upload` - Upload and parse CV

## Celery Tasks

### Background Jobs
- `send_verification_email` - Send email verification
- `send_password_reset_email` - Send password reset email
- `send_welcome_email` - Send welcome email
- `parse_cv` - Parse uploaded CV asynchronously
- `cleanup_expired_tokens` - Cleanup expired tokens

### Running Worker

```bash
docker compose exec backend-python celery -A app.workers.celery_app worker --loglevel=info
```

## Database Models

### User
- id (UUID)
- email (unique)
- full_name
- password_hash
- role (candidate, company, admin)
- email_verified (boolean)
- email_verified_at
- suspended (boolean)
- created_at, updated_at

### CandidateProfile
- id (UUID)
- user_id (FK to User)
- first_name, last_name
- phone, location, postcode
- linkedin_url, portfolio_url, github_url
- professional_summary, job_title
- years_of_experience
- skills (JSON)
- work_experience (JSON)
- education (JSON)
- certifications (JSON)
- languages (JSON)
- created_at, updated_at

### Company
- id (UUID)
- owner_user_id (FK to User)
- name, legal_name
- nif (unique)
- phone, email, website
- status
- description
- logo_url
- created_at, updated_at

### CVUpload
- id (UUID)
- candidate_id (FK to CandidateProfile)
- file_name, file_path
- file_size, mime_type
- raw_text (extracted text)
- parsed_data (JSON)
- parse_confidence
- parse_status
- parse_error
- is_primary
- created_at, updated_at

### EmailVerificationToken
- id (UUID)
- user_id (FK to User)
- token_hash
- expires_at
- used_at

### PasswordResetToken
- id (UUID)
- user_id (FK to User)
- token_hash
- expires_at
- used_at

## Debugging

### Logs
```bash
docker compose logs -f backend-python
docker compose logs -f celery-worker
docker compose logs -f redis
docker compose logs -f postgres
```

### Database Access
```bash
docker compose exec postgres psql -U parvagas_user -d parvagas
```

### Redis CLI
```bash
docker compose exec redis redis-cli
```

## Notes

- Python backend uses the same database schema
- Frontend should use `NEXT_PUBLIC_API_URL=http://localhost:8000`
- JWT authentication uses `JWT_SECRET` configured in `backend-python/.env`
- CV parsing uses simple pattern matching; consider upgrading to ML models
