# Frontend (Vercel) Integration with Docker Backend

## Quick Start

### 1. Vercel Project Setup

```bash
# Clone your Next.js repo (if not already)
git clone <your-frontend-repo>
cd <frontend-dir>

# Create Vercel project (if not already)
vercel link
```

### 2. Configure Environment Variables in Vercel

Go to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**

**Development Environment:**
```env
NEXT_PUBLIC_API_URL=https://api.dev.parvagas.pt
NEXT_PUBLIC_RESUME_BUILDER_URL=https://cv.dev.parvagas.pt
NEXT_PUBLIC_STORAGE_URL=https://storage.dev.parvagas.pt
NEXT_PUBLIC_SITE_URL=https://dev-parvagas.vercel.app
```

**Preview Environment:**
```env
NEXT_PUBLIC_API_URL=https://api.dev.parvagas.pt
NEXT_PUBLIC_RESUME_BUILDER_URL=https://cv.dev.parvagas.pt
NEXT_PUBLIC_STORAGE_URL=https://storage.dev.parvagas.pt
NEXT_PUBLIC_SITE_URL=https://dev-parvagas.vercel.app
```

**Production Environment:**
```env
NEXT_PUBLIC_API_URL=https://api.parvagas.pt
NEXT_PUBLIC_RESUME_BUILDER_URL=https://cv.parvagas.pt
NEXT_PUBLIC_STORAGE_URL=https://storage.parvagas.pt
NEXT_PUBLIC_SITE_URL=https://parvagas.vercel.app
```

### 3. Update Frontend Code to Use Environment Variables

In your Next.js app, use these env vars:

```typescript
// lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const CV_BUILDER_URL = process.env.NEXT_PUBLIC_RESUME_BUILDER_URL;
const STORAGE_URL = process.env.NEXT_PUBLIC_STORAGE_URL;

export const api = {
  // Example: fetch user profile
  async getProfile(token: string) {
    const res = await fetch(`${API_BASE_URL}/api/v1/profiles/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return res.json();
  },

  // Example: fetch CV plans
  async getCVPlans() {
    const res = await fetch(`${API_BASE_URL}/api/v1/cv-builder/plans`);
    return res.json();
  },

  // Example: upload file to storage
  async uploadFile(file: File, token: string) {
    const formData = new FormData();
    formData.append('file', file);
    
    const res = await fetch(`${API_BASE_URL}/api/v1/uploads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    return res.json();
  },
};

// Usage in React component
export function useProfile() {
  const [profile, setProfile] = React.useState(null);
  const { token } = useAuth(); // your auth hook

  React.useEffect(() => {
    if (token) {
      api.getProfile(token).then(setProfile);
    }
  }, [token]);

  return { profile };
}
```

### 4. CORS Configuration (Backend)

The backend CORS is already configured to accept requests from Vercel:

```yaml
# docker-compose.prod.yml
backend-python:
  environment:
    FRONTEND_URL: https://parvagas.vercel.app
    CORS_ORIGIN: https://parvagas.vercel.app,https://parvagas.pt
    # ... other vars ...
```

When you make a request from Vercel to the backend, the backend will:
1. Check the `Origin` header from the browser request
2. Verify it matches one of the allowed origins (FRONTEND_URL or CORS_ORIGIN)
3. Return appropriate CORS headers if allowed

## API Communication Patterns

### Pattern 1: Direct Fetch (Client-Side)

```typescript
// components/Profile.tsx
'use client'; // Server component context

import { useEffect, useState } from 'react';

export function ProfileCard() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/profiles/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then(res => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then(setProfile)
      .catch(setError);
  }, []);

  if (error) return <div>Error: {error.message}</div>;
  if (!profile) return <div>Loading...</div>;
  
  return <div>Welcome, {profile.name}</div>;
}
```

### Pattern 2: Server-Side Route Handler (Recommended)

```typescript
// app/api/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const backendUrl = process.env.NEXT_PUBLIC_API_URL;
  const res = await fetch(`${backendUrl}/api/v1/profiles/me`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: 'Backend error' },
      { status: res.status }
    );
  }

  const profile = await res.json();
  return NextResponse.json(profile);
}
```

Then call from client:
```typescript
// Client component
const res = await fetch('/api/profile', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
const profile = await res.json();
```

**Advantages:**
- Hides backend URL from client (no CORS issues)
- Validates token on your own server
- Can add logging/monitoring

### Pattern 3: React SWR Hook (Recommended)

```typescript
// hooks/useAPI.ts
import useSWR from 'swr';

const apiClient = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}${url}`,
    { ...options, headers }
  );

  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
};

export function useProfile() {
  const { data, error, isLoading } = useSWR('/api/v1/profiles/me', apiClient);
  return { profile: data, error, isLoading };
}

export function useCVPlans() {
  const { data, error, isLoading } = useSWR('/api/v1/cv-builder/plans', apiClient);
  return { plans: data, error, isLoading };
}

// Usage
export function Dashboard() {
  const { profile, isLoading } = useProfile();
  const { plans } = useCVPlans();

  if (isLoading) return <div>Loading...</div>;
  return <div>{profile?.name} - Plans: {plans?.length}</div>;
}
```

## Troubleshooting

### CORS Error: "Access to XMLHttpRequest blocked by CORS policy"

**Cause:** Backend doesn't recognize Vercel domain as allowed origin.

**Fix:**
1. Check Vercel domain (e.g., `dev-parvagas.vercel.app`)
2. Update backend FRONTEND_URL:
   ```yaml
   # docker-compose.prod.yml
   FRONTEND_URL: https://dev-parvagas.vercel.app
   ```
3. Or add to CORS_ORIGIN:
   ```yaml
   CORS_ORIGIN: https://dev-parvagas.vercel.app,https://parvagas.pt
   ```
4. Redeploy backend:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --force-recreate backend-python
   ```

### 401 Unauthorized on API Calls

**Cause:** Token not sent or expired.

**Fix:**
1. Verify token is in localStorage: `localStorage.getItem('auth_token')`
2. Check token format: `Authorization: Bearer <token>`
3. Refresh token if expired

### 404 on Backend Routes

**Cause:** Incorrect API path or backend version mismatch.

**Fix:**
1. Check API documentation: `GET /api/docs` (Swagger UI on backend)
2. Verify endpoint exists: `curl https://api.parvagas.pt/api/v1/profiles/me`
3. Check backend version matches frontend

### Timeout Errors

**Cause:** Backend unreachable or Traefik routing misconfigured.

**Fix:**
1. Verify DNS: `nslookup api.parvagas.pt`
2. Check Traefik logs: `docker logs proxy`
3. Verify backend is running: `docker compose -f docker-compose.prod.yml ps`
4. Test direct backend: `curl https://api.parvagas.pt/health` or `/api/health`

## Example: Complete Frontend Component

```typescript
// components/CVBuilder.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface CVPlan {
  id: string;
  name: string;
  features: string[];
  price: number;
}

export function CVBuilder() {
  const [plans, setPlans] = useState<CVPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/cv-builder/plans`
        );
        if (!response.ok) throw new Error('Failed to load plans');
        const data = await response.json();
        setPlans(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading plans');
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  if (loading) return <div>Loading CV Builder...</div>;
  if (error) return <div>Error: {error}</div>;

  const launchBuilder = (planId: string) => {
    const cvUrl = `${process.env.NEXT_PUBLIC_RESUME_BUILDER_URL}/?planId=${planId}`;
    window.open(cvUrl, '_blank');
  };

  return (
    <div className="cv-builder">
      <h2>Choose Your CV Builder Plan</h2>
      <div className="plans-grid">
        {plans.map((plan) => (
          <div key={plan.id} className="plan-card">
            <h3>{plan.name}</h3>
            <p>${plan.price}/month</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button onClick={() => launchBuilder(plan.id)}>
              Launch CV Builder
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Environment Validation

Create a script to validate configuration on startup:

```typescript
// lib/validateEnv.ts
export function validateEnv() {
  const required = [
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_RESUME_BUILDER_URL',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(', ')}\n` +
      `Check your Vercel project settings or .env.local`
    );
  }

  console.log('✓ Environment variables validated');
  console.log(`  Backend: ${process.env.NEXT_PUBLIC_API_URL}`);
  console.log(`  CV Builder: ${process.env.NEXT_PUBLIC_RESUME_BUILDER_URL}`);
}

// app/layout.tsx
import { validateEnv } from '@/lib/validateEnv';

if (typeof window === 'undefined') {
  validateEnv();
}

export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
```

## Summary

| Step | Action |
|------|--------|
| 1 | Link Vercel project: `vercel link` |
| 2 | Add env vars in Vercel dashboard (Settings → Environment Variables) |
| 3 | Use env vars in code: `process.env.NEXT_PUBLIC_API_URL` |
| 4 | Update backend FRONTEND_URL and CORS_ORIGIN in docker-compose |
| 5 | Deploy changes: `docker compose -f docker-compose.prod.yml up -d` |
| 6 | Test: `curl -H "Origin: https://parvagas.vercel.app" https://api.parvagas.pt/health` |
