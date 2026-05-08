import test from "node:test";
import assert from "node:assert/strict";
import {
  companyVerificationEmailTemplates,
  applyVerificationTemplatePlaceholders,
} from "../config/companyVerificationEmailTemplates.js";

test("company verification templates include required variants", () => {
  assert.ok(companyVerificationEmailTemplates.approval);
  assert.ok(companyVerificationEmailTemplates.more_info);
  assert.ok(companyVerificationEmailTemplates.rejected);
});

test("template placeholder replacement injects company context", () => {
  const raw = "Olá {{contactPerson}}, empresa {{companyName}}";
  const output = applyVerificationTemplatePlaceholders(raw, {
    contactPerson: "Ana",
    companyName: "Acme",
  });

  assert.equal(output, "Olá Ana, empresa Acme");
});
