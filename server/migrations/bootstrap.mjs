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
import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFiles = readdirSync(__dirname)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort((left, right) => left.localeCompare(right));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Error: DATABASE_URL is not set.");
  console.error(
    "Get it from Supabase Dashboard → Project Settings → Database → Connection string (URI)."
  );
  process.exit(1);
}

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Connected to Supabase Postgres.");
  for (const fileName of sqlFiles) {
    const sqlPath = path.join(__dirname, fileName);
    const sql = readFileSync(sqlPath, "utf8");
    console.log(`Applying migration: ${fileName}`);
    await client.query(sql);
  }
  console.log(`Bootstrap complete — applied ${sqlFiles.length} SQL migration(s).`);
} catch (err) {
  console.error("Bootstrap failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
