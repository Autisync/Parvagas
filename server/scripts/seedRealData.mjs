import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config({ path: "server/.env" });
import User from "../models/user.js";
import Company from "../models/company.js";
import Job from "../models/job.js";
import CareerPost from "../models/careerPost.js";
import CandidateProfile from "../models/candidateProfile.js";
import Application from "../models/application.js";
import SavedJob from "../models/savedJob.js";
import JobAlert from "../models/jobAlert.js";
import NotificationPreference from "../models/notificationPreference.js";
import CompanyDeletionRequest from "../models/companyDeletionRequest.js";
import AdCampaign from "../models/adCampaign.js";
import ScrapedJob from "../models/scrapedJob.js";
import { clearAllModelTables } from "../db/modelFactory.js";

const args = new Set(process.argv.slice(2));
const shouldReset = args.has("--reset");

const seedStamp = "seed-2026-04";
const defaultPassword = "Parvagas@2026";

const datePlusDays = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const userRecords = [
  {
    key: "admin",
    fullName: "Ana Paula Goncalves",
    email: "admin@parvagas.ao",
    role: "admin",
    adminLevel: "super-admin",
  },
  {
    key: "admin_moderator",
    fullName: "Paulo Chico",
    email: "moderator@parvagas.ao",
    role: "admin",
    adminLevel: "moderator",
  },
  {
    key: "company_globo",
    fullName: "Mario Neto",
    email: "mario.neto@globotech.ao",
    role: "company",
  },
  {
    key: "company_kixi",
    fullName: "Lurdes Mateus",
    email: "lurdes.mateus@kixienergia.ao",
    role: "company",
  },
  {
    key: "company_benguela",
    fullName: "Helder Jamba",
    email: "helder.jamba@benguelalogistica.ao",
    role: "company",
  },
  {
    key: "company_sagrada",
    fullName: "Conceicao Mbala",
    email: "conceicao.mbala@sagradaesperanca.ao",
    role: "company",
  },
  {
    key: "company_bai",
    fullName: "Rui Fernandes",
    email: "rui.fernandes@bai.ao",
    role: "company",
  },
  {
    key: "candidate_maria",
    fullName: "Maria Juliana Pedro",
    email: "maria.pedro@gmail.com",
    role: "candidate",
  },
  {
    key: "candidate_domingos",
    fullName: "Domingos Manuel Silva",
    email: "domingos.silva@gmail.com",
    role: "candidate",
  },
  {
    key: "candidate_iris",
    fullName: "Iris Van-Dunem",
    email: "iris.vandunem@gmail.com",
    role: "candidate",
  },
  {
    key: "candidate_carlos",
    fullName: "Carlos Albino Chingunde",
    email: "carlos.chingunde@gmail.com",
    role: "candidate",
  },
];

const companyBlueprints = [
  {
    key: "globo",
    ownerKey: "company_globo",
    name: "GloboTech Angola",
    legalName: "GloboTech Solucoes Digitais, Lda",
    nif: "5003217782",
    industry: "Tecnologia",
    size: "51-200",
    website: "https://globotech.ao",
    location: "Luanda",
    description:
      "Empresa de produtos digitais para banca, telecom e governo eletrico com foco em engenharia de software.",
    contactPerson: "Mario Neto",
    contactEmail: "talento@globotech.ao",
    phone: "+244 923 331 210",
    status: "active",
  },
  {
    key: "kixi",
    ownerKey: "company_kixi",
    name: "Kixi Energia",
    legalName: "Kixi Energia e Servicos Industriais, SA",
    nif: "5009021187",
    industry: "Energia",
    size: "201-500",
    website: "https://kixienergia.ao",
    location: "Soyo",
    description:
      "Operadora de manutencao energetica e automacao industrial para unidades de producao onshore e offshore.",
    contactPerson: "Lurdes Mateus",
    contactEmail: "rh@kixienergia.ao",
    phone: "+244 928 650 444",
    status: "pending_verification",
  },
  {
    key: "benguela",
    ownerKey: "company_benguela",
    name: "Benguela Logistica Integrada",
    legalName: "Benguela Logistica Integrada, Lda",
    nif: "5001149320",
    industry: "Logistica",
    size: "11-50",
    website: "https://blogistica.ao",
    location: "Benguela",
    description:
      "Especializada em cadeia de abastecimento, transporte nacional e operacao de armazens para retalho e industria.",
    contactPerson: "Helder Jamba",
    contactEmail: "recrutamento@blogistica.ao",
    phone: "+244 943 102 991",
    status: "rejected",
  },
  {
    key: "sagrada",
    ownerKey: "company_sagrada",
    name: "Clinica Sagrada Esperanca",
    legalName: "Clinica Sagrada Esperanca, SA",
    nif: "5007823441",
    industry: "Saude",
    size: "201-500",
    website: "https://sagradaesperanca.ao",
    location: "Luanda",
    description:
      "Principal rede privada de saude em Angola, com unidades em Luanda, Huambo e Benguela, oferecendo servicos clinicos, cirurgicos e de diagnostico.",
    contactPerson: "Conceicao Mbala",
    contactEmail: "rh@sagradaesperanca.ao",
    phone: "+244 222 480 000",
    status: "active",
  },
  {
    key: "bai",
    ownerKey: "company_bai",
    name: "BAI Banco Angolano de Investimento",
    legalName: "Banco Angolano de Investimento, SA",
    nif: "5000111900",
    industry: "Banca e Financas",
    size: "1001+",
    website: "https://bai.ao",
    location: "Luanda",
    description:
      "Banco lider em Angola com presenca em mais de 18 provincias, especializado em banca comercial, investimento corporativo e solucoes digitais financeiras.",
    contactPerson: "Rui Fernandes",
    contactEmail: "talentos@bai.ao",
    phone: "+244 222 693 000",
    status: "active",
  },
];

const profileBlueprints = [
  {
    key: "candidate_maria",
    profession: "Engenheira de Dados",
    location: "Luanda",
    yearsOfExperience: 5,
    education: "Licenciatura em Engenharia Informatica - ISPTEC",
    languages: ["Portugues", "Ingles"],
    skills: ["Python", "SQL", "ETL", "Airflow", "Power BI"],
    summary:
      "Profissional com experiencia em pipelines de dados para analytics financeiro e modelos de previsao operacional.",
  },
  {
    key: "candidate_domingos",
    profession: "Tecnico de Manutencao Industrial",
    location: "Soyo",
    yearsOfExperience: 7,
    education: "Tecnico Medio de Eletromecanica",
    languages: ["Portugues"],
    skills: ["PLC", "Instrumentacao", "Seguranca Industrial", "SAP PM"],
    summary:
      "Atuacao em manutencao preventiva e corretiva de linhas de producao energetica e sistemas de automacao.",
  },
  {
    key: "candidate_iris",
    profession: "Analista de RH",
    location: "Benguela",
    yearsOfExperience: 4,
    education: "Licenciatura em Gestao de Recursos Humanos",
    languages: ["Portugues", "Frances"],
    skills: ["Recrutamento", "Onboarding", "Folha Salarial", "Formacao"],
    summary:
      "Especialista em recrutamento end-to-end e desenho de processos de onboarding para equipas operacionais.",
  },
  {
    key: "candidate_carlos",
    profession: "Gestor Comercial",
    location: "Huambo",
    yearsOfExperience: 8,
    education: "Licenciatura em Gestao",
    languages: ["Portugues", "Ingles"],
    skills: ["Vendas B2B", "CRM", "Negociacao", "Planeamento Comercial"],
    summary:
      "Historico de crescimento de carteira em sectores de servicos empresariais e distribuicao.",
  },
];

const jobBlueprints = [
  {
    key: "data_engineer",
    companyKey: "globo",
    title: "Engenheiro(a) de Dados Senior",
    location: "Luanda",
    mode: "Hibrido",
    category: "Tecnologia",
    description:
      "Responsavel por arquitetar pipelines, qualidade de dados e modelos analiticos para produtos digitais de grande escala.",
    requiredSkills: ["Python", "SQL", "Airflow", "Data Warehouse"],
    requiredExperienceYears: 4,
    salaryMin: 1800000,
    salaryMax: 2500000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    featuredOnHome: true,
    expiresAt: datePlusDays(45),
  },
  {
    key: "frontend_dev",
    companyKey: "globo",
    title: "Desenvolvedor(a) Frontend React",
    location: "Luanda",
    mode: "Presencial",
    category: "Tecnologia",
    description:
      "Implementacao de interfaces web de alta performance para clientes enterprise com foco em usabilidade.",
    requiredSkills: ["React", "TypeScript", "Tailwind", "Acessibilidade"],
    requiredExperienceYears: 3,
    salaryMin: 950000,
    salaryMax: 1500000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    expiresAt: datePlusDays(35),
  },
  {
    key: "industrial_tech",
    companyKey: "kixi",
    title: "Tecnico de Manutencao Industrial",
    location: "Soyo",
    mode: "Presencial",
    category: "Energia",
    description:
      "Atuacao em manutencao preventiva e resposta a incidentes em unidades energeticas.",
    requiredSkills: ["Instrumentacao", "PLC", "Seguranca Industrial"],
    requiredExperienceYears: 5,
    salaryMin: 1100000,
    salaryMax: 1700000,
    contractType: "Rotativo",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    featuredOnHome: true,
    expiresAt: datePlusDays(30),
  },
  {
    key: "supply_chain",
    companyKey: "benguela",
    title: "Coordenador(a) de Cadeia de Abastecimento",
    location: "Benguela",
    mode: "Presencial",
    category: "Logistica",
    description:
      "Coordenacao de transporte, armazenagem e previsao de demanda para operacoes de distribuicao.",
    requiredSkills: ["Planeamento", "Logistica", "Excel Avancado", "Power BI"],
    requiredExperienceYears: 4,
    salaryMin: 900000,
    salaryMax: 1400000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    expiresAt: datePlusDays(25),
  },
  {
    key: "hr_analyst",
    companyKey: "benguela",
    title: "Analista de Recursos Humanos",
    location: "Benguela",
    mode: "Hibrido",
    category: "Recursos Humanos",
    description:
      "Gestao de recrutamento, onboarding, avaliacao de desempenho e relatorios de people analytics.",
    requiredSkills: ["Recrutamento", "Comunicacao", "Excel", "People Analytics"],
    requiredExperienceYears: 3,
    salaryMin: 650000,
    salaryMax: 980000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    expiresAt: datePlusDays(40),
  },
  {
    key: "commercial_manager",
    companyKey: "globo",
    title: "Gestor(a) Comercial B2B",
    location: "Luanda",
    mode: "Hibrido",
    category: "Comercial",
    description:
      "Expansao de carteira empresarial para servicos digitais e desenvolvimento de parcerias de longo prazo.",
    requiredSkills: ["CRM", "Negociacao", "Vendas Consultivas"],
    requiredExperienceYears: 6,
    salaryMin: 1200000,
    salaryMax: 1900000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    expiresAt: datePlusDays(55),
  },
  {
    key: "cybersec_specialist",
    companyKey: "globo",
    title: "Especialista em Ciberseguranca",
    location: "Luanda",
    mode: "Hibrido",
    category: "Tecnologia",
    description:
      "Protecao de infraestruturas criticas e sistemas de informacao para clientes governamentais e bancarios. Analise de vulnerabilidades, resposta a incidentes e implementacao de politicas de seguranca.",
    requiredSkills: ["SIEM", "Firewall", "Ethical Hacking", "ISO 27001", "Python"],
    preferredSkills: ["CISSP", "CEH", "Azure Security"],
    requiredExperienceYears: 5,
    salaryMin: 1700000,
    salaryMax: 2600000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    featuredOnHome: true,
    expiresAt: datePlusDays(50),
  },
  {
    key: "ux_designer",
    companyKey: "globo",
    title: "Designer de Produto UX/UI",
    location: "Luanda",
    mode: "Remoto",
    category: "Tecnologia",
    description:
      "Concepcao de experiencias digitais para aplicacoes web e movel destinadas ao sector financeiro e governamental. Prototipagem rapida, testes de usabilidade e design system.",
    requiredSkills: ["Figma", "Design System", "Prototipagem", "User Research"],
    preferredSkills: ["Framer", "Motion Design", "Acessibilidade WCAG"],
    requiredExperienceYears: 3,
    salaryMin: 900000,
    salaryMax: 1400000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    expiresAt: datePlusDays(38),
  },
  {
    key: "field_engineer",
    companyKey: "kixi",
    title: "Engenheiro(a) de Campo Electrico",
    location: "Cabinda",
    mode: "Presencial",
    category: "Energia",
    description:
      "Comissionamento e manutencao de equipamentos electricos em plataformas offshore e instalacoes industriais. Posicao com regime de rotacao 28/28 dias.",
    requiredSkills: ["Alta Tensao", "Proteccao de Sistemas", "NEC", "AutoCAD Electrico"],
    preferredSkills: ["GWO", "OPITO", "Ingles tecnico"],
    requiredExperienceYears: 6,
    salaryMin: 2200000,
    salaryMax: 3500000,
    contractType: "Rotativo",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    featuredOnHome: true,
    expiresAt: datePlusDays(60),
  },
  {
    key: "senior_accountant",
    companyKey: "benguela",
    title: "Contabilista Senior",
    location: "Benguela",
    mode: "Presencial",
    category: "Financas",
    description:
      "Gestao contabilistica completa, apuramentos fiscais, relatorios financeiros mensais e apoio a auditoria externa conforme normas PGC-NIRF angolanas.",
    requiredSkills: ["PGC Angola", "IAS/IFRS", "Declaracoes Fiscais", "Excel Avancado"],
    preferredSkills: ["SAP FI", "PRIMAVERA ERP", "OCPCA"],
    requiredExperienceYears: 5,
    salaryMin: 850000,
    salaryMax: 1300000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    expiresAt: datePlusDays(30),
  },
  {
    key: "driver_dist",
    companyKey: "benguela",
    title: "Motorista de Distribuicao",
    location: "Lubango",
    mode: "Presencial",
    category: "Logistica",
    description:
      "Conducao de viaturas pesadas para entrega e recolha de mercadorias nas provincias do Huila, Namibe e Cunene. Carta de conducao categoria C/E obrigatoria.",
    requiredSkills: ["Carta C/E", "Inspecao de Carga", "Registo de Viagem"],
    preferredSkills: ["Tacografo Digital", "Primeiros Socorros"],
    requiredExperienceYears: 3,
    salaryMin: 350000,
    salaryMax: 550000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    expiresAt: datePlusDays(20),
  },
  {
    key: "medico_geral",
    companyKey: "sagrada",
    title: "Medico(a) Clinico Geral",
    location: "Luanda",
    mode: "Presencial",
    category: "Saude",
    description:
      "Consultas de medicina geral e urgencia hospitalar na unidade central de Luanda. Regime de trabalho por turnos incluindo fins de semana e feriados.",
    requiredSkills: ["Medicina Clinica", "Urgencia e Emergencia", "Diagnostico"],
    preferredSkills: ["ACLS", "ATLS", "Ecografia basica"],
    requiredExperienceYears: 2,
    salaryMin: 2000000,
    salaryMax: 3800000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    featuredOnHome: true,
    expiresAt: datePlusDays(45),
  },
  {
    key: "enfermeiro",
    companyKey: "sagrada",
    title: "Enfermeiro(a) de Bloco Operatorio",
    location: "Luanda",
    mode: "Presencial",
    category: "Saude",
    description:
      "Assistencia cirurgica em bloco operatorio de especialidades como ortopedia, cirurgia geral e ginecologia. Experiencia minima em sala de operacoes e esterilizacao.",
    requiredSkills: ["Instrumentacao Cirurgica", "Esterilizacao", "ACLS"],
    preferredSkills: ["Pos-operatorio", "ATLS", "Ingles"],
    requiredExperienceYears: 3,
    salaryMin: 900000,
    salaryMax: 1400000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    expiresAt: datePlusDays(35),
  },
  {
    key: "credit_analyst",
    companyKey: "bai",
    title: "Analista de Credito Corporativo",
    location: "Luanda",
    mode: "Hibrido",
    category: "Banca e Financas",
    description:
      "Avaliacao de propostas de credito para empresas de medio e grande porte, analise de risco financeiro, modelagem e apresentacao de pareceres tecnicos a comite de credito.",
    requiredSkills: ["Analise Financeira", "Rating de Credito", "Excel Avancado", "Relatorio Tecnico"],
    preferredSkills: ["CFA", "Bloomberg", "SQL"],
    requiredExperienceYears: 4,
    salaryMin: 1500000,
    salaryMax: 2200000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    featuredOnHome: true,
    expiresAt: datePlusDays(42),
  },
  {
    key: "project_manager",
    companyKey: "bai",
    title: "Gestor(a) de Projectos Tecnologicos",
    location: "Luanda",
    mode: "Hibrido",
    category: "Gestao de Projectos",
    description:
      "Lideranca de projectos de transformacao digital para a area de banca digital, core banking e integracao de sistemas. Coordenacao de equipas internas e fornecedores externos.",
    requiredSkills: ["PMP", "Agile/Scrum", "Gestao de Risco", "MS Project"],
    preferredSkills: ["PRINCE2", "Jira", "Salesforce", "SQL"],
    requiredExperienceYears: 6,
    salaryMin: 2000000,
    salaryMax: 3000000,
    contractType: "Tempo Integral",
    visibility: "public",
    status: "approved",
    sourceType: "company",
    expiresAt: datePlusDays(48),
  },
];

const applicationBlueprints = [
  {
    candidateKey: "candidate_maria",
    jobKey: "data_engineer",
    status: "shortlisted",
    note: "Perfil tecnico aderente ao stack de dados.",
  },
  {
    candidateKey: "candidate_domingos",
    jobKey: "industrial_tech",
    status: "interview",
    note: "Convidado para entrevista tecnica presencial.",
  },
  {
    candidateKey: "candidate_iris",
    jobKey: "hr_analyst",
    status: "submitted",
    note: "Candidatura inicial recebida.",
  },
  {
    candidateKey: "candidate_carlos",
    jobKey: "commercial_manager",
    status: "viewed",
    note: "Revisao do historico comercial em curso.",
  },
];

async function upsertUser(base, passwordHash) {
  const existing = await User.findOne({ email: base.email });
  const payload = {
    fullName: base.fullName,
    email: base.email,
    password: passwordHash,
    role: base.role,
    ...(base.role === "admin" ? { adminLevel: base.adminLevel || "super-admin" } : {}),
    ...(base.role === "company"
      ? {
          hasSeenEmpresaTutorial: base.key === "company_kixi" ? false : true,
        }
      : {}),
    suspended: false,
    seedTag: seedStamp,
  };

  if (existing) {
    return User.findByIdAndUpdate(existing._id, payload, { new: true });
  }

  return User.create(payload);
}

async function upsertCompany(base, ownerUserId) {
  const existing = await Company.findOne({ ownerUserId });
  const status = String(base.status || "pending_verification").toLowerCase();
  const verificationStatus = status === "active" ? "verified" : (status === "rejected" ? "rejected" : "pending");

  const payload = {
    name: base.name,
    legalName: base.legalName,
    nif: base.nif,
    industry: base.industry,
    size: base.size,
    website: base.website,
    location: base.location,
    description: base.description,
    contactPerson: base.contactPerson,
    contactEmail: base.contactEmail,
    phone: base.phone,
    ownerUserId,
    status,
    verificationStatus,
    seedTag: seedStamp,
  };

  if (existing) {
    return Company.findByIdAndUpdate(existing._id, payload, { new: true });
  }

  return Company.create(payload);
}

async function upsertJob(base, companyId, createdByUserId) {
  const existing = await Job.findOne({ title: base.title, companyId });
  const payload = {
    ...base,
    companyId,
    createdByUserId,
    seedTag: seedStamp,
  };

  if (existing) {
    return Job.findByIdAndUpdate(existing._id, payload, { new: true });
  }

  return Job.create(payload);
}

async function upsertProfile(base, userId) {
  const payload = {
    userId,
    profession: base.profession,
    location: base.location,
    yearsOfExperience: base.yearsOfExperience,
    education: base.education,
    languages: base.languages,
    skills: base.skills,
    personalSummary: base.summary,
    completionScore: 92,
    consentGiven: true,
    aiSuggestionApproved: true,
    seedTag: seedStamp,
  };

  return CandidateProfile.findOneAndUpdate({ userId }, payload, { upsert: true, new: true });
}

async function upsertApplication(entry, candidate, job, company) {
  const existing = await Application.findOne({ candidateUserId: candidate._id, jobId: job._id });
  const statusEvent = {
    status: entry.status,
    changedBy: company.ownerUserId,
    note: entry.note,
    changedAt: new Date().toISOString(),
  };

  const payload = {
    jobId: job._id,
    companyId: company._id,
    candidateUserId: candidate._id,
    profileSnapshot: {
      fullName: candidate.fullName,
      email: candidate.email,
      role: candidate.role,
    },
    status: entry.status,
    matchScore: Math.round(78 + Math.random() * 20),
    matchExplanation: "Aderencia positiva de experiencia, skills e localizacao.",
    aiSummaryDraft: `Candidato ${candidate.fullName} apresenta perfil aderente para ${job.title}.`,
    aiSummaryApproved: true,
    statusHistory: [
      {
        status: "submitted",
        changedBy: candidate._id,
        note: "Candidatura submetida.",
        changedAt: datePlusDays(-15),
      },
      statusEvent,
    ],
    seedTag: seedStamp,
  };

  if (existing) {
    return Application.findByIdAndUpdate(existing._id, payload, { new: true });
  }

  return Application.create(payload);
}

async function upsertAdCampaign(base) {
  const existing = await AdCampaign.findOne({ title: base.title, placement: base.placement });
  const payload = {
    ...base,
    active: true,
    startDate: datePlusDays(-7),
    endDate: datePlusDays(60),
    impressions: existing?.impressions || 0,
    clicks: existing?.clicks || 0,
    seedTag: seedStamp,
  };

  if (existing) {
    return AdCampaign.findByIdAndUpdate(existing._id, payload, { new: true });
  }

  return AdCampaign.create(payload);
}

async function upsertScrapedJob(base) {
  const duplicateFingerprint = `${base.title.toLowerCase()}::${base.company.toLowerCase()}::${base.location.toLowerCase()}`;
  const existing = await ScrapedJob.findOne({ duplicateFingerprint });
  const payload = {
    ...base,
    duplicateFingerprint,
    status: "approved",
    reviewedBy: base.reviewedBy,
    reviewNote: "Aprovado no seed inicial para conteudo publico.",
    seedTag: seedStamp,
  };

  if (existing) {
    return ScrapedJob.findByIdAndUpdate(existing._id, payload, { new: true });
  }

  return ScrapedJob.create(payload);
}

async function upsertCareerPost(base) {
  const existing = await CareerPost.findOne({ slug: base.slug });
  const payload = { ...base, seedTag: seedStamp };
  if (existing) {
    return CareerPost.findByIdAndUpdate(existing._id, payload, { new: true });
  }
  return CareerPost.create(payload);
}

const careerPostBlueprints = [
  {
    slug: "como-preparar-cv-angola",
    title: "Como preparar um CV forte para o mercado angolano",
    category: "CV e Perfil",
    excerpt:
      "Estruture experiência, resultados e competências com foco nas expectativas reais dos recrutadores em Angola.",
    featuredOnHome: true,
    status: "published",
    publishedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    readTime: "7 min",
    author: "Equipe Editorial Parvagas",
    coverImage: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=800",
    body: [
      "O CV continua a ser o primeiro ponto de contacto entre candidato e recrutador em Angola. Um CV mal estruturado pode desqualificar um profissional altamente competente antes de qualquer entrevista.",
      "**Informações essenciais no topo:** Nome completo, telefone com indicativo +244, email profissional e localização (província). Não inclua data de nascimento nem estado civil — essa informação não é obrigatória e ocupa espaço valioso.",
      "**Resumo profissional:** 3 a 4 linhas que sintetizem a sua área, anos de experiência e valor diferenciador. Exemplo: 'Engenheira de Dados com 5 anos de experiência em pipelines ETL e analytics para o sector financeiro angolano.'",
      "**Experiência profissional:** Liste em ordem cronológica inversa. Para cada posição: empresa, cargo, datas e 3 a 5 realizações mensuráveis. Substitua 'responsável por relatórios' por 'reduziu tempo de fecho mensal de 5 para 2 dias através de automação em Python'.",
      "**Competências técnicas:** Agrupe em categorias (linguagens, ferramentas, certificações). Os recrutadores analisam esta secção em menos de 10 segundos — seja preciso.",
      "**Idiomas:** Indique nível real (A2 a C2 ou equivalente) — exageros são detectados na entrevista.",
      "**Formato:** PDF, 1 a 2 páginas, fonte legível (Calibri ou Arial 10-11pt), sem foto a menos que seja exigida pelo sector.",
    ],
    takeaways: [
      "Use resultados mensuráveis em vez de descrições de responsabilidades",
      "Adapte o resumo profissional a cada candidatura",
      "Mantenha o CV em PDF e máximo 2 páginas",
      "Inclua competências técnicas agrupadas por categoria",
    ],
  },
  {
    slug: "5-erros-entrevista-angola",
    title: "5 erros que bloqueiam a sua entrevista em Angola",
    category: "Entrevistas",
    excerpt:
      "Identifique e corrija os erros mais comuns que fazem candidatos perderem boas oportunidades mesmo com um perfil forte.",
    featuredOnHome: true,
    status: "published",
    publishedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    readTime: "6 min",
    author: "Equipe Editorial Parvagas",
    coverImage: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800",
    body: [
      "Uma boa entrevista não é apenas sobre responder perguntas — é sobre criar confiança, demonstrar competência e mostrar fit cultural. Muitos candidatos falham em pontos que poderiam ser corrigidos com preparação simples.",
      "**Erro 1 — Não pesquisar a empresa:** Chegue à entrevista sabendo a actividade principal, dimensão, mercados onde actua e desafios recentes. No mínimo, leia o site oficial e o LinkedIn da empresa.",
      "**Erro 2 — Respostas vagas sobre experiência:** 'Trabalhei muito em equipa' não diz nada. Use o método STAR: Situação, Tarefa, Acção, Resultado. Exemplo: 'Na Kixi Energia, fui responsável pela implementação de um sistema de manutenção preventiva (S), com o objectivo de reduzir paragens não planeadas (T). Criei um plano de inspecção semanal e formei 8 técnicos (A), o que reduziu incidentes em 35% no primeiro semestre (R).'",
      "**Erro 3 — Não preparar perguntas para o recrutador:** Candidatos que não perguntam nada parecem desinteressados. Prepare 2 a 3 perguntas genuínas sobre a equipa, desafios da função ou planos de crescimento.",
      "**Erro 4 — Chegada tarde ou não confirmar o local:** Em Luanda especialmente, considere o trânsito. Confirme o endereço exacto e chegue 10 a 15 minutos antes.",
      "**Erro 5 — Falar negativamente sobre empregadores anteriores:** Mesmo que a experiência anterior tenha sido difícil, o recrutador vai questionar-se sobre o que dirá sobre a nova empresa. Reencaminhe: 'Aprendi muito, mas sinto que estou pronto para um ambiente com mais desafios técnicos.'",
    ],
    takeaways: [
      "Pesquise a empresa antes — site, LinkedIn, notícias recentes",
      "Use o método STAR para exemplos de experiência",
      "Prepare perguntas para o entrevistador",
      "Nunca fale negativamente de empregadores anteriores",
    ],
  },
  {
    slug: "negociar-salario-angola",
    title: "Como negociar salário com dados de mercado em Angola",
    category: "Carreira e Progressão",
    excerpt:
      "Técnicas e dados reais para negociar uma proposta salarial justa sem comprometer a sua candidatura.",
    featuredOnHome: true,
    status: "published",
    publishedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    readTime: "8 min",
    author: "Equipe Editorial Parvagas",
    coverImage: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800",
    body: [
      "Negociar salário é uma competência profissional, não uma confrontação. Em Angola, o mercado salarial varia muito por sector, tamanho da empresa e localização — o que torna a preparação ainda mais importante.",
      "**Benchmarks por sector (2025-2026):** Tecnologia sénior: 1.5M a 2.8M Kz/mês. Banca e Finanças: 1.2M a 2.5M Kz. Saúde (médicos): 2.0M a 4.0M Kz. Logística e Operações: 600K a 1.4M Kz. Recursos Humanos: 650K a 1.2M Kz.",
      "**Quando negociar:** Sempre após receber uma oferta formal, nunca antes. Dizer 'o que é que está a oferecer?' numa primeira entrevista enfraquece a sua posição.",
      "**Técnica do intervalo:** Em vez de pedir um valor exacto, apresente um intervalo cujo mínimo já seria aceitável. 'Com base na minha experiência e no mercado, estaria a considerar entre 1.8M e 2.2M Kz.' O empregador tende a ancorar no meio do intervalo.",
      "**Justifique com dados:** Mencione anos de experiência, certificações relevantes e o valor que traz. 'A minha experiência com ISO 27001 e resposta a incidentes SIEM é directamente aplicável a este papel, e o mercado para esse perfil está entre...'",
      "**O que mais negociar:** Benefícios (seguro de saúde, carro, formação), dias de férias adicionais, possibilidade de trabalho remoto parcial e bónus por objectivos. Às vezes mais valioso do que o salário base.",
      "**Regra de ouro:** Nunca aceite verbalmente no momento. 'Agradeço a oferta — posso ter 24 a 48 horas para confirmar?' é sempre profissional.",
    ],
    takeaways: [
      "Pesquise benchmarks sectoriais antes de qualquer negociação",
      "Negocie apenas após receber a oferta formal",
      "Use intervalo salarial, não um valor único",
      "Negocie o pacote completo, não só o salário base",
    ],
  },
  {
    slug: "linkedin-mercado-angolano",
    title: "LinkedIn para o mercado angolano: o que realmente funciona",
    category: "Marca Pessoal",
    excerpt:
      "Como construir um perfil LinkedIn que gera contactos reais com recrutadores e empresas em Angola.",
    featuredOnHome: false,
    status: "published",
    publishedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    readTime: "7 min",
    author: "Equipe Editorial Parvagas",
    coverImage: "https://images.unsplash.com/photo-1611944212129-29977ae1398c?w=800",
    body: [
      "O LinkedIn tornou-se o principal canal de recrutamento para posições qualificadas em Angola, mas a maioria dos profissionais usa-o de forma passiva. Um perfil activo e bem construído multiplica a visibilidade perante recrutadores.",
      "**Foto profissional:** Fundo neutro, boa iluminação, vestuário adequado ao sector. Perfis com foto recebem 14x mais visitas.",
      "**Headline:** Não repita apenas o cargo. Use: 'Engenheiro de Dados | Python · SQL · Power BI | Luanda'. Inclua palavras-chave que recrutadores pesquisam.",
      "**Secção Sobre:** 3 parágrafos: quem é, o que faz melhor e o que procura a seguir. Termine com contacto ou convite para conversar.",
      "**Experiência:** Adicione resultados mensuráveis a cada posição. Use bullet points. Inclua media quando possível (relatórios, projectos, apresentações).",
      "**Recomendações:** 3 a 5 recomendações de colegas ou superiores directos aumentam significativamente a credibilidade.",
      "**Actividade:** Comentar conteúdo relevante 3x por semana é mais eficaz do que publicar artigos longos raramente. A consistência vence.",
    ],
    takeaways: [
      "Headline com palavras-chave técnicas relevantes",
      "Foto profissional com fundo neutro",
      "Actividade regular — comentários > silêncio",
      "Recomendações de supervisores ou colegas próximos",
    ],
  },
  {
    slug: "carta-apresentacao-angola",
    title: "Carta de apresentação eficaz para vagas em Angola",
    category: "CV e Perfil",
    excerpt:
      "Estrutura e exemplos de cartas que captam atenção e aumentam as probabilidades de passagem para entrevista.",
    featuredOnHome: false,
    status: "published",
    publishedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    readTime: "5 min",
    author: "Equipe Editorial Parvagas",
    coverImage: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800",
    body: [
      "Muitas candidaturas em Angola são enviadas sem carta de apresentação, o que representa uma oportunidade perdida para quem se destaca. Uma carta bem escrita aumenta substancialmente as probabilidades de ser chamado a entrevista.",
      "**Estrutura em 4 parágrafos:** (1) Por que esta empresa e esta vaga específica. (2) A sua experiência mais relevante para o papel. (3) Valor concreto que pode trazer. (4) Próximo passo — peça a entrevista.",
      "**Personalização:** A carta genérica é imediatamente reconhecida. Mencione algo específico da empresa — um projecto recente, um valor declarado, uma notícia. Mostra que fez pesquisa.",
      "**Extensão:** Máximo 1 página, 3 a 4 parágrafos, linguagem profissional mas não excessivamente formal.",
      "**Erros a evitar:** Começar com 'Venho por este meio candidatar-me...' (demasiado genérico). Repetir o CV em prosa. Focar no que a empresa pode fazer por si em vez do contrário.",
      "**Exemplo de abertura forte:** 'A recente expansão do BAI para serviços de banca digital alinha-se directamente com os 4 anos que passei a construir produtos financeiros para a região. É por isso que esta posição de Gestor de Produto me interessa especialmente.'",
    ],
    takeaways: [
      "4 parágrafos: motivação → experiência relevante → valor → próximo passo",
      "Personalizar com referência específica à empresa",
      "Máximo 1 página — seja preciso",
      "Não repita o CV em prosa",
    ],
  },
  {
    slug: "trabalho-remoto-angola",
    title: "Trabalho remoto e híbrido em Angola: o que muda na candidatura",
    category: "Tendências",
    excerpt:
      "Guia prático para profissionais angolanos que procuram posições remotas ou híbridas, locais e internacionais.",
    featuredOnHome: false,
    status: "published",
    publishedAt: new Date(Date.now() - 28 * 86400000).toISOString(),
    readTime: "6 min",
    author: "Equipe Editorial Parvagas",
    coverImage: "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=800",
    body: [
      "O trabalho remoto deixou de ser uma excepção em Angola — especialmente no sector tecnológico, financeiro e de serviços. Para os profissionais, isso representa acesso a oportunidades antes geograficamente impossíveis.",
      "**Posições remotas locais:** Empresas angolanas adoptam cada vez mais regimes híbridos (2 a 3 dias no escritório). Para estas vagas, o CV e a entrevista são iguais, mas a capacidade de auto-gestão e comunicação assíncrona torna-se um diferenciador.",
      "**Posições internacionais:** Empresas multinacionais e startups globais contratam talento angolano para papéis remotos full-time. Os requisitos adicionais incluem: inglês fluente (B2 mínimo), portfólio visível no GitHub ou Behance, capacidade de trabalhar em fusos diferentes.",
      "**O que destacar no CV para posições remotas:** Mencione explicitamente ferramentas de trabalho remoto (Slack, Notion, Jira, Zoom). Inclua projectos que demonstrem entrega autónoma. Adicione certificações internacionais relevantes.",
      "**Entrevistas remotas:** Teste o equipamento antes. Fundo neutro ou virtual profissional. Internet estável — se precário, use dados móveis como backup. Vista-se como para uma entrevista presencial.",
      "**Aspectos legais e financeiros:** Receber pagamento em USD ou EUR via Wise ou Payoneer é comum. Consulte um contabilista sobre declaração de rendimentos de fonte estrangeira em Angola.",
    ],
    takeaways: [
      "Destaque ferramentas de trabalho remoto no CV",
      "Inglês fluente é pré-requisito para vagas internacionais",
      "Prepare o ambiente técnico para entrevistas por vídeo",
      "Informe-se sobre recebimento e declaração de pagamentos estrangeiros",
    ],
  },
  {
    slug: "primeiros-empregos-angola",
    title: "Primeiros passos no mercado de trabalho angolano: guia para recém-licenciados",
    category: "Início de Carreira",
    excerpt:
      "Estratégia prática para licenciados e recém-formados que procuram a primeira oportunidade profissional em Angola.",
    featuredOnHome: false,
    status: "published",
    publishedAt: new Date(Date.now() - 35 * 86400000).toISOString(),
    readTime: "8 min",
    author: "Equipe Editorial Parvagas",
    coverImage: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800",
    body: [
      "Entrar no mercado de trabalho angolano como recém-licenciado tem desafios específicos: muitas vagas pedem experiência, mas como obter experiência sem o primeiro emprego? A resposta está numa estratégia deliberada.",
      "**Estágios e programas de trainee:** Grandes empresas como o BAI, a Sonangol, a Unitel e empresas de consultoria têm programas anuais para recém-licenciados. Candidature-se mesmo que não veja vaga publicada — envie candidatura espontânea.",
      "**Projectos freelance e voluntariado:** Uma página web desenvolvida para uma ONG local, um relatório de análise de dados para uma PME ou uma campanha digital pró-bono valem mais no CV do que o campo vazio.",
      "**Networking estruturado:** Em Angola, muitas oportunidades circulam por referência antes de serem publicadas. Conecte-se no LinkedIn com profissionais da sua área, participe em eventos do sector e seja presente nas comunidades online relevantes.",
      "**Expectativas realistas:** O primeiro emprego raramente é o sonho. Foque em empresas onde vai aprender rapidamente, ter responsabilidades reais e acesso a mentoria. Os primeiros 2 anos definem a trajectória dos próximos 10.",
      "**Formações complementares que abrem portas:** Google Data Analytics (gratuito), AWS Cloud Practitioner, Excel Avançado, PMP Fundamentos. Certificações reconhecidas internacionalmente compensam a falta de experiência em muitas candidaturas.",
    ],
    takeaways: [
      "Candidate-se a programas de trainee e estágios em grandes empresas",
      "Crie projectos pessoais ou freelance para preencher o CV",
      "Networking activo — muitas vagas não são publicadas",
      "Foque nos primeiros 2 anos para construir base sólida",
    ],
  },
  {
    slug: "sector-petroleo-gas-angola",
    title: "Carreiras no sector petrolífero e de gás em Angola",
    category: "Sectores em Destaque",
    excerpt:
      "O que precisa saber para entrar e progredir no sector de Oil & Gas em Angola — um dos maiores empregadores do país.",
    featuredOnHome: false,
    status: "published",
    publishedAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    readTime: "9 min",
    author: "Equipe Editorial Parvagas",
    coverImage: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800",
    body: [
      "O sector petrolífero e de gás continua a ser o maior empregador de quadros qualificados em Angola, com salários que lideram o mercado e condições de trabalho únicas. Entender as suas especificidades é essencial para quem quer actuar neste espaço.",
      "**Principais empregadores:** Sonangol, TotalEnergies Angola, BP Angola, Chevron, Eni, e o ecossistema de empresas de serviços (SLB, Baker Hughes, Halliburton, Saipem, Subsea7).",
      "**Perfis mais procurados:** Engenheiros de petróleo e produção, geólogos, engenheiros de processo, técnicos de instrumentação e controlo, especialistas em HSE (Health, Safety & Environment), engenheiros de fiabilidade.",
      "**Regime de trabalho:** A maioria das posições operacionais funciona em regime de rotação (28/28 ou 14/14 dias), com alojamento no campo e subsídios significativos. Posições técnicas em Luanda são geralmente horário de escritório.",
      "**Certificações valorizadas:** GWO Basic Safety Training (obrigatório para offshore), OPITO BOSIET, HUET, certificações de engenharia de processo (API, ASME), HSE NEBOSH.",
      "**Angolização:** A política de angolanização exige percentagens crescentes de profissionais nacionais em todos os níveis. Isso representa uma janela de oportunidade real para profissionais angolanos qualificados, especialmente em papéis de gestão e engenharia sénior.",
      "**Como entrar:** Candidaturas directas nas empresas, programas de graduate da Sonangol, plataformas especializadas como a Parvagas, e networking em eventos do sector como o Fórum Petrolífero de Angola.",
    ],
    takeaways: [
      "Certificações GWO e OPITO são pré-requisito para offshore",
      "A angolização cria oportunidades reais para técnicos e gestores nacionais",
      "Regime rotativo (28/28) vem com subsídios expressivos",
      "Networking no sector é tão importante como o CV",
    ],
  },
];

async function seed() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios no ambiente.");
  }

  if (shouldReset) {
    await clearAllModelTables();
  }

  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  const usersByKey = {};
  for (const record of userRecords) {
    usersByKey[record.key] = await upsertUser(record, passwordHash);
  }

  const companiesByKey = {};
  for (const company of companyBlueprints) {
    const owner = usersByKey[company.ownerKey];
    companiesByKey[company.key] = await upsertCompany(company, owner._id);
    await User.findByIdAndUpdate(owner._id, {
      companyId: companiesByKey[company.key]._id,
      companyStatus: String(company.status || "pending_verification").toLowerCase(),
      companyTeamRole: "owner",
    });
  }

  await CompanyDeletionRequest.findOneAndUpdate(
    {
      companyId: String(companiesByKey.benguela._id),
      status: "pending_admin_approval",
    },
    {
      companyId: String(companiesByKey.benguela._id),
      requestedByUserId: String(usersByKey.admin_moderator._id),
      requestedByAdminLevel: "moderator",
      reason: "Dados legais desatualizados e sem resposta após pedido de regularização.",
      status: "pending_admin_approval",
      seedTag: seedStamp,
    },
    { upsert: true, new: true }
  );

  const jobsByKey = {};
  for (const job of jobBlueprints) {
    const company = companiesByKey[job.companyKey];
    jobsByKey[job.key] = await upsertJob(job, company._id, company.ownerUserId);
  }

  for (const profile of profileBlueprints) {
    const candidate = usersByKey[profile.key];
    await upsertProfile(profile, candidate._id);
  }

  for (const application of applicationBlueprints) {
    const candidate = usersByKey[application.candidateKey];
    const job = jobsByKey[application.jobKey];
    const company = companiesByKey[job.companyKey];
    await upsertApplication(application, candidate, job, company);
  }

  await SavedJob.findOneAndUpdate(
    { userId: usersByKey.candidate_maria._id, jobId: jobsByKey.frontend_dev._id },
    {
      userId: usersByKey.candidate_maria._id,
      jobId: jobsByKey.frontend_dev._id,
      seedTag: seedStamp,
    },
    { upsert: true, new: true }
  );

  await SavedJob.findOneAndUpdate(
    { userId: usersByKey.candidate_iris._id, jobId: jobsByKey.hr_analyst._id },
    {
      userId: usersByKey.candidate_iris._id,
      jobId: jobsByKey.hr_analyst._id,
      seedTag: seedStamp,
    },
    { upsert: true, new: true }
  );

  await JobAlert.findOneAndUpdate(
    { userId: usersByKey.candidate_maria._id, title: "Vagas de Dados em Luanda" },
    {
      userId: usersByKey.candidate_maria._id,
      title: "Vagas de Dados em Luanda",
      keywords: ["dados", "engenheiro", "analista"],
      location: "Luanda",
      active: true,
      frequency: "weekly",
      seedTag: seedStamp,
    },
    { upsert: true, new: true }
  );

  await NotificationPreference.findOneAndUpdate(
    { userId: usersByKey.candidate_maria._id },
    {
      userId: usersByKey.candidate_maria._id,
      emailEnabled: true,
      pushEnabled: false,
      smsEnabled: false,
      dailyDigest: true,
      seedTag: seedStamp,
    },
    { upsert: true, new: true }
  );

  await upsertAdCampaign({
    title: "Bootcamp Dados 2026",
    placement: "homepage_hero",
    imageUrl: "https://images.unsplash.com/photo-1519389950473-47ba0277781c",
    link: "https://academy.ao/bootcamp-dados",
    ctaLabel: "Inscrever",
    advertiser: "Academy Angola",
  });

  await upsertAdCampaign({
    title: "MBA Gestao de Projetos",
    placement: "job_listing_sidebar",
    imageUrl: "https://images.unsplash.com/photo-1552664730-d307ca884978",
    link: "https://businessschool.ao/mba-projetos",
    ctaLabel: "Saber mais",
    advertiser: "Business School Luanda",
  });

  await upsertScrapedJob({
    title: "Contabilista Senior",
    company: "Grupo Horizonte",
    location: "Huambo",
    category: "Financas",
    skills: ["Contabilidade", "Fiscalidade", "Primavera"],
    description: "Gestao de fecho mensal, obrigacoes fiscais e controlo de custos.",
    sourceUrl: "https://horizonte.ao/carreiras/contabilista-senior",
    reviewedBy: usersByKey.admin._id,
  });

  for (const post of careerPostBlueprints) {
    await upsertCareerPost(post);
  }

  const summary = {
    users: await User.countDocuments(),
    companies: await Company.countDocuments(),
    jobs: await Job.countDocuments(),
    candidateProfiles: await CandidateProfile.countDocuments(),
    applications: await Application.countDocuments(),
    savedJobs: await SavedJob.countDocuments(),
    jobAlerts: await JobAlert.countDocuments(),
    ads: await AdCampaign.countDocuments(),
    scrapedJobs: await ScrapedJob.countDocuments(),
    careerPosts: await CareerPost.countDocuments(),
  };

  console.log("\nSeed concluido com sucesso.");
  console.log(`Password padrao dos utilizadores seed: ${defaultPassword}`);
  console.log(JSON.stringify(summary, null, 2));
}

seed().catch((error) => {
  console.error("Erro ao popular base:", error.message);
  process.exitCode = 1;
});
