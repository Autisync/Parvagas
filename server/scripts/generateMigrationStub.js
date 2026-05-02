import fs from "fs";
import path from "path";

const root = path.resolve(process.cwd(), "server", "migrations");
const now = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join(root, `${now}-schema-update.md`);

const content = `# Migration Stub\n\nGenerated: ${new Date().toISOString()}\n\nThis project now uses Supabase Postgres as the primary database with a JSON document-store compatibility layer.\n\nApply schema changes by:\n1. Updating Supabase SQL migrations\n2. Updating server/db model wrappers as needed\n3. Recording rollout notes in this file\n`;

fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(file, content, "utf8");

console.log(`Migration stub created at ${file}`);
