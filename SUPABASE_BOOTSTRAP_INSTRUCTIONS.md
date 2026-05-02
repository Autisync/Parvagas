# Supabase Bootstrap Instructions

## Overview
The Parvagas platform has been migrated from MongoDB to Supabase Postgres with a JSON document-store compatibility layer. To get the API running against a live Supabase project, you need to:

1. Execute the SQL bootstrap migration
2. Configure the backend environment variables
3. Start the API and run endpoint sanity checks

## SQL Bootstrap (Required First)

### Via Supabase Studio SQL Editor (Recommended)

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select your project: `mhxykmgubdfbjbxqqgzb`
3. Click **SQL Editor** in the left sidebar
4. Click **New query**
5. Copy the entire contents of `server/migrations/2026-04-26-supabase-document-store.sql`
6. Paste into the editor
7. Click **Run**

Expected result: 16 tables created successfully with indexes.

### Bootstrap SQL Contents

The migration creates:
- **Core tables**: users, applications, companies, jobs
- **Candidate tables**: candidate_profiles, candidate_documents, candidate_ai_profiles
- **Matching tables**: job_match_scores, job_alerts, saved_jobs
- **Admin/Audit tables**: admin_actions, audit_logs, ai_parse_runs
- **Scraping tables**: scraped_jobs
- **Notification tables**: notification_preferences, notification_logs
- **Ads tables**: ad_campaigns
- **Indexes**: for email, visibility, status, user_id, company_id lookups

All tables use a **document-store pattern** with a `payload` JSONB column that holds the actual data.

## Environment Configuration

### Backend `.env` File

Update `server/.env` with your Supabase credentials:

```bash
# Get these from Supabase Dashboard → Project Settings → API
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Auth/API settings
JWT_SECRET=45af367388eae92a0c91e0229337697d0c38c7da7f0b06d08339920e291c3934
PORT=3001
```

### Obtaining Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Click **Project Settings** (gear icon)
4. Click **API**
5. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **Service Role Key** (under "Hide Row Level Security (RLS) and Policies") → `SUPABASE_SERVICE_ROLE_KEY`

## Starting the API

```bash
cd /Users/rex/Downloads/Parvagas
npm run server
```

Expected output:
```
Server Port: 3001
```

## Running Endpoint Sanity Checks

After the API is running, execute the full integration test suite:

```bash
npm run test
```

This runs **45 endpoint tests** covering:
- **Authentication**: register, login, duplicate email, wrong password, suspended user
- **Candidate Profile**: CV parsing, AI profile generation, profile approval, profile retrieval
- **Candidate Applications**: save jobs, get saved jobs, apply to job, retrieve applications
- **Job Posting**: create job, list jobs, job detail, public/private visibility
- **Admin Actions**: moderate jobs, suspend users, verify companies, manage ads
- **Ad Campaigns**: create ads, track impressions and clicks
- **Scraped Jobs**: create scraped job, duplicate detection, review and approval
- **Authorization**: protected routes, role-based access control

## Full Workflow Validation

To manually test key flows:

### 1. Candidate Registration & Profile
```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "João Silva",
    "email": "joao@parvagas.ao",
    "password": "Pass1234!",
    "role": "candidate"
  }'
```

### 2. Login & Get Token
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao@parvagas.ao",
    "password": "Pass1234!"
  }'
```

Save the `token` from the response.

### 3. Get Candidate Profile (Protected Route)
```bash
curl -X GET http://localhost:3001/candidates/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. List Public Jobs
```bash
curl http://localhost:3001/jobs
```

### 5. Admin Overview (Requires Admin Token)
```bash
curl -X GET http://localhost:3001/admin/overview \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

## Troubleshooting

### Tables Not Found
- **Issue**: "Could not find the table 'public.users' in the schema cache"
- **Solution**: Run the SQL bootstrap in Supabase Studio (see step above)

### Connection Error
- **Issue**: "Supabase is not configured"
- **Solution**: Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `server/.env`

### Tests Skip
- **Issue**: Integration tests skip without any errors
- **Solution**: Verify both env vars are set. Tests only run when both are present.

## Architecture Details

### Document-Store Compatibility Layer

The API uses a custom model factory (`server/db/modelFactory.js`) that:
1. Wraps Supabase Postgres tables with JSON document storage
2. Provides Mongoose-like query builders (`.find()`, `.findById()`, `.create()`, etc.)
3. Automatically handles JSONB serialization/deserialization
4. Supports filtering, sorting, pagination, and population

**Example Model**:
```javascript
// server/models/user.js
import { createModel } from "../db/modelFactory.js";
const User = createModel("users", "users");
export default User;
```

**Usage in Controllers**:
```javascript
// Register a user
const user = await User.create({ fullName, email, password: hash });

// Find by email
const user = await User.findOne({ email });

// Update user
const updated = await User.findByIdAndUpdate(id, { suspended: true });
```

## Next Steps

1. ✅ Run SQL bootstrap in Supabase Studio
2. ✅ Update `server/.env` with Supabase credentials
3. ✅ Start API: `npm run server`
4. ✅ Run tests: `npm run test`
5. Optionally: Test individual endpoints manually with curl/Postman
6. Deploy: Follow deployment guide in README.md

## Support

For issues:
1. Check [Supabase Docs](https://supabase.com/docs)
2. Verify credentials in Supabase Dashboard → Project Settings → API
3. Check API logs in terminal for specific error messages
4. Confirm all env vars are set: `env | grep SUPABASE`
