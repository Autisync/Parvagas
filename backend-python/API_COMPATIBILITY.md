# API Compatibility Guide

## Overview

This document describes the current Python backend API contract used by the frontend.

## Endpoint Mapping

### Active Endpoints

| Endpoint | Python Path |
|----------|-------------|
| Health Check | `/health` |
| Readiness Check | `/ready` |
| Register | `/api/v1/auth/register` |
| Login | `/api/v1/auth/login` |
| Verify Email | `/api/v1/auth/verify-email` |
| Forgot Password | `/api/v1/auth/forgot-password` |
| Reset Password | `/api/v1/auth/reset-password` |
| Candidate Profile Get | `/api/v1/candidates/profile` |
| Candidate Profile Update | `/api/v1/candidates/profile` |
| Company Profile Get | `/api/v1/companies/profile` |
| Company Profile Update | `/api/v1/companies/profile` |
| CV Upload | `/api/v1/cv/upload` |

## Request/Response Format

### Authentication

JWT token format and expiration are defined by the Python backend.

**Login Request**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "roleHint": "candidate"
}
```

**Login Response** (same for both):
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "User Name",
    "role": "candidate",
    "email_verified": false
  }
}
```

### Register Request

Python Backend (snake_case):
```json
{
  "full_name": "User Name",
  "email": "user@example.com",
  "password": "password123",
  "role": "candidate"
}
```

### CV Upload Response

Parsed CV response format:
```json
{
  "success": true,
  "parsedProfile": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "location": "City, Country",
    "jobTitle": "Software Engineer",
    "yearsOfExperience": 5,
    "skills": ["Python", "JavaScript", "SQL"],
    "workExperience": [],
    "education": [],
    "certifications": [],
    "languages": []
  },
  "confidence": {
    "email": 0.9,
    "phone": 0.8
  },
  "warnings": []
}
```

## Frontend Updates Required

### Base URL

Update `NEXT_PUBLIC_API_URL` in frontend `.env`.

Local development:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Docker or remote development:

```bash
NEXT_PUBLIC_API_URL=http://backend-python:8000
```

### Request Paths

Use the `/api/v1` prefix for all application API routes:

```typescript
const res = await fetch(`${apiUrl}/api/v1/auth/login`, options);
```

If using a utility function, update it:

```typescript
export function authFetch(path: string, token?: string) {
  const normalizedPath = path.startsWith('/api/v1') ? path : `/api/v1${path}`;
  return fetch(`${API_URL}${normalizedPath}`, {
    headers: {
      Authorization: token ? `Bearer ${token}` : undefined,
    }
  });
}
```

## Error Handling

Both backends return similar error formats:

```json
{
  "detail": "Error message"
}
```

Or with request ID (Python backend):
```json
{
  "detail": "Error message",
  "request_id": "uuid"
}
```

## Authentication Headers

Both backends expect the same JWT header:
```
Authorization: Bearer <token>
```

## Database Compatibility

The Python backend uses PostgreSQL with SQLAlchemy/Alembic migrations.

**Note**: Ensure Alembic migrations are run on the Python backend to create tables if not already present.

## Notes

- Keep frontend base URL pointing to port 8000 in local development.
- Run Alembic migrations before testing API write flows.
- Consider API versioning for future changes.
