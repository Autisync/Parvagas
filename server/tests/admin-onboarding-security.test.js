import test from "node:test";
import assert from "node:assert/strict";

import { buildCredentialEmailPayload, generateTemporaryPassword } from "../controller/admin.js";

test("temporary password generator creates strong password with all required classes", () => {
  const password = generateTemporaryPassword(16);
  assert.equal(password.length, 16);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /[0-9]/);
  assert.match(password, /[^A-Za-z0-9]/);
});

test("credential email payload with one-time link avoids plain password in body", () => {
  const payload = buildCredentialEmailPayload({
    fullName: "Admin User",
    email: "admin@example.com",
    role: "admin",
    temporaryPassword: "Temp!1234",
    credentialDeliveryMode: "set_password_link",
    loginPath: "/Admin/Login",
    firstAccessPath: "/Admin/Login?firstLoginToken=abc123",
  });

  assert.match(payload.subject, /Parvagas/i);
  assert.match(payload.body, /link único/i);
  assert.doesNotMatch(payload.body, /Temp!1234/);
  assert.match(payload.body, /Política de password/i);
});

test("credential email payload with temporary password includes password and reset guidance", () => {
  const payload = buildCredentialEmailPayload({
    fullName: "Candidate User",
    email: "candidate@example.com",
    role: "candidate",
    temporaryPassword: "Temp!1234",
    credentialDeliveryMode: "temporary_password",
    loginPath: "/Login?role=candidate",
    firstAccessPath: "",
  });

  assert.match(payload.body, /Password temporária: Temp!1234/);
  assert.match(payload.body, /redefina a password no primeiro login/i);
});
