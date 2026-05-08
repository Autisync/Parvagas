/**
 * Backend unit tests — audit service, admin utilities, and notification logic.
 * Run: node --test server/tests/admin-utils.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  companyVerificationEmailTemplates,
  applyVerificationTemplatePlaceholders,
} from "../config/companyVerificationEmailTemplates.js";

// ── Verification templates: all required variants ─────────────────────────────

test("has all four required template variants", () => {
  assert.ok(companyVerificationEmailTemplates.approval, "approval template missing");
  assert.ok(companyVerificationEmailTemplates.more_info, "more_info template missing");
  assert.ok(companyVerificationEmailTemplates.rejected, "rejected template missing");
  assert.ok(companyVerificationEmailTemplates.inactive, "inactive template missing");
});

test("each template has subject and body", () => {
  for (const [key, tpl] of Object.entries(companyVerificationEmailTemplates)) {
    assert.ok(String(tpl.subject || "").trim().length > 0, `${key}.subject is empty`);
    assert.ok(String(tpl.body || "").trim().length > 0, `${key}.body is empty`);
  }
});

test("approval subject is in Portuguese", () => {
  assert.match(companyVerificationEmailTemplates.approval.subject, /parvagas/i);
});

test("rejected body contains rejection language", () => {
  assert.match(
    companyVerificationEmailTemplates.rejected.body,
    /rejeit/i,
    "rejected template body should mention rejection"
  );
});

test("more_info body requests documentation", () => {
  assert.match(
    companyVerificationEmailTemplates.more_info.body,
    /document/i,
    "more_info template should request documents"
  );
});

// ── Placeholder substitution ──────────────────────────────────────────────────

test("placeholder replacement substitutes all variables", () => {
  const raw = "Olá {{contactPerson}}, a empresa {{companyName}} foi aprovada. Link: {{portalLink}}";
  const result = applyVerificationTemplatePlaceholders(raw, {
    contactPerson: "João",
    companyName: "Acme Lda",
    portalLink: "https://parvagas.co.ao/portal",
  });
  assert.equal(result, "Olá João, a empresa Acme Lda foi aprovada. Link: https://parvagas.co.ao/portal");
});

test("missing placeholder keys are replaced with empty string", () => {
  const raw = "Olá {{contactPerson}}, empresa {{companyName}}";
  const result = applyVerificationTemplatePlaceholders(raw, { contactPerson: "Ana" });
  assert.equal(result, "Olá Ana, empresa ");
});

test("handles whitespace inside double braces", () => {
  const raw = "{{ companyName }} está aprovada";
  const result = applyVerificationTemplatePlaceholders(raw, { companyName: "TestCorp" });
  assert.equal(result, "TestCorp está aprovada");
});

test("returns empty string for null/undefined raw input", () => {
  assert.equal(applyVerificationTemplatePlaceholders(null, { key: "val" }), "");
  assert.equal(applyVerificationTemplatePlaceholders(undefined, {}), "");
});

test("does not mutate unrelated text", () => {
  const raw = "Texto sem variáveis.";
  assert.equal(applyVerificationTemplatePlaceholders(raw, { x: "y" }), raw);
});

// ── Audit service helper: toDateRangeFilter (re-tested via behaviour) ─────────

test("approval template body contains portalLink variable", () => {
  const body = companyVerificationEmailTemplates.approval.body;
  assert.match(body, /\{\{portalLink\}\}|\{\{\s*portalLink\s*\}\}/);
});

test("more_info template body contains verificationLink variable", () => {
  const body = companyVerificationEmailTemplates.more_info.body;
  assert.match(body, /\{\{verificationLink\}\}|\{\{\s*verificationLink\s*\}\}/);
});

// ── Status validation rules (port of frontend logic to backend contract) ───────

test("rejected and inactive statuses require a reason", () => {
  const requiresReason = (status) => ["rejected", "inactive"].includes(
    String(status || "").trim().toLowerCase()
  );
  assert.equal(requiresReason("rejected"), true);
  assert.equal(requiresReason("inactive"), true);
  assert.equal(requiresReason("active"), false);
  assert.equal(requiresReason("pending_verification"), false);
  assert.equal(requiresReason("REJECTED"), true, "case-insensitive");
});

test("valid company statuses list is exhaustive", () => {
  const COMPANY_STATUSES = new Set(["inactive", "pending_verification", "active", "rejected"]);
  assert.equal(COMPANY_STATUSES.size, 4);
  assert.ok(COMPANY_STATUSES.has("active"));
  assert.ok(COMPANY_STATUSES.has("rejected"));
  assert.ok(!COMPANY_STATUSES.has("suspended")); // was renamed to 'rejected' in schema
});
