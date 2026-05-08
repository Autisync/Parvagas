import test from "node:test";
import assert from "node:assert/strict";

import {
  canTransitionCompanyStatus,
  describeCompanyStatus,
  normalizeCompanyStatusInput,
} from "../services/companyVerificationStatusService.js";
import {
  validateAdCampaignPayload,
  validateSuspensionRequest,
} from "../services/adminValidationService.js";
import { applyJobModeration } from "../services/jobModerationService.js";
import { Permissions, hasPermission } from "../services/rbacService.js";

test("job moderation applies publish status and keeps updated values for persistence", () => {
  const job = {
    status: "pending_platform_review",
    visibility: "private",
    platformModerationReason: "",
  };

  const updated = applyJobModeration(job, {
    status: "published",
    visibility: "public",
    reason: "policy clear",
  });

  assert.equal(updated.status, "published");
  assert.equal(updated.visibility, "public");
  assert.equal(updated.platformModerationReason, "policy clear");
});

test("job moderation rejects invalid platform transition", () => {
  assert.throws(
    () => applyJobModeration({ status: "platform_rejected", visibility: "private" }, { status: "published" }),
    /Transição inválida/
  );
});

test("company verification status normalizes localized aliases", () => {
  assert.equal(normalizeCompanyStatusInput("pendente"), "pending_verification");
  assert.equal(normalizeCompanyStatusInput("ativa"), "active");
  assert.equal(normalizeCompanyStatusInput("rejeitada"), "rejected");
  assert.equal(normalizeCompanyStatusInput("inativa"), "inactive");
});

test("company verification transitions reject active back to pending", () => {
  assert.equal(canTransitionCompanyStatus("active", "pending_verification"), false);
  assert.equal(canTransitionCompanyStatus("pending_verification", "active"), true);
  assert.equal(canTransitionCompanyStatus("inactive", "active"), true);
  assert.equal(describeCompanyStatus("pending_verification"), "pendente");
});

test("suspension validation rejects unauthorized, missing reason and self-suspend", () => {
  assert.deepEqual(
    validateSuspensionRequest({
      actorAdminLevel: "moderator",
      actorUserId: "admin-1",
      targetUserId: "user-1",
      suspended: true,
      reason: "teste",
    }),
    { status: 403, message: "Apenas super-admin pode suspender ou reativar utilizadores." }
  );

  assert.deepEqual(
    validateSuspensionRequest({
      actorAdminLevel: "super-admin",
      actorUserId: "admin-1",
      targetUserId: "user-1",
      suspended: true,
      reason: "",
    }),
    { status: 400, message: "reason é obrigatório para suspender/reativar utilizadores." }
  );

  assert.deepEqual(
    validateSuspensionRequest({
      actorAdminLevel: "super-admin",
      actorUserId: "admin-1",
      targetUserId: "admin-1",
      suspended: true,
      reason: "teste",
    }),
    { status: 400, message: "Não pode suspender a sua própria conta." }
  );
});

test("ad validation catches missing fields, invalid link and invalid dates", () => {
  assert.match(validateAdCampaignPayload({}), /title/);
  assert.match(
    validateAdCampaignPayload({
      title: "Promo",
      placement: "homepage_banner",
      link: "destino-invalido",
      startDate: "2026-05-06T00:00:00.000Z",
      endDate: "2026-05-07T00:00:00.000Z",
    }),
    /link inválido/i
  );
  assert.match(
    validateAdCampaignPayload({
      title: "Promo",
      placement: "homepage_banner",
      link: "https://example.com",
      startDate: "2026-05-08T00:00:00.000Z",
      endDate: "2026-05-07T00:00:00.000Z",
    }),
    /startDate/i
  );
  assert.equal(
    validateAdCampaignPayload({
      title: "Promo",
      placement: "homepage_banner",
      link: "https://example.com",
      startDate: "2026-05-06T00:00:00.000Z",
      endDate: "2026-05-07T00:00:00.000Z",
    }),
    ""
  );
});

test("moderator permission baseline includes requested moderation permissions", () => {
  const moderator = { role: "admin", adminLevel: "moderator" };
  assert.equal(hasPermission(moderator, Permissions.JOB_REVIEW), true);
  assert.equal(hasPermission(moderator, Permissions.JOB_APPROVE), true);
  assert.equal(hasPermission(moderator, Permissions.JOB_REJECT), true);
  assert.equal(hasPermission(moderator, Permissions.AD_FLAG), true);
  assert.equal(hasPermission(moderator, Permissions.AD_PAUSE), true);
  assert.equal(hasPermission(moderator, Permissions.AD_DRAFT), true);
  assert.equal(hasPermission(moderator, Permissions.AD_PUBLISH), false);
});