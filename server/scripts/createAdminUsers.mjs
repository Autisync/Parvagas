/**
 * One-off script: create admin and moderator accounts.
 * Run: node server/scripts/createAdminUsers.mjs
 */
import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config({ path: "server/.env" });

import User from "../models/user.js";

const now = new Date().toISOString();
const TERMS_VERSION = process.env.TERMS_VERSION || "2026-05";
const PRIVACY_VERSION = process.env.PRIVACY_VERSION || "2026-05";

const users = [
  {
    fullName: "Parvagas Admin",
    email: "team@autisync.com",
    password: "asdfgh123456",
    role: "admin",
    adminLevel: "super-admin",
  },
  {
    fullName: "D. Sousa",
    email: "dsousa@gmail.com",
    password: "asdfgh123456",
    role: "admin",
    adminLevel: "moderator",
  },
];

async function run() {
  for (const u of users) {
    const normalizedEmail = u.email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      console.log(`⚠️  Already exists: ${normalizedEmail} — skipping.`);
      continue;
    }

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(u.password, salt);

    await User.create({
      fullName: u.fullName,
      email: normalizedEmail,
      password: passwordHash,
      role: u.role,
      adminLevel: u.adminLevel,
      consents: {
        acceptedTerms: true,
        acceptedPrivacy: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
      },
    });

    console.log(`✅  Created ${u.adminLevel}: ${normalizedEmail}`);
  }

  console.log("Done.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
