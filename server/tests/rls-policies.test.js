import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(process.cwd(), "server/migrations/2026-05-02-supabase-rls-policies.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

test("rls migration enables row level security on core tables", () => {
  const tables = [
    "users",
    "companies",
    "jobs",
    "applications",
    "candidate_profiles",
    "candidate_documents",
    "saved_jobs",
    "job_alerts",
    "notification_preferences",
    "notification_logs",
  ];

  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("rls migration defines helper claim functions", () => {
  assert.match(sql, /create or replace function app_public\.request_claim/i);
  assert.match(sql, /create or replace function app_public\.request_user_id/i);
  assert.match(sql, /create or replace function app_public\.request_company_id/i);
  assert.match(sql, /auth\.jwt\(\)/i);
});

test("rls migration protects candidate privacy and company isolation", () => {
  assert.match(sql, /create policy applications_owner_company_admin_select/i);
  assert.match(sql, /request_user_id\(\) = \(payload ->> 'candidateUserId'\)/i);
  assert.match(sql, /request_company_id\(\) = \(payload ->> 'companyId'\)/i);
  assert.match(sql, /create policy candidate_documents_owner_or_admin_select/i);
  assert.doesNotMatch(sql, /create policy .* on public\.candidate_documents[\s\S]*using \(true\)/i);
});