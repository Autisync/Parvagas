import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { MeiliSearch } from "meilisearch";
import nodemailer from "nodemailer";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });
dotenv.config({ path: new URL("../../.env", import.meta.url).pathname });

const args = new Set(process.argv.slice(2));
const checkServices = args.has("--check-services");

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "JWT_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_API_URL",
  "CORS_ORIGIN",
  "STORAGE_PROVIDER",
  "EMAIL_HOST",
  "EMAIL_USER",
  "EMAIL_PASS",
  "EMAIL_FROM",
];

const failures = [];
const warnings = [];
const passes = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function pass(message) {
  passes.push(message);
}

function env(name) {
  return process.env[name] || "";
}

function isPlaceholder(value) {
  return /your-|change-me|example|localhost|127\.0\.0\.1|parvagas\.local/i.test(value || "");
}

for (const name of required) {
  if (!env(name)) fail(`${name} is required for production.`);
}

if (env("JWT_SECRET").length < 32 || isPlaceholder(env("JWT_SECRET"))) {
  fail("JWT_SECRET must be a non-placeholder value with at least 32 characters.");
} else {
  pass("JWT secret length looks production-suitable.");
}

if (env("STORAGE_PROVIDER") !== "supabase") {
  fail("STORAGE_PROVIDER must be supabase in production so CVs are not stored on local disk.");
} else {
  pass("Storage provider is set to supabase.");
}

if (!/^https:\/\//.test(env("NEXT_PUBLIC_SITE_URL"))) {
  fail("NEXT_PUBLIC_SITE_URL must be an HTTPS URL.");
}

if (!/^https:\/\//.test(env("NEXT_PUBLIC_API_URL"))) {
  fail("NEXT_PUBLIC_API_URL must be an HTTPS URL.");
}

if (env("CORS_ORIGIN").split(",").some((origin) => isPlaceholder(origin))) {
  fail("CORS_ORIGIN must not include localhost or placeholder origins in production.");
} else if (env("CORS_ORIGIN")) {
  pass("CORS origins do not include obvious local placeholders.");
}

if (env("SUPABASE_URL") && !/^https:\/\/.+\.supabase\.co$/.test(env("SUPABASE_URL"))) {
  warn("SUPABASE_URL does not look like a standard Supabase project URL.");
}

if (isPlaceholder(env("EMAIL_FROM")) || !env("EMAIL_FROM").includes("@")) {
  fail("EMAIL_FROM must be a real sender email address.");
}

if (env("AI_PROVIDER") === "fallback" || !env("AI_PROVIDER")) {
  warn("AI_PROVIDER is fallback; CV parsing will work, but quality is not production-grade.");
}

if (!env("MEILISEARCH_HOST")) {
  warn("MEILISEARCH_HOST is not set. Public job search will rely on database filtering only.");
}

async function checkSupabase() {
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const { error } = await client.from("jobs").select("id").limit(1);
  if (error) throw new Error(error.message);

  const bucket = env("SUPABASE_STORAGE_BUCKET");
  const { data: buckets, error: bucketError } = await client.storage.listBuckets();
  if (bucketError) throw new Error(bucketError.message);
  if (!buckets.some((item) => item.name === bucket)) {
    throw new Error(`Storage bucket ${bucket} was not found.`);
  }
}

async function checkEmail() {
  const transporter = nodemailer.createTransport({
    host: env("EMAIL_HOST"),
    port: Number(env("EMAIL_PORT") || 587),
    secure: env("EMAIL_SECURE") === "true",
    auth: {
      user: env("EMAIL_USER"),
      pass: env("EMAIL_PASS"),
    },
  });
  await transporter.verify();
}

async function checkMeili() {
  if (!env("MEILISEARCH_HOST")) return;
  const client = new MeiliSearch({
    host: env("MEILISEARCH_HOST"),
    apiKey: env("MEILISEARCH_API_KEY") || undefined,
  });
  await client.health();
}

if (checkServices && failures.length === 0) {
  try {
    await checkSupabase();
    pass("Supabase database and storage bucket are reachable.");
  } catch (error) {
    fail(`Supabase service check failed: ${error.message}`);
  }

  try {
    await checkEmail();
    pass("Email SMTP credentials verified.");
  } catch (error) {
    fail(`Email service check failed: ${error.message}`);
  }

  try {
    await checkMeili();
    if (env("MEILISEARCH_HOST")) pass("MeiliSearch is reachable.");
  } catch (error) {
    warn(`MeiliSearch check failed: ${error.message}`);
  }
}

console.log("Production readiness report");
console.log("===========================");
for (const item of passes) console.log(`PASS ${item}`);
for (const item of warnings) console.log(`WARN ${item}`);
for (const item of failures) console.log(`FAIL ${item}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} production readiness check(s) failed.`);
  process.exit(1);
}

console.log("\nProduction readiness checks passed.");
