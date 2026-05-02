/**
 * Bootstrap the Supabase Postgres schema.
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" \
 *   node server/migrations/bootstrap.mjs
 *
 * The DATABASE_URL comes from Supabase Dashboard → Project Settings → Database → Connection string (URI).
 */

import { createRequire } from "module";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile = path.join(__dirname, "2026-04-26-supabase-document-store.sql");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Error: DATABASE_URL is not set.");
  console.error(
    "Get it from Supabase Dashboard → Project Settings → Database → Connection string (URI)."
  );
  process.exit(1);
}

const sql = readFileSync(sqlFile, "utf8");

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connected to Supabase Postgres.");
  await client.query(sql);
  console.log("Bootstrap complete — all 17 tables and indexes created.");
} catch (err) {
  console.error("Bootstrap failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
