import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server.js";
import { clearAllModelTables } from "../db/modelFactory.js";
import { calculateJobMatch, calculateProfileCompletion } from "../services/matchingService.js";
import CareerPost from "../models/careerPost.js";
import User from "../models/user.js";
import Company from "../models/company.js";
import Job from "../models/job.js";

const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!process.env.ADMIN_SIGNUP_KEY) process.env.ADMIN_SIGNUP_KEY = "test-admin-key";
const app = createApp();

if (!hasSupabase) {
  test("integration suite is skipped without Supabase env", { skip: true }, () => {});
} else {
  const uniqueEmail = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@parvagas.ao`;

  async function registerAndLogin({
    role = "candidate",
    adminLevel,
    fullName = "Test User",
    email,
    password = "Pass1234!",
  } = {}) {
    const resolvedEmail = email || uniqueEmail(role);
    const normalizedRole = String(role || "candidate").toLowerCase();

    const register = await request(app).post("/auth/register").send({
      fullName,
      email: resolvedEmail,
      password,
      role: normalizedRole,
      acceptTerms: true,
      acceptPrivacy: true,
      ...(adminLevel ? { adminLevel } : {}),
      ...(normalizedRole === "admin"
        ? { adminSignupKey: process.env.ADMIN_SIGNUP_KEY || "test-admin-key" }
        : {}),
      ...(normalizedRole === "company"
        ? {
            companyName: `Company ${Date.now()}`,
            legalName: `Company ${Date.now()} Legal`,
            nif: `AO${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
          }
        : {}),
    });
    assert.strictEqual(register.status, 201);

    if (normalizedRole === "admin") {
      await User.findByIdAndUpdate(register.body.user._id, { firstLoginRequired: false });
    }

    const login = await request(app).post("/auth/login").send({
      email: resolvedEmail,
      password,
    });
    assert.strictEqual(login.status, 200);

    return {
      token: login.body.token,
      user: login.body.user,
      email: resolvedEmail,
      password,
    };
  }

  async function approveCandidateProfile(token) {
    const profileDraft = {
      fullName: "Candidate Profile",
      email: uniqueEmail("profile"),
      phone: "+244900000000",
      location: "Luanda",
      nationality: "Angolana",
      professionalTitle: "Software Engineer",
      summary: "Perfil validado para testes com competências reais, disponibilidade clara e foco em backend moderno.",
      experience: [{ company: "X", jobTitle: "Dev", startDate: "2023-01", endDate: "2024-01", description: "Entrega de APIs." }],
      education: [{ institution: "Uni", degree: "Licenciatura", startDate: "2018-01", endDate: "2022-12" }],
      skills: ["JavaScript", "Node.js"],
      languages: ["Português"],
      certifications: [],
      preferredRoles: ["Backend Developer"],
      preferredLocations: ["Luanda"],
      preferredJobType: "tempo_integral",
      expectedSalaryAoa: 250000,
      availability: "imediata",
    };

    const res = await request(app)
      .post("/candidates/profile/approve")
      .set("Authorization", `Bearer ${token}`)
      .send({ profileDraft, consentGiven: true });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.profile?._id);
    return res.body.profile;
  }

  async function createCompanyAndPublicJob() {
    const companyAuth = await registerAndLogin({ role: "company", fullName: "Acme Recruiter" });

    const companyRes = await request(app)
      .post("/companies/register")
      .set("Authorization", `Bearer ${companyAuth.token}`)
      .send({
        companyName: "Acme Ltd",
        legalName: "Acme Legal Ltd",
        industry: "Tech",
        companySize: "10-50",
        location: "Luanda",
        contactPerson: "HR Lead",
        contactEmail: uniqueEmail("hr"),
      });

    assert.strictEqual(companyRes.status, 201);
    assert.ok(companyRes.body.company?._id);
    const companyId = companyRes.body.company._id;

    // Admin must verify the company before it can post jobs
    const adminAuth = await registerAndLogin({ role: "admin" });
    const verifyRes = await request(app)
      .patch(`/companies/${companyId}/verification`)
      .set("Authorization", `Bearer ${adminAuth.token}`)
      .send({ status: "active" });
    assert.strictEqual(verifyRes.status, 200);

    // Refresh token so company claims (companyId/team context) are fully aligned after registration.
    const refreshedCompanyLogin = await request(app).post("/auth/login").send({
      email: companyAuth.email,
      password: companyAuth.password,
    });
    assert.strictEqual(refreshedCompanyLogin.status, 200);
    const refreshedCompanyAuth = {
      ...companyAuth,
      token: refreshedCompanyLogin.body.token,
      user: refreshedCompanyLogin.body.user,
    };

    const jobRes = await request(app)
      .post("/companies/jobs")
      .set("Authorization", `Bearer ${refreshedCompanyAuth.token}`)
      .send({
        title: "Backend Engineer",
        description: "Build APIs",
        location: "Luanda",
        provinceCity: "Luanda",
        category: "Engineering",
        requiredSkills: ["Node.js"],
        preferredSkills: ["TypeScript"],
        visibility: "public",
      });

    assert.strictEqual(jobRes.status, 201);
    assert.ok(jobRes.body.job?._id);
    assert.strictEqual(jobRes.body.job.status, "published");
    const jobId = jobRes.body.job._id;

    return {
      companyAuth: refreshedCompanyAuth,
      companyId,
      jobId,
    };
  }

  test("health: unauthenticated protected routes are blocked", async () => {
    await clearAllModelTables();

    const candidates = await request(app).get("/candidates/profile");
    assert.strictEqual(candidates.status, 403);

    const admin = await request(app).get("/admin/overview");
    assert.strictEqual(admin.status, 403);
  });

  test("auth: register and login candidate", async () => {
    await clearAllModelTables();
    const auth = await registerAndLogin({ role: "candidate" });
    assert.ok(auth.token);
    assert.ok(auth.user?._id);
  });

  test("auth: duplicate email returns 409", async () => {
    await clearAllModelTables();
    const email = uniqueEmail("dup");

    const first = await request(app).post("/auth/register").send({
      fullName: "Dup User",
      email,
      password: "Pass1234!",
      role: "candidate",
      acceptTerms: true,
      acceptPrivacy: true,
    });
    assert.strictEqual(first.status, 201);

    const second = await request(app).post("/auth/register").send({
      fullName: "Dup User",
      email,
      password: "Pass1234!",
      role: "candidate",
      acceptTerms: true,
      acceptPrivacy: true,
    });
    assert.strictEqual(second.status, 409);
  });

  test("users: get own profile and update password", async () => {
    await clearAllModelTables();
    const auth = await registerAndLogin({ role: "candidate" });

    const profile = await request(app)
      .get(`/users/${auth.user._id}`)
      .set("Authorization", `Bearer ${auth.token}`);
    assert.strictEqual(profile.status, 200);
    assert.strictEqual(profile.body._id, auth.user._id);

    const update = await request(app)
      .patch(`/users/${auth.user._id}/password`)
      .set("Authorization", `Bearer ${auth.token}`)
      .send({ currentPassword: "Pass1234!", newPassword: "New5678!" });
    assert.strictEqual(update.status, 200);

    const relogin = await request(app).post("/auth/login").send({
      email: auth.email,
      password: "New5678!",
    });
    assert.strictEqual(relogin.status, 200);
  });

  test("auth: new login invalidates previous session token", async () => {
    await clearAllModelTables();
    const auth = await registerAndLogin({ role: "candidate" });

    const secondLogin = await request(app).post("/auth/login").send({
      email: auth.email,
      password: auth.password,
    });
    assert.strictEqual(secondLogin.status, 200);

    const firstSessionRequest = await request(app)
      .get(`/users/${auth.user._id}`)
      .set("Authorization", `Bearer ${auth.token}`);
    assert.strictEqual(firstSessionRequest.status, 401);

    const secondSessionRequest = await request(app)
      .get(`/users/${auth.user._id}`)
      .set("Authorization", `Bearer ${secondLogin.body.token}`);
    assert.strictEqual(secondSessionRequest.status, 200);
  });

  test("auth: inactive sessions are rejected", async () => {
    await clearAllModelTables();
    const previousTimeout = process.env.AUTH_SESSION_IDLE_TIMEOUT_MS;
    process.env.AUTH_SESSION_IDLE_TIMEOUT_MS = "1000";

    const auth = await registerAndLogin({ role: "candidate" });
    await User.findByIdAndUpdate(auth.user._id, {
      lastActivityAt: new Date(Date.now() - 5_000).toISOString(),
    });

    const expiredRequest = await request(app)
      .get(`/users/${auth.user._id}`)
      .set("Authorization", `Bearer ${auth.token}`);
    assert.strictEqual(expiredRequest.status, 401);

    process.env.AUTH_SESSION_IDLE_TIMEOUT_MS = previousTimeout;
  });

  test("jobs: public listing and public companies endpoints", async () => {
    await clearAllModelTables();
    await createCompanyAndPublicJob();

    const jobs = await request(app).get("/jobs");
    assert.strictEqual(jobs.status, 200);
    assert.ok(Array.isArray(jobs.body.jobs));

    const companies = await request(app).get("/jobs/companies");
    assert.strictEqual(companies.status, 200);
    assert.ok(Array.isArray(companies.body.companies));
  });

  test("jobs: non-existent detail returns 404", async () => {
    await clearAllModelTables();
    const res = await request(app).get("/jobs/00000000-0000-0000-0000-000000000000");
    assert.strictEqual(res.status, 404);
  });

  test("companies: register, fetch profile, and list own jobs", async () => {
    await clearAllModelTables();
    const { companyAuth, jobId } = await createCompanyAndPublicJob();

    const me = await request(app)
      .get("/companies/me")
      .set("Authorization", `Bearer ${companyAuth.token}`);
    assert.strictEqual(me.status, 200);
    assert.ok(me.body.company?._id);

    const jobs = await request(app)
      .get("/companies/jobs")
      .set("Authorization", `Bearer ${companyAuth.token}`);
    assert.strictEqual(jobs.status, 200);
    assert.ok(Array.isArray(jobs.body.jobs));
    assert.ok(jobs.body.jobs.some((job) => job._id === jobId));
  });

  test("candidates: approve profile, save job, list saved and recommendations", async () => {
    await clearAllModelTables();
    const { jobId } = await createCompanyAndPublicJob();
    const candidate = await registerAndLogin({ role: "candidate" });

    await approveCandidateProfile(candidate.token);

    const save = await request(app)
      .post("/candidates/jobs/save")
      .set("Authorization", `Bearer ${candidate.token}`)
      .send({ jobId });
    assert.strictEqual(save.status, 200);

    const saved = await request(app)
      .get("/candidates/jobs/saved")
      .set("Authorization", `Bearer ${candidate.token}`);
    assert.strictEqual(saved.status, 200);
    assert.ok(Array.isArray(saved.body.jobs));

    const rec = await request(app)
      .get("/candidates/jobs/recommended")
      .set("Authorization", `Bearer ${candidate.token}`);
    assert.strictEqual(rec.status, 200);
    assert.ok(Array.isArray(rec.body.jobs));
  });

  test("candidates: apply to public approved job and list my applications", async () => {
    await clearAllModelTables();
    const { jobId } = await createCompanyAndPublicJob();
    const candidate = await registerAndLogin({ role: "candidate" });
    await approveCandidateProfile(candidate.token);

    const apply = await request(app)
      .post("/candidates/jobs/apply")
      .set("Authorization", `Bearer ${candidate.token}`)
      .field("jobId", jobId);
    assert.strictEqual(apply.status, 201);
    assert.ok(apply.body.application?._id);

    const mine = await request(app)
      .get("/candidates/applications")
      .set("Authorization", `Bearer ${candidate.token}`);
    assert.strictEqual(mine.status, 200);
    assert.ok(Array.isArray(mine.body.applications));
  });

  test("applications: create, read, update status, delete", async () => {
    await clearAllModelTables();
    const { jobId } = await createCompanyAndPublicJob();
    const candidate = await registerAndLogin({ role: "candidate" });

    const create = await request(app)
      .post("/applications")
      .set("Authorization", `Bearer ${candidate.token}`)
      .send({
        jobId,
        profileSnapshot: {
          fullName: "Applicant",
          skills: ["Node.js"],
        },
      });
    assert.strictEqual(create.status, 201);
    const applicationId = create.body.application._id;

    const getOne = await request(app)
      .get(`/applications/${applicationId}`)
      .set("Authorization", `Bearer ${candidate.token}`);
    assert.strictEqual(getOne.status, 200);
    assert.strictEqual(getOne.body.application._id, applicationId);

    const patch = await request(app)
      .patch(`/applications/${applicationId}/status`)
      .set("Authorization", `Bearer ${candidate.token}`)
      .send({ status: "interview" });
    assert.strictEqual(patch.status, 403); // Candidates cannot set hiring statuses

    const withdraw = await request(app)
      .patch(`/applications/${applicationId}/status`)
      .set("Authorization", `Bearer ${candidate.token}`)
      .send({ status: "withdrawn" });
    assert.strictEqual(withdraw.status, 200);

    const del = await request(app)
      .delete(`/applications/${applicationId}`)
      .set("Authorization", `Bearer ${candidate.token}`);
    assert.strictEqual(del.status, 200);
  });

  test("candidates: alerts and notification preferences", async () => {
    await clearAllModelTables();
    const candidate = await registerAndLogin({ role: "candidate" });

    const createAlert = await request(app)
      .post("/candidates/alerts")
      .set("Authorization", `Bearer ${candidate.token}`)
      .send({ keywords: ["developer"], location: "Luanda", frequency: "daily" });
    assert.strictEqual(createAlert.status, 201);

    const listAlerts = await request(app)
      .get("/candidates/alerts")
      .set("Authorization", `Bearer ${candidate.token}`);
    assert.strictEqual(listAlerts.status, 200);
    assert.ok(Array.isArray(listAlerts.body.alerts));

    const putPrefs = await request(app)
      .put("/candidates/notifications/preferences")
      .set("Authorization", `Bearer ${candidate.token}`)
      .send({ email: true, push: false });
    assert.strictEqual(putPrefs.status, 200);

    const getPrefs = await request(app)
      .get("/candidates/notifications/preferences")
      .set("Authorization", `Bearer ${candidate.token}`);
    assert.strictEqual(getPrefs.status, 200);
  });

  test("admin: overview, suspend user, ads and scraped review flow", async () => {
    await clearAllModelTables();
    const admin = await registerAndLogin({ role: "admin" });
    const target = await registerAndLogin({ role: "candidate" });

    const overview = await request(app)
      .get("/admin/overview")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(overview.status, 200);

    const analytics = await request(app)
      .get("/admin/analytics")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(analytics.status, 200);
    assert.ok(analytics.body.business);
    assert.notStrictEqual(analytics.body.business.revenueInRange, null);
    assert.ok(Array.isArray(analytics.body.series.revenue));

    const suspend = await request(app)
      .patch(`/admin/users/${target.user._id}/suspend`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ suspended: true, reason: "comportamento abusivo" });
    assert.strictEqual(suspend.status, 200);
    assert.strictEqual(suspend.body.user.suspended, true);

    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000).toISOString();
    const nextWeek = new Date(now.getTime() + 7 * 86400000).toISOString();

    const createAd = await request(app)
      .post("/admin/ads")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        title: "Campaign",
        placement: "homepage_banner",
        active: true,
        startDate: yesterday,
        endDate: nextWeek,
        link: "https://example.com",
      });
    assert.strictEqual(createAd.status, 201);
    const adId = createAd.body.ad._id;

    const listAds = await request(app)
      .get("/admin/ads")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(listAds.status, 200);
    assert.ok(Array.isArray(listAds.body.ads));

    const imp = await request(app)
      .post(`/admin/ads/${adId}/impression`)
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(imp.status, 200);

    const click = await request(app)
      .post(`/admin/ads/${adId}/click`)
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(click.status, 200);

    const scrapedCreate = await request(app)
      .post("/admin/scraped-jobs")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ title: "Scraped Dev", company: "Source Co", location: "Luanda", sourceUrl: "https://source.example/job/1" });
    assert.strictEqual(scrapedCreate.status, 201);

    const scrapedId = scrapedCreate.body.scraped._id;
    const scrapedReview = await request(app)
      .patch(`/admin/scraped-jobs/${scrapedId}/review`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "approved" });
    assert.strictEqual(scrapedReview.status, 200);
  });

  test("admin: publishing a job persists across reloads", async () => {
    await clearAllModelTables();

    const owner = await registerAndLogin({ role: "company", fullName: "Owner" });
    const companyRes = await request(app)
      .post("/companies/register")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        companyName: "Publish Persist Corp",
        legalName: "Publish Persist Corp Lda",
        industry: "Tech",
        companySize: "11-50",
        location: "Luanda",
        contactPerson: "Owner",
        contactEmail: uniqueEmail("publish-owner"),
      });
    assert.strictEqual(companyRes.status, 201);
    const companyId = companyRes.body.company._id;

    // Company must be admin-verified before it can post jobs
    const adminVerifier = await registerAndLogin({ role: "admin" });
    const verifyRes = await request(app)
      .patch(`/companies/${companyId}/verification`)
      .set("Authorization", `Bearer ${adminVerifier.token}`)
      .send({ status: "active" });
    assert.strictEqual(verifyRes.status, 200);

    // Refresh owner token after verification so JWT claims are current
    const ownerRefresh = await request(app).post("/auth/login").send({
      email: owner.email,
      password: owner.password,
    });
    const ownerToken = ownerRefresh.body.token;

    const recruiter = await registerAndLogin({ role: "candidate", fullName: "Recruiter" });
    await User.findByIdAndUpdate(recruiter.user._id, {
      role: "company",
      companyId,
      companyTeamRole: "recruiter",
    });
    const recruiterLogin = await request(app).post("/auth/login").send({
      email: recruiter.email,
      password: recruiter.password,
    });
    assert.strictEqual(recruiterLogin.status, 200);

    const recruiterJob = await request(app)
      .post("/companies/jobs")
      .set("Authorization", `Bearer ${recruiterLogin.body.token}`)
      .send({
        title: "Persistent publish job",
        description: "Normal business role",
        visibility: "public",
        location: "Luanda",
      });
    assert.strictEqual(recruiterJob.status, 201);
    assert.strictEqual(recruiterJob.body.job.status, "pending_company_approval");

    const ownerApprove = await request(app)
      .patch(`/companies/job-approvals/${recruiterJob.body.job._id}/review`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ decision: "approve", reason: "ok", escalateToPlatformReview: true });
    assert.strictEqual(ownerApprove.status, 200);
    assert.strictEqual(ownerApprove.body.job.status, "pending_platform_review");

    const moderator = await registerAndLogin({ role: "admin", adminLevel: "moderator" });
    const publish = await request(app)
      .patch(`/admin/jobs/${recruiterJob.body.job._id}/moderate`)
      .set("Authorization", `Bearer ${moderator.token}`)
      .send({ status: "published", visibility: "public", reason: "policy clear" });
    assert.strictEqual(publish.status, 200);
    assert.strictEqual(publish.body.job.status, "published");

    const persisted = await Job.findById(recruiterJob.body.job._id);
    assert.strictEqual(persisted?.status, "published");
    assert.strictEqual(persisted?.visibility, "public");

    const adminList = await request(app)
      .get("/admin/jobs?status=published")
      .set("Authorization", `Bearer ${moderator.token}`);
    assert.strictEqual(adminList.status, 200);
    assert.ok(adminList.body.jobs.some((job) => job._id === recruiterJob.body.job._id));

    const publicDetail = await request(app).get(`/jobs/${recruiterJob.body.job._id}`);
    assert.strictEqual(publicDetail.status, 200);
    assert.strictEqual(publicDetail.body.job.status, "published");
  });

  test("admin: company verification normalizes aliases and rejects invalid transitions", async () => {
    await clearAllModelTables();

    const admin = await registerAndLogin({ role: "admin" });
    const owner = await registerAndLogin({ role: "company", fullName: "Owner" });
    const companyRes = await request(app)
      .post("/companies/register")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        companyName: "Status Flow Corp",
        legalName: "Status Flow Corp Lda",
        industry: "Tech",
        companySize: "11-50",
        location: "Luanda",
        contactPerson: "Owner",
        contactEmail: uniqueEmail("status-owner"),
      });
    assert.strictEqual(companyRes.status, 201);

    const activate = await request(app)
      .patch(`/companies/${companyRes.body.company._id}/verification`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "ativa" });
    assert.strictEqual(activate.status, 200);
    assert.strictEqual(activate.body.company.status, "active");

    const activeList = await request(app)
      .get("/admin/companies?status=active")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(activeList.status, 200);
    assert.ok(activeList.body.companies.some((company) => company._id === companyRes.body.company._id));

    const invalidBackToPending = await request(app)
      .patch(`/companies/${companyRes.body.company._id}/verification`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "pendente" });
    assert.strictEqual(invalidBackToPending.status, 400);
    assert.match(invalidBackToPending.body.error, /ativa/i);
    assert.match(invalidBackToPending.body.error, /pendente/i);

    const inactive = await request(app)
      .patch(`/companies/${companyRes.body.company._id}/verification`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "inativa", reason: "Encerramento temporário" });
    assert.strictEqual(inactive.status, 200);
    assert.strictEqual(inactive.body.company.status, "inactive");

    const reactivate = await request(app)
      .patch(`/companies/${companyRes.body.company._id}/verification`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "active" });
    assert.strictEqual(reactivate.status, 200);
    assert.strictEqual(reactivate.body.company.status, "active");

    const reject = await request(app)
      .patch(`/companies/${companyRes.body.company._id}/verification`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ status: "rejeitada", reason: "Documentação inválida" });
    assert.strictEqual(reject.status, 200);
    assert.strictEqual(reject.body.company.status, "rejected");

    const rejectedList = await request(app)
      .get("/admin/companies?status=rejected")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(rejectedList.status, 200);
    assert.ok(rejectedList.body.companies.some((company) => company._id === companyRes.body.company._id));
  });

  test("admin: paginated lists, admin level changes, and audit logs", async () => {
    await clearAllModelTables();
    const admin = await registerAndLogin({ role: "admin" });
    const moderator = await registerAndLogin({ role: "admin" });
    const candidate = await registerAndLogin({ role: "candidate" });

    const users = await request(app)
      .get("/admin/users?page=1&limit=2&role=admin")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(users.status, 200);
    assert.ok(Array.isArray(users.body.users));
    assert.ok(users.body.pagination);
    assert.strictEqual(users.body.pagination.limit, 2);

    const sortedCompanies = await request(app)
      .get("/admin/companies?page=1&limit=5&sortBy=name&sortDir=asc")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(sortedCompanies.status, 200);
    assert.ok(Array.isArray(sortedCompanies.body.companies));

    const sortedJobs = await request(app)
      .get("/admin/jobs?page=1&limit=5&sortBy=title&sortDir=asc")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(sortedJobs.status, 200);
    assert.ok(Array.isArray(sortedJobs.body.jobs));

    const level = await request(app)
      .patch(`/admin/users/${moderator.user._id}/admin-level`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ adminLevel: "moderator", reason: "alinhamento operacional" });
    assert.strictEqual(level.status, 200);
    assert.strictEqual(level.body.user.adminLevel, "moderator");

    const suspend = await request(app)
      .patch(`/admin/users/${candidate.user._id}/suspend`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ suspended: true, reason: "violação de políticas" });
    assert.strictEqual(suspend.status, 200);

    const audit = await request(app)
      .get("/admin/audit-logs?page=1&limit=5&resourceType=User")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(audit.status, 200);
    assert.ok(Array.isArray(audit.body.auditLogs));
    assert.ok(audit.body.pagination);

    const actions = await request(app)
      .get("/admin/admin-actions?page=1&limit=5&targetType=User")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(actions.status, 200);
    assert.ok(Array.isArray(actions.body.adminActions));
    assert.ok(actions.body.adminActions.some((action) => action.action === "user.adminLevel.update"));

    const exportUsers = await request(app)
      .get("/admin/exports/users.csv")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(exportUsers.status, 200);

    const readiness = await request(app)
      .get("/admin/launch-readiness")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(readiness.status, 200);
    assert.ok(readiness.body.summary);
    assert.ok(Array.isArray(readiness.body.checks));

    const exportActions = await request(app)
      .get("/admin/admin-actions?page=1&limit=20")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(exportActions.status, 200);
    assert.ok(exportActions.body.adminActions.some((action) => action.action === "exports.users.csv"));
  });

  test("admin permissions: moderator blocked from super-admin actions", async () => {
    await clearAllModelTables();
    const moderator = await registerAndLogin({ role: "admin", adminLevel: "moderator" });
    const candidate = await registerAndLogin({ role: "candidate" });

    const me = await request(app)
      .get("/admin/me")
      .set("Authorization", `Bearer ${moderator.token}`);
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.adminLevel, "moderator");

    const suspend = await request(app)
      .patch(`/admin/users/${candidate.user._id}/suspend`)
      .set("Authorization", `Bearer ${moderator.token}`)
      .send({ suspended: true, reason: "teste" });
    assert.strictEqual(suspend.status, 403);
    assert.match(suspend.body.error, /super-admin/i);

    const exportUsers = await request(app)
      .get("/admin/exports/users.csv")
      .set("Authorization", `Bearer ${moderator.token}`);
    assert.strictEqual(exportUsers.status, 403);

    const analytics = await request(app)
      .get("/admin/analytics")
      .set("Authorization", `Bearer ${moderator.token}`);
    assert.strictEqual(analytics.status, 200);
    assert.ok(analytics.body.totals);
    assert.ok(typeof analytics.body.totals.applications === "number");
    assert.ok(analytics.body.series);
    assert.ok(Array.isArray(analytics.body.series.jobsPosted));
    assert.ok(Array.isArray(analytics.body.series.applications));
    assert.ok(Array.isArray(analytics.body.distributions.applicationStatus));
    assert.strictEqual(analytics.body.business.revenueInRange, null);

    const applications = await request(app)
      .get("/admin/applications?page=1&limit=10")
      .set("Authorization", `Bearer ${moderator.token}`);
    assert.strictEqual(applications.status, 200);
    assert.ok(Array.isArray(applications.body.applications));
    assert.ok(applications.body.pagination);

    const createAd = await request(app)
      .post("/admin/ads")
      .set("Authorization", `Bearer ${moderator.token}`)
      .send({
        title: "Not allowed",
        placement: "homepage_banner",
        link: "https://example.com",
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      });
    assert.strictEqual(createAd.status, 201);

    const publishAttempt = await request(app)
      .patch(`/admin/ads/${createAd.body.ad._id}/status`)
      .set("Authorization", `Bearer ${moderator.token}`)
      .send({ active: true });
    assert.strictEqual(publishAttempt.status, 403);

    const launchReadiness = await request(app)
      .get("/admin/launch-readiness")
      .set("Authorization", `Bearer ${moderator.token}`);
    assert.strictEqual(launchReadiness.status, 403);
  });

  test("admin: suspension validates missing reason and self-suspension", async () => {
    await clearAllModelTables();

    const admin = await registerAndLogin({ role: "admin" });
    const candidate = await registerAndLogin({ role: "candidate" });

    const missingReason = await request(app)
      .patch(`/admin/users/${candidate.user._id}/suspend`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ suspended: true, reason: "" });
    assert.strictEqual(missingReason.status, 400);
    assert.match(missingReason.body.error, /reason/i);

    const selfSuspend = await request(app)
      .patch(`/admin/users/${admin.user._id}/suspend`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ suspended: true, reason: "teste" });
    assert.strictEqual(selfSuspend.status, 400);
    assert.match(selfSuspend.body.error, /própria conta/i);

    const missingUser = await request(app)
      .patch("/admin/users/00000000-0000-0000-0000-000000000000/suspend")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ suspended: true, reason: "teste" });
    assert.strictEqual(missingUser.status, 404);
    assert.match(missingUser.body.error, /não encontrado/i);
  });

  test("admin: ad validation rejects missing fields, invalid link and invalid date range", async () => {
    await clearAllModelTables();

    const admin = await registerAndLogin({ role: "admin" });

    const missingFields = await request(app)
      .post("/admin/ads")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ title: "", placement: "", link: "", startDate: "", endDate: "" });
    assert.strictEqual(missingFields.status, 400);
    assert.match(missingFields.body.error, /title/i);
    assert.match(missingFields.body.error, /placement/i);

    const invalidLink = await request(app)
      .post("/admin/ads")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        title: "Invalid link ad",
        placement: "homepage_banner",
        link: "destino-invalido",
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      });
    assert.strictEqual(invalidLink.status, 400);
    assert.match(invalidLink.body.error, /link inválido/i);

    const validCreate = await request(app)
      .post("/admin/ads")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        title: "Valid ad",
        placement: "homepage_banner",
        link: "https://example.com/promo",
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      });
    assert.strictEqual(validCreate.status, 201);

    const invalidReplace = await request(app)
      .put(`/admin/ads/${validCreate.body.ad._id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        title: "Valid ad",
        placement: "homepage_banner",
        link: "https://example.com/promo",
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date().toISOString(),
      });
    assert.strictEqual(invalidReplace.status, 400);
    assert.match(invalidReplace.body.error, /startdate/i);

    const validReplace = await request(app)
      .put(`/admin/ads/${validCreate.body.ad._id}`)
      .set("Authorization", `Bearer ${admin.token}`)
      .send({
        title: "Updated ad title",
        placement: "sidebar",
        link: "https://example.com/updated",
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
        active: true,
      });
    assert.strictEqual(validReplace.status, 200);
    assert.strictEqual(validReplace.body.ad.title, "Updated ad title");
    assert.strictEqual(validReplace.body.ad.placement, "sidebar");

    const listedAds = await request(app)
      .get("/admin/ads")
      .set("Authorization", `Bearer ${admin.token}`);
    assert.strictEqual(listedAds.status, 200);
    assert.ok(listedAds.body.ads.some((ad) => ad._id === validCreate.body.ad._id && ad.title === "Updated ad title"));
  });

  test("company workflow: recruiter requests approval, owner approves, moderator only handles escalated queue", async () => {
    await clearAllModelTables();

    const owner = await registerAndLogin({ role: "company", fullName: "Owner" });
    const companyRes = await request(app)
      .post("/companies/register")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({
        companyName: "Workflow Corp",
        legalName: "Workflow Corp Lda",
        industry: "Tech",
        companySize: "11-50",
        location: "Luanda",
        contactPerson: "Owner",
        contactEmail: uniqueEmail("workflow-owner"),
      });
    assert.strictEqual(companyRes.status, 201);
    const companyId = companyRes.body.company._id;

    // Company must be admin-verified before it can post jobs
    const adminVerifier = await registerAndLogin({ role: "admin" });
    const wfVerify = await request(app)
      .patch(`/companies/${companyId}/verification`)
      .set("Authorization", `Bearer ${adminVerifier.token}`)
      .send({ status: "active" });
    assert.strictEqual(wfVerify.status, 200);

    // Refresh owner token after verification
    const ownerRefresh = await request(app).post("/auth/login").send({
      email: owner.email,
      password: owner.password,
    });
    const ownerToken = ownerRefresh.body.token;

    const recruiter = await registerAndLogin({ role: "candidate", fullName: "Recruiter" });
    await User.findByIdAndUpdate(recruiter.user._id, {
      role: "company",
      companyId,
      companyTeamRole: "recruiter",
    });
    const recruiterLogin = await request(app).post("/auth/login").send({
      email: recruiter.email,
      password: recruiter.password,
    });
    assert.strictEqual(recruiterLogin.status, 200);
    const recruiterToken = recruiterLogin.body.token;

    const recruiterJob = await request(app)
      .post("/companies/jobs")
      .set("Authorization", `Bearer ${recruiterToken}`)
      .send({
        title: "Recruiter requested job",
        description: "Normal business role",
        visibility: "public",
        location: "Luanda",
      });
    assert.strictEqual(recruiterJob.status, 201);
    assert.strictEqual(recruiterJob.body.job.status, "pending_company_approval");
    assert.strictEqual(recruiterJob.body.job.assignedCompanyReviewerId, owner.user._id);

    const queue = await request(app)
      .get("/companies/job-approvals?status=pending_company_approval")
      .set("Authorization", `Bearer ${ownerToken}`);
    assert.strictEqual(queue.status, 200);
    assert.ok(Array.isArray(queue.body.approvals));
    assert.ok(queue.body.approvals.some((entry) => entry._id === recruiterJob.body.job._id));

    const ownerApprove = await request(app)
      .patch(`/companies/job-approvals/${recruiterJob.body.job._id}/review`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ decision: "approve", reason: "ok", escalateToPlatformReview: true });
    assert.strictEqual(ownerApprove.status, 200);
    assert.strictEqual(ownerApprove.body.job.status, "pending_platform_review");

    const moderator = await registerAndLogin({ role: "admin", adminLevel: "moderator" });
    const modPublish = await request(app)
      .patch(`/admin/jobs/${recruiterJob.body.job._id}/moderate`)
      .set("Authorization", `Bearer ${moderator.token}`)
      .send({ status: "published", visibility: "public", reason: "policy clear" });
    assert.strictEqual(modPublish.status, 200);

    const ownerDirectJob = await request(app)
      .post("/companies/jobs")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        title: "Owner direct publish",
        description: "Direct owner posting",
        visibility: "public",
      });
    assert.strictEqual(ownerDirectJob.status, 201);
    assert.strictEqual(ownerDirectJob.body.job.status, "published");
  });

  test("applications: company can view candidate CV only for own application", async () => {
    await clearAllModelTables();

    const { companyAuth, jobId } = await createCompanyAndPublicJob();
    const candidate = await registerAndLogin({ role: "candidate" });
    await approveCandidateProfile(candidate.token);

    const apply = await request(app)
      .post("/applications")
      .set("Authorization", `Bearer ${candidate.token}`)
      .send({
        jobId,
        profileSnapshot: { fullName: "Candidate A", email: candidate.email, skills: ["Node.js"] },
      });
    assert.strictEqual(apply.status, 201);

    const appId = apply.body.application._id;
    const companyCvAccess = await request(app)
      .get(`/applications/${appId}/candidate-cv`)
      .set("Authorization", `Bearer ${companyAuth.token}`);
    assert.strictEqual(companyCvAccess.status, 200);
    assert.ok(companyCvAccess.body.candidate);
    assert.ok(Array.isArray(companyCvAccess.body.documents));

    const outsider = await registerAndLogin({ role: "company", fullName: "Outsider" });
    const outsiderRegister = await request(app)
      .post("/companies/register")
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({
        companyName: "Outsider Corp",
        legalName: "Outsider Corp Lda",
        industry: "Tech",
        companySize: "11-50",
        location: "Luanda",
        contactPerson: "Outsider",
        contactEmail: uniqueEmail("outsider-hr"),
      });
    assert.strictEqual(outsiderRegister.status, 201);

    const outsiderCvAccess = await request(app)
      .get(`/applications/${appId}/candidate-cv`)
      .set("Authorization", `Bearer ${outsider.token}`);
    assert.strictEqual(outsiderCvAccess.status, 403);
  });

  test("public: quick apply creates guest candidate application", async () => {
    await clearAllModelTables();

    const { jobId } = await createCompanyAndPublicJob();
    const quickApply = await request(app)
      .post(`/public/jobs/${jobId}/quick-apply`)
      .field("fullName", "Guest Candidate")
      .field("email", uniqueEmail("guest-quick"))
      .field("phone", "+244900100100")
      .field("location", "Luanda")
      .field("coverLetter", "Tenho interesse nesta oportunidade.")
      .attach("cv", Buffer.from("dummy pdf"), {
        filename: "cv.pdf",
        contentType: "application/pdf",
      });

    assert.strictEqual(quickApply.status, 201);
    assert.ok(quickApply.body.applicationId);
    assert.ok(quickApply.body.candidateUserId);
  });

  test("public: cv submission stores candidate profile and document", async () => {
    await clearAllModelTables();

    const submission = await request(app)
      .post("/public/cv-submissions")
      .field("fullName", "Candidato Espontaneo")
      .field("email", uniqueEmail("spontaneo"))
      .field("cellphoneContact", "+244923000111")
      .field("city", "Luanda")
      .field("profession", "Engenheiro")
      .field("qualification", "Licenciatura")
      .field("personalStatement", "Disponivel para novas oportunidades.")
      .attach("cv", Buffer.from("dummy pdf"), {
        filename: "cv.pdf",
        contentType: "application/pdf",
      });

    assert.strictEqual(submission.status, 201);
    assert.ok(submission.body.candidateUserId);
  });

  test("public: ads and sitemap endpoints", async () => {
    await clearAllModelTables();

    const ads = await request(app).get("/public/ads");
    assert.strictEqual(ads.status, 200);
    assert.ok(Array.isArray(ads.body.ads));

    const sitemap = await request(app).get("/public/sitemap-jobs");
    assert.strictEqual(sitemap.status, 200);
    assert.ok(Array.isArray(sitemap.body.jobs));
  });

  test("public: homepage and career content endpoints", async () => {
    await clearAllModelTables();
    await createCompanyAndPublicJob();

    await CareerPost.create({
      slug: "como-preparar-cv-angola",
      title: "Como preparar um CV forte para vagas em Angola",
      category: "CV e Perfil",
      excerpt: "Estruture experiencia, resultados e competencias com foco no mercado angolano.",
      status: "published",
      featuredOnHome: true,
      publishedAt: new Date().toISOString(),
      readTime: "6 min",
      author: "Equipe Editorial Parvagas",
      body: ["Introducao", "Experiencia", "Competencias"],
      takeaways: ["Use resultados mensuraveis"],
    });

    const homepage = await request(app).get("/public/homepage");
    assert.strictEqual(homepage.status, 200);
    assert.ok(Array.isArray(homepage.body.featuredJobs));
    assert.ok(Array.isArray(homepage.body.featuredCareerPosts));

    const listPosts = await request(app).get("/public/career/posts");
    assert.strictEqual(listPosts.status, 200);
    assert.ok(Array.isArray(listPosts.body.posts));
    assert.strictEqual(listPosts.body.posts[0].slug, "como-preparar-cv-angola");

    const getPost = await request(app).get("/public/career/posts/como-preparar-cv-angola");
    assert.strictEqual(getPost.status, 200);
    assert.strictEqual(getPost.body.post.slug, "como-preparar-cv-angola");
  });

  test("utility: matching helpers return valid values", () => {
    const completion = calculateProfileCompletion({
      fullName: "Ana",
      email: "ana@parvagas.ao",
      phone: "+244900000001",
      location: "Luanda",
      nationality: "Angolana",
      professionalTitle: "Developer",
      summary: "Resumo",
      skills: ["Node.js"],
      experience: [{ role: "Dev" }],
      education: [{ degree: "Licenciatura" }],
      languages: ["Português"],
      preferredRoles: ["Backend"],
    });
    assert.ok(completion >= 0 && completion <= 100);

    const match = calculateJobMatch({
      profile: { skills: ["Node.js"], preferredLocations: ["Luanda"] },
      job: { requiredSkills: ["Node.js"], preferredSkills: ["TypeScript"], provinceCity: "Luanda" },
    });
    assert.equal(typeof match.score, "number");
  });

  test("candidate: partial profile save persists without all required fields", async () => {
    await clearAllModelTables();
    const { token } = await registerAndLogin({ role: "candidate", fullName: "Parcial User" });

    // Save only fullName — should succeed (no blocking required-field validation)
    const save1 = await request(app)
      .patch("/candidates/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ fullName: "Parcial User" });
    assert.strictEqual(save1.status, 200, `Expected 200 but got ${save1.status}: ${JSON.stringify(save1.body)}`);
    assert.ok(save1.body.isPartial === true, "Expected isPartial: true for incomplete profile");
    assert.strictEqual(save1.body.profile.fullName, "Parcial User");

    // Add email incrementally
    const save2 = await request(app)
      .patch("/candidates/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "parcial@parvagas.ao" });
    assert.strictEqual(save2.status, 200);
    // Existing fullName should be preserved after incremental save
    assert.strictEqual(save2.body.profile.fullName, "Parcial User");
    assert.strictEqual(save2.body.profile.email, "parcial@parvagas.ao");
  });

  test("candidate: partial save rejects invalid email format", async () => {
    await clearAllModelTables();
    const { token } = await registerAndLogin({ role: "candidate", fullName: "Format User" });

    const res = await request(app)
      .patch("/candidates/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "not-an-email" });
    assert.strictEqual(res.status, 400);
    assert.ok(Array.isArray(res.body.fieldErrors));
    const emailError = res.body.fieldErrors.find((e) => e.field === "email");
    assert.ok(emailError, "Expected email fieldError");
  });

  test("candidate: profile approve with full draft returns 200 and updates profile", async () => {
    await clearAllModelTables();
    const { token } = await registerAndLogin({ role: "candidate", fullName: "Approve User" });

    const profileDraft = {
      fullName: "Approve User",
      email: "approve@parvagas.ao",
      phone: "+244900000099",
      location: "Luanda",
      professionalTitle: "QA Engineer",
      summary: "Teste de aprovação de perfil gerado por IA com dados completos para validação.",
      skills: ["Testing", "Selenium"],
      experience: [{ jobTitle: "QA", company: "Acme", startDate: "2022-01", endDate: "2024-01" }],
      education: [{ degree: "Licenciatura", institution: "Uni", startDate: "2018-01", endDate: "2022-12" }],
      preferredJobType: "tempo_integral",
      availability: "imediata",
      expectedSalaryAoa: 200000,
    };

    const res = await request(app)
      .post("/candidates/profile/approve")
      .set("Authorization", `Bearer ${token}`)
      .send({ profileDraft, consentGiven: true });
    assert.strictEqual(res.status, 200, `Approve failed: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.profile.fullName, "Approve User");
  });

  test("candidate: summary-draft endpoint returns draft text", async () => {
    await clearAllModelTables();
    const { token } = await registerAndLogin({ role: "candidate", fullName: "Summary User" });

    const res = await request(app)
      .post("/candidates/profile/summary-draft")
      .set("Authorization", `Bearer ${token}`)
      .send({
        profile: {
          fullName: "Summary User",
          professionalTitle: "Frontend Developer",
          skills: ["React", "TypeScript"],
          experience: [{ jobTitle: "Dev", company: "Acme", startDate: "2022-01", endDate: "2024-01" }],
          education: [{ degree: "Licenciatura", institution: "Uni" }],
          availability: "imediata",
        },
      });
    // AI provider may be fallback or real — either way we expect 200 with a draft or a graceful warning
    assert.strictEqual(res.status, 200, `Summary draft failed: ${JSON.stringify(res.body)}`);
    assert.ok(
      typeof res.body.draft === "string" || typeof res.body.warning === "string",
      "Expected draft or warning in response"
    );
  });
}