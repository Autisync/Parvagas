import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config({ path: "server/.env" });

import User from "../models/user.js";
import Company from "../models/company.js";
import CandidateProfile from "../models/candidateProfile.js";
import Job from "../models/job.js";
import CareerPost from "../models/careerPost.js";
import AdCampaign from "../models/adCampaign.js";

const seedTag = "seed-dummy-2026-05";
const defaultPassword = "Parvagas@2026";

const plusDaysIso = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

async function upsertUser({ fullName, email, role, adminLevel, companyTeamRole }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });

  if (existing) {
    const patch = {
      fullName,
      role,
      adminLevel: role === "admin" ? adminLevel || "moderator" : undefined,
      companyTeamRole: role === "company" ? companyTeamRole || "owner" : undefined,
      seedTag,
    };
    const updated = await User.findByIdAndUpdate(existing._id, patch, { new: true });
    return updated;
  }

  const salt = await bcrypt.genSalt();
  const password = await bcrypt.hash(defaultPassword, salt);
  return User.create({
    fullName,
    email: normalizedEmail,
    password,
    role,
    adminLevel: role === "admin" ? adminLevel || "moderator" : undefined,
    companyTeamRole: role === "company" ? companyTeamRole || "owner" : undefined,
    firstLoginRequired: false,
    seedTag,
  });
}

async function upsertCompany({ ownerUserId, name, legalName, nif, location, industry }) {
  const existing = await Company.findOne({ nif });
  const payload = {
    ownerUserId,
    name,
    legalName,
    nif,
    industry,
    size: "11-50",
    website: "https://empresa-demo.parvagas.ao",
    location,
    description: "Empresa demo para validacao do fluxo de vagas e portal empresarial.",
    contactPerson: "Equipe RH Demo",
    contactEmail: "rh.demo@parvagas.ao",
    phone: "+244 923 000 111",
    verificationStatus: "verified",
    seedTag,
  };

  if (existing) {
    return Company.findByIdAndUpdate(existing._id, payload, { new: true });
  }

  return Company.create(payload);
}

async function upsertCandidateProfile({ userId, fullName, email }) {
  return CandidateProfile.findOneAndUpdate(
    { userId },
    {
      userId,
      fullName,
      email,
      phone: "+244 923 555 333",
      location: "Luanda",
      professionalTitle: "Frontend Developer",
      summary:
        "Desenvolvedor frontend com experiencia em React e TypeScript, foco em interfaces acessiveis e alta performance.",
      professionalSummary:
        "Desenvolvedor frontend com experiencia em React e TypeScript, foco em interfaces acessiveis e alta performance.",
      preferredJobType: "tempo_integral",
      availability: "imediata",
      expectedSalaryAoa: 950000,
      skills: ["React", "TypeScript", "Tailwind", "REST APIs"],
      languages: ["Portugues", "Ingles"],
      certifications: ["Scrum Foundation"],
      education: [
        {
          degree: "Licenciatura em Engenharia Informatica",
          institution: "Universidade Agostinho Neto",
          location: "Luanda",
          startDate: "2017-02",
          endDate: "2021-11",
          description: "Formacao superior com foco em desenvolvimento web e arquitetura de software.",
        },
      ],
      experience: [
        {
          jobTitle: "Frontend Developer",
          company: "Studio Digital AO",
          location: "Luanda",
          startDate: "2022-01",
          endDate: "",
          current: true,
          description: "Implementacao de componentes reutilizaveis e otimizacao de performance em Next.js.",
        },
      ],
      seedTag,
    },
    { upsert: true, new: true }
  );
}

async function upsertJob({ companyId, createdByUserId }) {
  const title = "Frontend Developer React (Demo)";
  const existing = await Job.findOne({ title, companyId });
  const payload = {
    companyId,
    createdByUserId,
    title,
    location: "Luanda",
    mode: "Hibrido",
    category: "Tecnologia",
    description:
      "Estamos a contratar frontend developer para evolucao de produtos digitais com React, TypeScript e boas praticas de UX.",
    requiredSkills: ["React", "TypeScript", "HTML", "CSS"],
    requiredExperienceYears: 2,
    salaryMin: 700000,
    salaryMax: 1200000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    featuredOnHome: true,
    expiresAt: plusDaysIso(45),
    seedTag,
  };

  if (existing) {
    return Job.findByIdAndUpdate(existing._id, payload, { new: true });
  }

  return Job.create(payload);
}

async function upsertCareerTip({ adminUserId }) {
  const slug = "como-melhorar-cv-primeiro-emprego-demo";
  const existing = await CareerPost.findOne({ slug });
  const payload = {
    title: "Como Melhorar o CV para Primeiro Emprego",
    slug,
    category: "CV",
    excerpt: "Passos praticos para montar um CV forte mesmo sem longa experiencia profissional.",
    content:
      "Comece com um resumo objetivo, destaque projetos academicos, cursos e competencias tecnicas relevantes para a vaga pretendida.",
    status: "published",
    featuredOnHome: true,
    readTime: "5 min",
    publishedAt: new Date().toISOString(),
    authorUserId: adminUserId,
    seedTag,
  };

  if (existing) {
    return CareerPost.findByIdAndUpdate(existing._id, payload, { new: true });
  }

  return CareerPost.create(payload);
}

async function upsertAdCampaign() {
  const title = "Campanha Demo - Banner Principal";
  const existing = await AdCampaign.findOne({ title, placement: "homepage_banner" });
  const payload = {
    title,
    placement: "homepage_banner",
    link: "https://parvagas.co.ao/Empresa",
    imageUrl: "https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=1200&auto=format&fit=crop",
    active: true,
    status: "active",
    budget: 150000,
    spent: 20000,
    startDate: plusDaysIso(-2),
    endDate: plusDaysIso(25),
    seedTag,
  };

  if (existing) {
    return AdCampaign.findByIdAndUpdate(existing._id, payload, { new: true });
  }

  return AdCampaign.create(payload);
}

async function main() {
  console.log("\n[seed-dummy] Iniciando seed de dados demo...\n");

  const [adminUser, companyUser, candidateUser] = await Promise.all([
    upsertUser({
      fullName: "Admin Demo Parvagas",
      email: "admin.demo@parvagas.ao",
      role: "admin",
      adminLevel: "super-admin",
    }),
    upsertUser({
      fullName: "Empresa Demo RH",
      email: "empresa.demo@parvagas.ao",
      role: "company",
      companyTeamRole: "owner",
    }),
    upsertUser({
      fullName: "Candidato Demo",
      email: "candidato.demo@parvagas.ao",
      role: "candidate",
    }),
  ]);

  const company = await upsertCompany({
    ownerUserId: companyUser._id,
    name: "Empresa Demo Angola",
    legalName: "Empresa Demo Angola, Lda",
    nif: "5009987766",
    location: "Luanda",
    industry: "Tecnologia",
  });

  const [profile, job, careerPost, adCampaign] = await Promise.all([
    upsertCandidateProfile({
      userId: candidateUser._id,
      fullName: candidateUser.fullName,
      email: candidateUser.email,
    }),
    upsertJob({ companyId: company._id, createdByUserId: companyUser._id }),
    upsertCareerTip({ adminUserId: adminUser._id }),
    upsertAdCampaign(),
  ]);

  console.log("[seed-dummy] Concluido com sucesso.");
  console.log("[seed-dummy] Credencial demo password:", defaultPassword);
  console.log("[seed-dummy] Admin:", adminUser.email);
  console.log("[seed-dummy] Empresa:", companyUser.email);
  console.log("[seed-dummy] Candidato:", candidateUser.email);
  console.log("[seed-dummy] Company ID:", String(company._id));
  console.log("[seed-dummy] Profile ID:", String(profile._id));
  console.log("[seed-dummy] Job ID:", String(job._id));
  console.log("[seed-dummy] Career Tip ID:", String(careerPost._id));
  console.log("[seed-dummy] Ad Campaign ID:", String(adCampaign._id));
}

main().catch((error) => {
  console.error("[seed-dummy] Falha:", error?.message || error);
  process.exitCode = 1;
});
