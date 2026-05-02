const base = "http://localhost:3001";
const stamp = Date.now();

const json = async (res) => {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
};

async function req(path, opts = {}) {
  const res = await fetch(base + path, opts);
  const body = await json(res);
  return { status: res.status, body };
}

async function register({ fullName, email, password, role, adminLevel, adminSignupKey }) {
  return req("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fullName, email, password, role, adminLevel, adminSignupKey }),
  });
}

async function login(email, password) {
  return req("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function auth(path, token, opts = {}) {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    ...(opts.headers || {}),
  };
  return req(path, { ...opts, headers });
}

async function run() {
  const ownerEmail = `owner.${stamp}@parvagas.test`;
  const recruiterEmail = `recruiter.${stamp}@parvagas.test`;
  const viewerEmail = `viewer.${stamp}@parvagas.test`;
  const pendingEmail = `pending.${stamp}@parvagas.test`;
  const candidateEmail = `candidate.${stamp}@parvagas.test`;
  const adminEmail = `admin.${stamp}@parvagas.test`;

  const ownerPass = "OwnerPass@123";
  const recruiterPass = "Recruiter@123";
  const recruiterPass2 = "RecruiterNew@123";
  const viewerPass = "Viewer@123";
  const viewerPass2 = "ViewerNew@123";
  const candidatePass = "Candidate@123";
  const adminPass = "AdminPass@123";

  const out = { checklist: {}, matrix: {} };

  out.checklist.ownerRegister = await register({ fullName: "Owner E2E", email: ownerEmail, password: ownerPass, role: "company" });
  const ownerLogin = await login(ownerEmail, ownerPass);
  out.checklist.ownerLogin = { status: ownerLogin.status };
  const ownerToken = ownerLogin.body.token;

  out.checklist.companyRegister = await auth("/companies/register", ownerToken, {
    method: "POST",
    body: JSON.stringify({
      companyName: `Parvagas QA ${stamp}`,
      industry: "Tech",
      location: "Luanda",
      contactEmail: ownerEmail,
    }),
  });

  const inviteRecruiter = await auth("/companies/team/invite", ownerToken, {
    method: "POST",
    body: JSON.stringify({ email: recruiterEmail, teamRole: "recruiter", expiresInDays: 7 }),
  });
  const inviteViewer = await auth("/companies/team/invite", ownerToken, {
    method: "POST",
    body: JSON.stringify({ email: viewerEmail, teamRole: "viewer", expiresInDays: 3 }),
  });
  const invitePending = await auth("/companies/team/invite", ownerToken, {
    method: "POST",
    body: JSON.stringify({ email: pendingEmail, teamRole: "viewer", expiresInDays: 14 }),
  });
  out.checklist.inviteCreateRecruiter = { status: inviteRecruiter.status };
  out.checklist.inviteCreateViewer = { status: inviteViewer.status };
  out.checklist.inviteCreatePending = { status: invitePending.status };

  const pendingInviteId = invitePending.body?.invite?._id;
  const recruiterInviteToken = inviteRecruiter.body?.invite?.token;
  const viewerInviteToken = inviteViewer.body?.invite?.token;

  const listInvites = await auth("/companies/team/invites", ownerToken);
  out.checklist.inviteList = {
    status: listInvites.status,
    count: Array.isArray(listInvites.body?.invites) ? listInvites.body.invites.length : 0,
  };

  out.checklist.inviteResend = await auth(`/companies/team/invites/${pendingInviteId}/resend`, ownerToken, { method: "POST" });
  out.checklist.inviteRevoke = await auth(`/companies/team/invites/${pendingInviteId}/revoke`, ownerToken, { method: "POST" });

  out.checklist.acceptRecruiterInvite = await req("/auth/company-invite/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken: recruiterInviteToken, fullName: "Recruiter E2E", password: recruiterPass }),
  });
  const recruiterLogin1 = await login(recruiterEmail, recruiterPass);
  out.checklist.recruiterFirstLogin = {
    status: recruiterLogin1.status,
    requiresPasswordReset: Boolean(recruiterLogin1.body?.requiresPasswordReset),
  };
  const recruiterResetToken = recruiterLogin1.body?.resetToken;
  out.checklist.recruiterFirstLoginReset = await req("/auth/first-login-reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resetToken: recruiterResetToken, newPassword: recruiterPass2 }),
  });
  const recruiterLogin2 = await login(recruiterEmail, recruiterPass2);
  out.checklist.recruiterSecondLogin = { status: recruiterLogin2.status };
  const recruiterToken = recruiterLogin2.body?.token;

  out.checklist.acceptViewerInvite = await req("/auth/company-invite/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inviteToken: viewerInviteToken, fullName: "Viewer E2E", password: viewerPass }),
  });
  const viewerLogin1 = await login(viewerEmail, viewerPass);
  out.checklist.viewerFirstLogin = {
    status: viewerLogin1.status,
    requiresPasswordReset: Boolean(viewerLogin1.body?.requiresPasswordReset),
  };
  const viewerResetToken = viewerLogin1.body?.resetToken;
  out.checklist.viewerFirstLoginReset = await req("/auth/first-login-reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resetToken: viewerResetToken, newPassword: viewerPass2 }),
  });
  const viewerLogin2 = await login(viewerEmail, viewerPass2);
  out.checklist.viewerSecondLogin = { status: viewerLogin2.status };
  const viewerToken = viewerLogin2.body?.token;

  out.matrix.profile_owner = (await auth("/companies/profile", ownerToken, { method: "PATCH", body: JSON.stringify({ description: `owner-${stamp}` }) })).status;
  out.matrix.profile_recruiter = (await auth("/companies/profile", recruiterToken, { method: "PATCH", body: JSON.stringify({ description: `recruiter-${stamp}` }) })).status;
  out.matrix.profile_viewer = (await auth("/companies/profile", viewerToken, { method: "PATCH", body: JSON.stringify({ description: `viewer-${stamp}` }) })).status;

  const ownerJob = await auth("/companies/jobs", ownerToken, {
    method: "POST",
    body: JSON.stringify({ title: `Owner Job ${stamp}`, description: "desc", visibility: "public", location: "Luanda" }),
  });
  const recruiterJob = await auth("/companies/jobs", recruiterToken, {
    method: "POST",
    body: JSON.stringify({ title: `Recruiter Job ${stamp}`, description: "desc", visibility: "public", location: "Luanda" }),
  });
  const viewerJob = await auth("/companies/jobs", viewerToken, {
    method: "POST",
    body: JSON.stringify({ title: `Viewer Job ${stamp}`, description: "desc", visibility: "public", location: "Luanda" }),
  });
  out.matrix.jobs_owner = ownerJob.status;
  out.matrix.jobs_recruiter = recruiterJob.status;
  out.matrix.jobs_viewer = viewerJob.status;

  out.matrix.invite_owner = (await auth("/companies/team/invite", ownerToken, { method: "POST", body: JSON.stringify({ email: `owner.extra.${stamp}@parvagas.test`, teamRole: "viewer" }) })).status;
  out.matrix.invite_recruiter = (await auth("/companies/team/invite", recruiterToken, { method: "POST", body: JSON.stringify({ email: `rec.extra.${stamp}@parvagas.test`, teamRole: "viewer" }) })).status;
  out.matrix.invite_viewer = (await auth("/companies/team/invite", viewerToken, { method: "POST", body: JSON.stringify({ email: `view.extra.${stamp}@parvagas.test`, teamRole: "viewer" }) })).status;

  out.matrix.applications_owner_read = (await auth("/companies/applications", ownerToken)).status;
  out.matrix.applications_recruiter_read = (await auth("/companies/applications", recruiterToken)).status;
  out.matrix.applications_viewer_read = (await auth("/companies/applications", viewerToken)).status;

  out.checklist.adminRegister = await register({
    fullName: "Admin E2E",
    email: adminEmail,
    password: adminPass,
    role: "admin",
    adminLevel: "super-admin",
    adminSignupKey: process.env.ADMIN_SIGNUP_KEY || "",
  });
  const adminLogin = await login(adminEmail, adminPass);
  const adminToken = adminLogin.body?.token;
  out.checklist.adminLogin = { status: adminLogin.status };

  const jobForApplication = await auth("/companies/jobs", ownerToken, {
    method: "POST",
    body: JSON.stringify({ title: `Approved Job ${stamp}`, description: "desc", visibility: "public", location: "Luanda" }),
  });
  const jobForApplicationId = jobForApplication.body?.job?._id;
  out.checklist.ownerJobPending = { status: jobForApplication.status, jobId: jobForApplicationId };

  out.checklist.adminModerateJob = await auth(`/admin/jobs/${jobForApplicationId}/moderate`, adminToken, {
    method: "PATCH",
    body: JSON.stringify({ status: "approved", visibility: "public" }),
  });

  out.checklist.candidateRegister = await register({ fullName: "Candidate E2E", email: candidateEmail, password: candidatePass, role: "candidate" });
  const candidateLogin = await login(candidateEmail, candidatePass);
  out.checklist.candidateLogin = { status: candidateLogin.status };
  const candidateToken = candidateLogin.body?.token;

  const createdApplication = await auth("/applications", candidateToken, {
    method: "POST",
    body: JSON.stringify({ jobId: jobForApplicationId, profileSnapshot: { fullName: "Candidate E2E", skills: ["node"] } }),
  });
  out.checklist.candidateCreateApplication = { status: createdApplication.status };
  const applicationId = createdApplication.body?.application?._id;

  out.matrix.application_status_recruiter = (await auth(`/applications/${applicationId}/status`, recruiterToken, { method: "PATCH", body: JSON.stringify({ status: "interview" }) })).status;
  out.matrix.application_status_viewer = (await auth(`/applications/${applicationId}/status`, viewerToken, { method: "PATCH", body: JSON.stringify({ status: "shortlisted" }) })).status;

  console.log(JSON.stringify(out, null, 2));
}

run().catch((err) => {
  console.error(JSON.stringify({ error: err.message }, null, 2));
  process.exit(1);
});
