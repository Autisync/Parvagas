/**
 * Comprehensive seed script – populates every Supabase table with ≥2 realistic records.
 *
 * Run:
 *   node --env-file=server/.env server/scripts/seedAllTables.mjs
 */

import bcrypt from "bcrypt";
import { randomUUID } from "crypto";

import User from "../models/user.js";
import Company from "../models/company.js";
import Job from "../models/job.js";
import Application from "../models/application.js";
import CandidateProfile from "../models/candidateProfile.js";
import CandidateDocument from "../models/candidateDocument.js";
import CompanyInvite from "../models/companyInvite.js";
import AdCampaign from "../models/adCampaign.js";
import AdminAction from "../models/adminAction.js";
import AIParseRun from "../models/aiParseRun.js";
import AuditLog from "../models/auditLog.js";
import CareerPost from "../models/careerPost.js";
import JobAlert from "../models/jobAlert.js";
import JobMatchScore from "../models/jobMatchScore.js";
import NotificationLog from "../models/notificationLog.js";
import NotificationPreference from "../models/notificationPreference.js";
import SavedJob from "../models/savedJob.js";
import ScrapedJob from "../models/scrapedJob.js";
import GeneratedCvProfile from "../models/generatedCvProfile.js";

// ─── helpers ────────────────────────────────────────────────────────────────
const id = () => randomUUID();
const now = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000).toISOString();

const log = (label, result) => {
  const count = Array.isArray(result) ? result.length : 1;
  console.log(`  ✓ ${label}: ${count} record(s)`);
};

const hashPw = (pw) => bcrypt.hashSync(pw, 10);

// ─── fixed IDs so we can cross-reference ────────────────────────────────────
const SUPERADMIN_ID = "cfc2a8a1-4660-4382-98d7-6bf177accf84"; // already exists
const MODERATOR_ID  = "5c04d4c1-3db6-4c33-92a0-f7e22284fa48"; // already exists

const CANDIDATE_A_ID = id();
const CANDIDATE_B_ID = id();
const COMPANY_OWNER_A_ID = id();
const COMPANY_OWNER_B_ID = id();
const RECRUITER_ID = id();

const COMPANY_A_ID = id();
const COMPANY_B_ID = id();

const JOB_A_ID = id();
const JOB_B_ID = id();
const JOB_C_ID = id();

const PROFILE_A_ID = id();
const PROFILE_B_ID = id();

// ─── 1. USERS ────────────────────────────────────────────────────────────────
async function seedUsers() {
  console.log("\n[users]");
  const pw = hashPw("Candidato#2026!");

  const candidateA = await User.create({
    _id: CANDIDATE_A_ID,
    fullName: "Ana Cristina Ferreira",
    email: "ana.ferreira@email.ao",
    password: pw,
    role: "candidate",
    profileComplete: true,
    suspended: false,
    firstLoginRequired: false,
    createdAt: daysAgo(30),
  });
  log("candidate A", candidateA);

  const candidateB = await User.create({
    _id: CANDIDATE_B_ID,
    fullName: "Miguel António Lopes",
    email: "miguel.lopes@email.ao",
    password: pw,
    role: "candidate",
    profileComplete: false,
    suspended: false,
    firstLoginRequired: false,
    createdAt: daysAgo(15),
  });
  log("candidate B", candidateB);

  const ownerA = await User.create({
    _id: COMPANY_OWNER_A_ID,
    fullName: "Diogo Sapalalo",
    email: "diogo.sapalalo@soltech.ao",
    password: pw,
    role: "company",
    companyTeamRole: "owner",
    suspended: false,
    firstLoginRequired: false,
    createdAt: daysAgo(60),
  });
  log("company owner A", ownerA);

  const ownerB = await User.create({
    _id: COMPANY_OWNER_B_ID,
    fullName: "Helena Nzinga",
    email: "helena.nzinga@angobuild.ao",
    password: pw,
    role: "company",
    companyTeamRole: "owner",
    suspended: false,
    firstLoginRequired: false,
    createdAt: daysAgo(45),
  });
  log("company owner B", ownerB);

  const recruiter = await User.create({
    _id: RECRUITER_ID,
    fullName: "Paulo Mateus",
    email: "paulo.mateus@soltech.ao",
    password: pw,
    role: "company",
    companyTeamRole: "recruiter",
    companyId: COMPANY_A_ID,
    suspended: false,
    firstLoginRequired: false,
    createdAt: daysAgo(20),
  });
  log("recruiter (company A)", recruiter);
}

// ─── 2. COMPANIES ────────────────────────────────────────────────────────────
async function seedCompanies() {
  console.log("\n[companies]");

  const companyA = await Company.create({
    _id: COMPANY_A_ID,
    companyName: "SolTech Angola",
    legalName: "SolTech Angola Lda.",
    nif: "5417832100",
    industry: "Tecnologia",
    companySize: "51-200",
    website: "https://soltech.ao",
    location: "Luanda, Angola",
    description: "Empresa líder em soluções tecnológicas para o mercado angolano. Especializada em desenvolvimento de software, cloud e cibersegurança.",
    contactEmail: "rh@soltech.ao",
    ownerUserId: COMPANY_OWNER_A_ID,
    verificationStatus: "verified",
    verifiedAt: daysAgo(10),
    teamMembers: [
      { userId: COMPANY_OWNER_A_ID, role: "owner" },
      { userId: RECRUITER_ID, role: "recruiter" },
    ],
    createdAt: daysAgo(60),
  });
  log("SolTech Angola", companyA);

  const companyB = await Company.create({
    _id: COMPANY_B_ID,
    companyName: "AngoBuild Construções",
    legalName: "AngoBuild Construções S.A.",
    nif: "9823401200",
    industry: "Construção Civil",
    companySize: "201-500",
    website: "https://angobuild.ao",
    location: "Luanda, Angola",
    description: "Empresa de construção civil e infraestruturas com vasta experiência no mercado angolano e projetos em todo o país.",
    contactEmail: "rh@angobuild.ao",
    ownerUserId: COMPANY_OWNER_B_ID,
    verificationStatus: "pending",
    teamMembers: [
      { userId: COMPANY_OWNER_B_ID, role: "owner" },
    ],
    createdAt: daysAgo(45),
  });
  log("AngoBuild Construções", companyB);
}

// ─── 3. JOBS ─────────────────────────────────────────────────────────────────
async function seedJobs() {
  console.log("\n[jobs]");

  const jobA = await Job.create({
    _id: JOB_A_ID,
    title: "Desenvolvedor Full-Stack",
    description: "Procuramos um desenvolvedor Full-Stack experiente para integrar a nossa equipa de produto. Irá trabalhar em projetos desafiantes para clientes dos setores bancário, energético e telecomunicações.",
    requirements: "React, Node.js, PostgreSQL, Docker, Git. Mínimo 3 anos de experiência.",
    benefits: "Salário competitivo, plano de saúde, formação contínua, trabalho híbrido.",
    salary: "USD 2.500 – 3.500 / mês",
    location: "Luanda, Angola",
    jobType: "full-time",
    workMode: "hybrid",
    experienceLevel: "mid",
    industry: "Tecnologia",
    skills: ["React", "Node.js", "PostgreSQL", "Docker"],
    companyId: COMPANY_A_ID,
    postedByUserId: COMPANY_OWNER_A_ID,
    status: "published",
    visibility: "public",
    approvedAt: daysAgo(5),
    approvedByUserId: SUPERADMIN_ID,
    expiresAt: daysFromNow(30),
    createdAt: daysAgo(7),
  });
  log("Desenvolvedor Full-Stack (SolTech, published)", jobA);

  const jobB = await Job.create({
    _id: JOB_B_ID,
    title: "Engenheiro Civil Sénior",
    description: "Empresa de construção civil em expansão precisa de Engenheiro Civil Sénior para liderar projetos de habitação e infraestruturas em Luanda e Benguela.",
    requirements: "Licenciatura em Engenharia Civil. Mínimo 5 anos de experiência em projetos residenciais e infraestruturas.",
    benefits: "Seguro de saúde, veículo de serviço, alojamento para deslocações.",
    salary: "USD 3.000 – 4.500 / mês",
    location: "Luanda / Benguela, Angola",
    jobType: "full-time",
    workMode: "on-site",
    experienceLevel: "senior",
    industry: "Construção Civil",
    skills: ["AutoCAD", "Gestão de Obras", "Orçamentação", "REVIT"],
    companyId: COMPANY_B_ID,
    postedByUserId: COMPANY_OWNER_B_ID,
    status: "pending_platform_review",
    visibility: "private",
    assignedModeratorId: MODERATOR_ID,
    createdAt: daysAgo(2),
  });
  log("Engenheiro Civil Sénior (AngoBuild, pending review)", jobB);

  const jobC = await Job.create({
    _id: JOB_C_ID,
    title: "Analista de Dados Júnior",
    description: "Oportunidade para recém-licenciado em Data Science ou Estatística. Irá apoiar a equipa de analytics na geração de relatórios e modelos preditivos.",
    requirements: "Python, SQL, Power BI. Conhecimento de machine learning é valorizado.",
    benefits: "Plano de carreira estruturado, mentoria, flexibilidade de horário.",
    salary: "USD 1.200 – 1.800 / mês",
    location: "Luanda, Angola",
    jobType: "full-time",
    workMode: "hybrid",
    experienceLevel: "junior",
    industry: "Tecnologia",
    skills: ["Python", "SQL", "Power BI"],
    companyId: COMPANY_A_ID,
    postedByUserId: RECRUITER_ID,
    status: "pending_company_approval",
    visibility: "private",
    assignedCompanyReviewerId: COMPANY_OWNER_A_ID,
    createdAt: daysAgo(1),
  });
  log("Analista de Dados Júnior (SolTech, pending company approval)", jobC);
}

// ─── 4. CANDIDATE PROFILES ───────────────────────────────────────────────────
async function seedCandidateProfiles() {
  console.log("\n[candidate_profiles]");

  const profileA = await CandidateProfile.create({
    _id: PROFILE_A_ID,
    userId: CANDIDATE_A_ID,
    fullName: "Ana Cristina Ferreira",
    email: "ana.ferreira@email.ao",
    phone: "+244 923 456 789",
    location: "Luanda, Angola",
    professionalTitle: "Frontend Developer",
    summary: "Desenvolvedora frontend com 4 anos de experiência em React e TypeScript. Apaixonada por UX e interfaces acessíveis.",
    bio: "Desenvolvedora frontend com 4 anos de experiência em React e TypeScript.",
    professionalSummary: "Desenvolvedora frontend com 4 anos de experiência em React e TypeScript. Apaixonada por UX e interfaces acessíveis.",
    preferredJobType: "tempo_integral",
    expectedSalaryAoa: 300000,
    availability: "imediata",
    skills: ["React", "TypeScript", "CSS", "Figma", "Git"],
    languages: ["Português (nativo)", "Inglês (B2)", "Francês (A2)"],
    certifications: ["AWS Cloud Practitioner", "Meta React Developer"],
    portfolioLinks: ["https://github.com/anaferreira", "https://anaferreira.dev"],
    preferredRoles: ["Frontend Developer", "UI Engineer"],
    preferredLocations: ["Luanda", "Remote"],
    experience: [
      {
        company: "StartupLuanda",
        title: "Frontend Developer",
        startDate: "2022-01",
        endDate: "present",
        description: "Desenvolvimento de aplicações React para clientes fintech.",
      },
      {
        company: "WebStudio AO",
        title: "Junior Web Developer",
        startDate: "2020-06",
        endDate: "2021-12",
        description: "Desenvolvimento de sites e landing pages para PMEs angolanas.",
      },
    ],
    education: [
      {
        institution: "Universidade Agostinho Neto",
        degree: "Licenciatura em Engenharia Informática",
        startDate: "2016-02",
        endDate: "2020-05",
      },
    ],
    completionScore: 95,
    createdAt: daysAgo(28),
  });
  log("Ana Ferreira profile", profileA);

  const profileB = await CandidateProfile.create({
    _id: PROFILE_B_ID,
    userId: CANDIDATE_B_ID,
    fullName: "Miguel António Lopes",
    email: "miguel.lopes@email.ao",
    phone: "+244 912 345 678",
    location: "Benguela, Angola",
    professionalTitle: "Engenheiro Civil",
    summary: "Engenheiro civil com 6 anos de experiência em projectos de habitação social e infra-estruturas rodoviárias.",
    bio: "Engenheiro civil com 6 anos de experiência.",
    professionalSummary: "Engenheiro civil com 6 anos de experiência em projectos de habitação social e infra-estruturas rodoviárias.",
    preferredJobType: "tempo_integral",
    expectedSalaryAoa: 550000,
    availability: "1_mes",
    skills: ["AutoCAD", "REVIT", "Gestão de Obras", "Orçamentação", "MS Project"],
    languages: ["Português (nativo)", "Inglês (B1)"],
    certifications: ["PMP – Project Management Professional"],
    portfolioLinks: [],
    preferredRoles: ["Engenheiro Civil Sénior", "Director de Obra"],
    preferredLocations: ["Benguela", "Luanda"],
    experience: [
      {
        company: "AngoBuild Construções",
        title: "Engenheiro Civil",
        startDate: "2020-03",
        endDate: "2024-11",
        description: "Supervisão de obras residenciais e estradas municipais.",
      },
      {
        company: "Odebrecht Angola",
        title: "Técnico de Obra",
        startDate: "2018-01",
        endDate: "2020-02",
        description: "Apoio técnico em projectos de grande escala.",
      },
    ],
    education: [
      {
        institution: "Universidade Técnica de Angola",
        degree: "Licenciatura em Engenharia Civil",
        startDate: "2013-02",
        endDate: "2017-12",
      },
    ],
    completionScore: 78,
    createdAt: daysAgo(12),
  });
  log("Miguel Lopes profile", profileB);
}

// ─── 5. APPLICATIONS ─────────────────────────────────────────────────────────
async function seedApplications() {
  console.log("\n[applications]");

  const appA = await Application.create({
    jobId: JOB_A_ID,
    companyId: COMPANY_A_ID,
    candidateUserId: CANDIDATE_A_ID,
    profileSnapshot: {
      fullName: "Ana Cristina Ferreira",
      email: "ana.ferreira@email.ao",
      professionalTitle: "Frontend Developer",
      skills: ["React", "TypeScript", "CSS"],
      summary: "Desenvolvedora frontend com 4 anos de experiência.",
    },
    status: "shortlisted",
    statusHistory: [
      { status: "submitted",  changedBy: CANDIDATE_A_ID,  changedAt: daysAgo(6) },
      { status: "viewed",     changedBy: COMPANY_OWNER_A_ID, changedAt: daysAgo(5) },
      { status: "shortlisted", changedBy: COMPANY_OWNER_A_ID, changedAt: daysAgo(3) },
    ],
    coverNote: "Tenho grande interesse nesta oportunidade e acredito que as minhas competências em React alinham perfeitamente com as necessidades da equipa.",
    createdAt: daysAgo(6),
  });
  log("Ana → SolTech Full-Stack (shortlisted)", appA);

  const appB = await Application.create({
    jobId: JOB_B_ID,
    companyId: COMPANY_B_ID,
    candidateUserId: CANDIDATE_B_ID,
    profileSnapshot: {
      fullName: "Miguel António Lopes",
      email: "miguel.lopes@email.ao",
      professionalTitle: "Engenheiro Civil",
      skills: ["AutoCAD", "REVIT", "Gestão de Obras"],
      summary: "Engenheiro civil com 6 anos de experiência.",
    },
    status: "submitted",
    statusHistory: [
      { status: "submitted", changedBy: CANDIDATE_B_ID, changedAt: daysAgo(1) },
    ],
    coverNote: "Estou muito motivado com esta oportunidade e tenho experiência directa em projetos semelhantes.",
    createdAt: daysAgo(1),
  });
  log("Miguel → AngoBuild Civil (submitted)", appB);
}

// ─── 6. CANDIDATE DOCUMENTS ──────────────────────────────────────────────────
async function seedCandidateDocuments() {
  console.log("\n[candidate_documents]");

  const docA = await CandidateDocument.create({
    userId: CANDIDATE_A_ID,
    type: "cv",
    fileName: "CV_Ana_Ferreira_2026.pdf",
    mimeType: "application/pdf",
    storagePath: `candidate-docs/${CANDIDATE_A_ID}/CV_Ana_Ferreira_2026.pdf`,
    sizeBytes: 312_450,
    uploadedAt: daysAgo(28),
  });
  log("Ana CV document", docA);

  const docB = await CandidateDocument.create({
    userId: CANDIDATE_B_ID,
    type: "cv",
    fileName: "CV_Miguel_Lopes_2026.pdf",
    mimeType: "application/pdf",
    storagePath: `candidate-docs/${CANDIDATE_B_ID}/CV_Miguel_Lopes_2026.pdf`,
    sizeBytes: 298_120,
    uploadedAt: daysAgo(12),
  });
  log("Miguel CV document", docB);

  const docC = await CandidateDocument.create({
    userId: CANDIDATE_B_ID,
    type: "certificate",
    fileName: "PMP_Certificate_MiguelLopes.pdf",
    mimeType: "application/pdf",
    storagePath: `candidate-docs/${CANDIDATE_B_ID}/PMP_Certificate_MiguelLopes.pdf`,
    sizeBytes: 145_600,
    uploadedAt: daysAgo(10),
  });
  log("Miguel PMP certificate", docC);
}

// ─── 7. SCRAPED JOBS ─────────────────────────────────────────────────────────
async function seedScrapedJobs() {
  console.log("\n[scraped_jobs]");

  const scrapedA = await ScrapedJob.create({
    sourceUrl: "https://emprego.ao/vaga/gestor-rh-2026",
    sourceName: "Emprego.ao",
    title: "Gestor de Recursos Humanos",
    company: "Grupo Refriango",
    location: "Luanda, Angola",
    description: "O Grupo Refriango procura Gestor de RH para liderar a área de recrutamento e desenvolvimento organizacional.",
    requirements: "Licenciatura em Gestão RH ou Psicologia Organizacional. 4+ anos de experiência.",
    salary: "USD 2.000 – 2.800",
    jobType: "full-time",
    industry: "Alimentar / FMCG",
    skills: ["Recrutamento", "Formação", "Avaliação de Desempenho"],
    status: "pending_review",
    scrapedAt: daysAgo(3),
    rawHtml: "<div class='job'>Gestor RH – Grupo Refriango</div>",
  });
  log("Scraped: Gestor RH – Refriango", scrapedA);

  const scrapedB = await ScrapedJob.create({
    sourceUrl: "https://linkedin.com/jobs/view/9988776655",
    sourceName: "LinkedIn",
    title: "Product Manager",
    company: "Unitel",
    location: "Luanda, Angola",
    description: "Unitel está à procura de um Product Manager para liderar o desenvolvimento de novos produtos digitais.",
    requirements: "MBA ou Licenciatura em áreas afins. Experiência com metodologias ágeis. Inglês fluente.",
    salary: "Negociável",
    jobType: "full-time",
    industry: "Telecomunicações",
    skills: ["Product Management", "Agile", "Roadmap", "Stakeholder Management"],
    status: "approved",
    reviewedByUserId: MODERATOR_ID,
    reviewedAt: daysAgo(1),
    scrapedAt: daysAgo(5),
    rawHtml: "<div class='job'>Product Manager – Unitel</div>",
  });
  log("Scraped: Product Manager – Unitel", scrapedB);
}

// ─── 8. COMPANY INVITES ──────────────────────────────────────────────────────
async function seedCompanyInvites() {
  console.log("\n[company_invites]");

  const inviteA = await CompanyInvite.create({
    companyId: COMPANY_A_ID,
    invitedByUserId: COMPANY_OWNER_A_ID,
    email: "candidata.nova@email.ao",
    role: "recruiter",
    token: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
    status: "pending",
    expiresAt: daysFromNow(7),
    createdAt: daysAgo(1),
  });
  log("Invite: SolTech → recruiter pending", inviteA);

  const inviteB = await CompanyInvite.create({
    companyId: COMPANY_B_ID,
    invitedByUserId: COMPANY_OWNER_B_ID,
    email: "manager.angobuild@gmail.com",
    role: "manager",
    token: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1",
    status: "accepted",
    acceptedAt: daysAgo(2),
    expiresAt: daysFromNow(5),
    createdAt: daysAgo(4),
  });
  log("Invite: AngoBuild → manager accepted", inviteB);
}

// ─── 9. AD CAMPAIGNS ─────────────────────────────────────────────────────────
async function seedAdCampaigns() {
  console.log("\n[ad_campaigns]");

  const adA = await AdCampaign.create({
    name: "SolTech – Q2 2026 Employer Brand",
    companyId: COMPANY_A_ID,
    type: "banner",
    placement: "homepage_hero",
    imageUrl: "https://cdn.parvagas.ao/ads/soltech-q2-2026.png",
    targetUrl: "https://soltech.ao/carreiras",
    active: true,
    impressions: 14_230,
    clicks: 892,
    budget: 1_500,
    spent: 620,
    startDate: daysAgo(10),
    endDate: daysFromNow(20),
    createdByUserId: SUPERADMIN_ID,
    createdAt: daysAgo(12),
  });
  log("Ad Campaign: SolTech banner (active)", adA);

  const adB = await AdCampaign.create({
    name: "AngoBuild – Engenheiros Urgente",
    companyId: COMPANY_B_ID,
    type: "sponsored_listing",
    placement: "jobs_feed_top",
    imageUrl: "https://cdn.parvagas.ao/ads/angobuild-engenheiros.png",
    targetUrl: `https://parvagas.ao/vagas/${JOB_B_ID}`,
    active: false,
    impressions: 3_200,
    clicks: 178,
    budget: 500,
    spent: 500,
    startDate: daysAgo(30),
    endDate: daysAgo(1),
    createdByUserId: SUPERADMIN_ID,
    createdAt: daysAgo(32),
  });
  log("Ad Campaign: AngoBuild sponsored (expired)", adB);
}

// ─── 10. ADMIN ACTIONS ───────────────────────────────────────────────────────
async function seedAdminActions() {
  console.log("\n[admin_actions]");

  const actionA = await AdminAction.create({
    adminUserId: SUPERADMIN_ID,
    adminLevel: "super-admin",
    actionType: "company.verify",
    resourceType: "Company",
    resourceId: COMPANY_A_ID,
    details: { companyName: "SolTech Angola", previousStatus: "pending", newStatus: "verified" },
    reason: "Documentação completa e NIF verificado junto da AGT.",
    createdAt: daysAgo(10),
  });
  log("Admin action: company verify (SolTech)", actionA);

  const actionB = await AdminAction.create({
    adminUserId: MODERATOR_ID,
    adminLevel: "moderator",
    actionType: "job.assign_review",
    resourceType: "Job",
    resourceId: JOB_B_ID,
    details: { jobTitle: "Engenheiro Civil Sénior", assignedTo: MODERATOR_ID },
    reason: "Vaga atribuída para revisão de moderação.",
    createdAt: daysAgo(2),
  });
  log("Admin action: job assign review (moderator)", actionB);

  const actionC = await AdminAction.create({
    adminUserId: SUPERADMIN_ID,
    adminLevel: "super-admin",
    actionType: "user.suspend",
    resourceType: "User",
    resourceId: CANDIDATE_B_ID,
    details: { email: "miguel.lopes@email.ao", suspendedAt: daysAgo(5) },
    reason: "Violação dos termos de uso: perfil com informação falsa. Suspensão temporária de 7 dias.",
    createdAt: daysAgo(5),
  });
  log("Admin action: user suspend (super-admin)", actionC);
}

// ─── 11. AUDIT LOGS ──────────────────────────────────────────────────────────
async function seedAuditLogs() {
  console.log("\n[audit_logs]");

  const logA = await AuditLog.create({
    actorUserId: CANDIDATE_A_ID,
    action: "application.create",
    resourceType: "Application",
    resourceId: "auto-generated",
    details: { jobId: JOB_A_ID, jobTitle: "Desenvolvedor Full-Stack" },
    ip: "196.28.45.12",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    createdAt: daysAgo(6),
  });
  log("Audit: application.create (Ana)", logA);

  const logB = await AuditLog.create({
    actorUserId: SUPERADMIN_ID,
    action: "company.verify",
    resourceType: "Company",
    resourceId: COMPANY_A_ID,
    details: { companyName: "SolTech Angola" },
    ip: "10.0.0.1",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    createdAt: daysAgo(10),
  });
  log("Audit: company.verify (superadmin)", logB);

  const logC = await AuditLog.create({
    actorUserId: COMPANY_OWNER_A_ID,
    action: "job.create",
    resourceType: "Job",
    resourceId: JOB_A_ID,
    details: { jobTitle: "Desenvolvedor Full-Stack", status: "published" },
    ip: "196.28.45.20",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
    createdAt: daysAgo(7),
  });
  log("Audit: job.create (SolTech owner)", logC);
}

// ─── 12. AI PARSE RUNS ───────────────────────────────────────────────────────
async function seedAiParseRuns() {
  console.log("\n[ai_parse_runs]");

  const runA = await AIParseRun.create({
    userId: CANDIDATE_A_ID,
    documentId: "doc-ana-cv-uuid",
    status: "success",
    provider: "openai",
    inputTokens: 1_240,
    outputTokens: 680,
    durationMs: 3_200,
    parsedFields: {
      fullName: "Ana Cristina Ferreira",
      skills: ["React", "TypeScript", "CSS"],
      experienceYears: 4,
    },
    createdAt: daysAgo(27),
  });
  log("AI Parse Run: Ana CV (success)", runA);

  const runB = await AIParseRun.create({
    userId: CANDIDATE_B_ID,
    documentId: "doc-miguel-cv-uuid",
    status: "success",
    provider: "openai",
    inputTokens: 1_580,
    outputTokens: 820,
    durationMs: 4_100,
    parsedFields: {
      fullName: "Miguel António Lopes",
      skills: ["AutoCAD", "REVIT", "Gestão de Obras"],
      experienceYears: 6,
    },
    createdAt: daysAgo(11),
  });
  log("AI Parse Run: Miguel CV (success)", runB);

  const runC = await AIParseRun.create({
    userId: CANDIDATE_A_ID,
    documentId: "doc-ana-cv-v2-uuid",
    status: "failed",
    provider: "openai",
    error: "rate_limit_exceeded",
    durationMs: 800,
    createdAt: daysAgo(14),
  });
  log("AI Parse Run: Ana CV v2 (failed – rate limit)", runC);
}

// ─── 13. CAREER POSTS ────────────────────────────────────────────────────────
async function seedCareerPosts() {
  console.log("\n[career_posts]");

  const postA = await CareerPost.create({
    title: "Como Preparar um CV Vencedor para o Mercado Angolano",
    slug: "como-preparar-cv-vencedor-mercado-angolano",
    excerpt: "Descubra as técnicas mais eficazes para criar um currículo que se destaque nas pilhas de candidaturas dos recrutadores em Angola.",
    content: `## Introdução\n\nO mercado de trabalho angolano está em transformação. Com mais empresas a adoptarem processos de recrutamento digitais, o seu CV precisa de ser ao mesmo tempo conciso e impactante.\n\n## Dicas Principais\n\n1. **Cabeçalho claro** – Nome, contacto, LinkedIn e localização.\n2. **Resumo profissional** – 3 frases que vendem o seu valor.\n3. **Experiência relevante** – Foque nos últimos 5–7 anos.\n4. **Palavras-chave** – Use os termos das ofertas de emprego.\n5. **Formato PDF** – Nunca envie .doc para recrutadores.\n\n## Conclusão\n\nInvista 2 horas no seu CV. Vale a pena.`,
    authorUserId: SUPERADMIN_ID,
    category: "Dicas de Carreira",
    tags: ["CV", "Recrutamento", "Mercado de Trabalho", "Angola"],
    status: "published",
    publishedAt: daysAgo(14),
    readTimeMinutes: 5,
    viewCount: 1_203,
    createdAt: daysAgo(15),
  });
  log("Career Post: CV Vencedor (published)", postA);

  const postB = await CareerPost.create({
    title: "Entrevista de Emprego: 10 Erros Que Custam a Vaga",
    slug: "entrevista-emprego-10-erros-que-custam-vaga",
    excerpt: "Evite os erros mais comuns que fazem os candidatos perderem oportunidades de ouro nas entrevistas de emprego.",
    content: `## Os 10 Erros Mais Comuns\n\n1. Chegar atrasado\n2. Não pesquisar a empresa\n3. Responder com monossilábicos\n4. Falar mal de empregos anteriores\n5. Não ter perguntas para fazer\n6. Vestuário inapropriado\n7. Usar o telemóvel\n8. Exagerar nas qualificações\n9. Não mostrar entusiasmo\n10. Não enviar follow-up\n\n## Como Evitá-los\n\nPreparação é tudo. Pesquise a empresa, prepare exemplos concretos e vista-se adequadamente.`,
    authorUserId: SUPERADMIN_ID,
    category: "Dicas de Carreira",
    tags: ["Entrevista", "Soft Skills", "Carreira"],
    status: "draft",
    readTimeMinutes: 6,
    viewCount: 0,
    createdAt: daysAgo(3),
  });
  log("Career Post: 10 Erros Entrevista (draft)", postB);
}

// ─── 14. JOB ALERTS ──────────────────────────────────────────────────────────
async function seedJobAlerts() {
  console.log("\n[job_alerts]");

  const alertA = await JobAlert.create({
    userId: CANDIDATE_A_ID,
    name: "Frontend em Luanda",
    keywords: "React TypeScript frontend",
    location: "Luanda",
    jobType: "full-time",
    industry: "Tecnologia",
    frequency: "daily",
    active: true,
    lastNotifiedAt: daysAgo(1),
    createdAt: daysAgo(20),
  });
  log("Job Alert: Ana – Frontend Luanda (daily)", alertA);

  const alertB = await JobAlert.create({
    userId: CANDIDATE_B_ID,
    name: "Engenharia Civil Angola",
    keywords: "engenheiro civil obra",
    location: "Angola",
    jobType: "full-time",
    industry: "Construção Civil",
    frequency: "weekly",
    active: true,
    lastNotifiedAt: daysAgo(7),
    createdAt: daysAgo(10),
  });
  log("Job Alert: Miguel – Eng. Civil Angola (weekly)", alertB);
}

// ─── 15. JOB MATCH SCORES ────────────────────────────────────────────────────
async function seedJobMatchScores() {
  console.log("\n[job_match_scores]");

  const scoreA = await JobMatchScore.create({
    userId: CANDIDATE_A_ID,
    jobId: JOB_A_ID,
    profileId: PROFILE_A_ID,
    score: 88,
    breakdown: {
      skills: 92,
      experience: 85,
      location: 100,
      jobType: 80,
      salaryMatch: 75,
    },
    matchedSkills: ["React", "TypeScript", "CSS"],
    missingSkills: ["Docker"],
    calculatedAt: daysAgo(5),
  });
  log("Match Score: Ana ↔ Full-Stack (88%)", scoreA);

  const scoreB = await JobMatchScore.create({
    userId: CANDIDATE_B_ID,
    jobId: JOB_B_ID,
    profileId: PROFILE_B_ID,
    score: 94,
    breakdown: {
      skills: 96,
      experience: 98,
      location: 90,
      jobType: 100,
      salaryMatch: 88,
    },
    matchedSkills: ["AutoCAD", "REVIT", "Gestão de Obras"],
    missingSkills: [],
    calculatedAt: daysAgo(1),
  });
  log("Match Score: Miguel ↔ Eng. Civil (94%)", scoreB);
}

// ─── 16. NOTIFICATION LOGS ───────────────────────────────────────────────────
async function seedNotificationLogs() {
  console.log("\n[notification_logs]");

  const notifA = await NotificationLog.create({
    userId: COMPANY_OWNER_A_ID,
    channel: "email",
    toEmail: "diogo.sapalalo@soltech.ao",
    subject: "Nova candidatura para Desenvolvedor Full-Stack",
    body: "Recebeu uma nova candidatura de Ana Cristina Ferreira para a vaga Desenvolvedor Full-Stack.",
    status: "delivered",
    deliveredAt: daysAgo(6),
    metadata: { applicationId: "auto-gen", jobId: JOB_A_ID },
    createdAt: daysAgo(6),
  });
  log("Notification: new application email → SolTech owner", notifA);

  const notifB = await NotificationLog.create({
    userId: CANDIDATE_A_ID,
    channel: "email",
    toEmail: "ana.ferreira@email.ao",
    subject: "A sua candidatura foi colocada em shortlist!",
    body: "Parabéns! A sua candidatura para a vaga Desenvolvedor Full-Stack na SolTech Angola foi colocada em shortlist.",
    status: "delivered",
    deliveredAt: daysAgo(3),
    metadata: { applicationId: "auto-gen", jobId: JOB_A_ID },
    createdAt: daysAgo(3),
  });
  log("Notification: shortlisted email → Ana", notifB);

  const notifC = await NotificationLog.create({
    userId: CANDIDATE_B_ID,
    channel: "email",
    toEmail: "miguel.lopes@email.ao",
    subject: "Alerta de emprego: Engenheiro Civil Sénior disponível",
    body: "Uma nova vaga correspondente ao seu alerta 'Engenharia Civil Angola' foi publicada.",
    status: "delivered",
    deliveredAt: daysAgo(2),
    metadata: { jobId: JOB_B_ID, alertId: "auto-gen" },
    createdAt: daysAgo(2),
  });
  log("Notification: job alert email → Miguel", notifC);
}

// ─── 17. NOTIFICATION PREFERENCES ───────────────────────────────────────────
async function seedNotificationPreferences() {
  console.log("\n[notification_preferences]");

  const prefA = await NotificationPreference.create({
    userId: CANDIDATE_A_ID,
    emailEnabled: true,
    jobAlerts: true,
    applicationUpdates: true,
    marketingEmails: false,
    weeklyDigest: true,
    frequency: "daily",
    updatedAt: daysAgo(20),
  });
  log("Notification Prefs: Ana (emails on, no marketing)", prefA);

  const prefB = await NotificationPreference.create({
    userId: CANDIDATE_B_ID,
    emailEnabled: true,
    jobAlerts: true,
    applicationUpdates: true,
    marketingEmails: true,
    weeklyDigest: false,
    frequency: "weekly",
    updatedAt: daysAgo(10),
  });
  log("Notification Prefs: Miguel (all on, weekly)", prefB);
}

// ─── 18. SAVED JOBS ──────────────────────────────────────────────────────────
async function seedSavedJobs() {
  console.log("\n[saved_jobs]");

  const savedA = await SavedJob.create({
    userId: CANDIDATE_A_ID,
    jobId: JOB_C_ID,
    savedAt: daysAgo(1),
  });
  log("Saved Job: Ana saved Analista de Dados Júnior", savedA);

  const savedB = await SavedJob.create({
    userId: CANDIDATE_B_ID,
    jobId: JOB_A_ID,
    savedAt: daysAgo(3),
  });
  log("Saved Job: Miguel saved Desenvolvedor Full-Stack", savedB);
}

// ─── 19. GENERATED CV PROFILES ───────────────────────────────────────────────
async function seedGeneratedCvProfiles() {
  console.log("\n[generated_cv_profiles]");

  const genA = await GeneratedCvProfile.create({
    userId: CANDIDATE_A_ID,
    targetField: "Frontend Developer",
    generatedText: "Ana Cristina Ferreira é uma desenvolvedora frontend com 4 anos de experiência em React e TypeScript. Demonstrou capacidade de entregar interfaces de alta qualidade para clientes nos sectores fintech e e-commerce. Destaca-se pela atenção ao detalhe em UX e pela adopção rápida de novas tecnologias.",
    inputProfileSnapshot: {
      skills: ["React", "TypeScript", "CSS"],
      experience: 4,
    },
    generatedAt: daysAgo(14),
    provider: "openai",
    tokensUsed: 420,
  });
  log("Generated CV Profile: Ana – Frontend Developer", genA);

  const genB = await GeneratedCvProfile.create({
    userId: CANDIDATE_B_ID,
    targetField: "Construction",
    generatedText: "Miguel António Lopes é um Engenheiro Civil Sénior com 6 anos de experiência comprovada em projectos residenciais, infra-estruturas rodoviárias e supervisão de obra em Angola. Detém certificação PMP e domina ferramentas como AutoCAD, REVIT e MS Project.",
    inputProfileSnapshot: {
      skills: ["AutoCAD", "REVIT", "Gestão de Obras"],
      experience: 6,
    },
    generatedAt: daysAgo(8),
    provider: "openai",
    tokensUsed: 380,
  });
  log("Generated CV Profile: Miguel – Construction", genB);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Parvagas – Full Database Seed ===");
  console.log(`Timestamp: ${now()}\n`);

  try {
    await seedUsers();
    await seedCompanies();
    await seedJobs();
    await seedCandidateProfiles();
    await seedApplications();
    await seedCandidateDocuments();
    await seedScrapedJobs();
    await seedCompanyInvites();
    await seedAdCampaigns();
    await seedAdminActions();
    await seedAuditLogs();
    await seedAiParseRuns();
    await seedCareerPosts();
    await seedJobAlerts();
    await seedJobMatchScores();
    await seedNotificationLogs();
    await seedNotificationPreferences();
    await seedSavedJobs();
    await seedGeneratedCvProfiles();

    console.log("\n=== Seed complete! All 19 tables populated. ===");
  } catch (err) {
    if (String(err.message).includes("generated_cv_profiles") && String(err.message).includes("schema cache")) {
      console.warn("\n[WARN] generated_cv_profiles table not found in schema cache.");
      console.warn("  Run migration first in Supabase SQL Editor:");
      console.warn("    server/migrations/2026-04-29-candidate-cv-profiles.sql");
      console.warn("  Then re-run: node --env-file=server/.env server/scripts/seedAllTables.mjs\n");
      console.warn("  18/19 tables seeded successfully.\n");
      process.exit(0);
    }
    console.error("\n[SEED ERROR]", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
