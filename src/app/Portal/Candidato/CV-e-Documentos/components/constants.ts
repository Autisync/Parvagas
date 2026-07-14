import type { ExperienceItem } from "@/app/components/profile/ExperienceCard";
import type { EducationItem } from "@/app/components/profile/EducationCard";

export const CV_DRAFT_SESSION_KEY = "parvagas_cv_parse_draft";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const PARSE_POLL_INTERVAL_MS = 2500;
export const PARSE_POLL_TIMEOUT_MS = 120000;

export const TARGET_FIELDS = [
  "Customer Support",
  "IT Helpdesk",
  "Frontend Developer",
  "Administration",
  "Sales",
  "Healthcare",
  "Construction",
  "Hospitality",
];

export const PREFERRED_JOB_TYPE_OPTIONS = [
  { value: "tempo_integral", label: "Tempo inteiro" },
  { value: "meio_periodo", label: "Meio período" },
  { value: "contrato", label: "Contrato" },
  { value: "temporario", label: "Temporário" },
  { value: "freelancer", label: "Freelancer" },
  { value: "estagio", label: "Estágio" },
  { value: "remoto", label: "Remoto" },
  { value: "hibrido", label: "Híbrido" },
  { value: "presencial", label: "Presencial" },
];

export const AVAILABILITY_OPTIONS = [
  { value: "imediata", label: "Imediata" },
  { value: "1_semana", label: "1 semana" },
  { value: "2_semanas", label: "2 semanas" },
  { value: "1_mes", label: "1 mês" },
  { value: "2_meses", label: "2 meses" },
  { value: "a_combinar", label: "A combinar" },
];

export const JOB_CATEGORIES = [
  "Tecnologia",
  "Energia",
  "Saude",
  "Banca e Financas",
  "Logistica",
  "Recursos Humanos",
  "Comercial",
];

export const categoryLabels: Record<string, string> = {
  Tecnologia: "Tecnologia",
  Energia: "Energia",
  Saude: "Saúde",
  "Banca e Financas": "Banca e Finanças",
  Logistica: "Logística",
  "Recursos Humanos": "Recursos Humanos",
  Comercial: "Comercial",
};

export const DEFAULT_EXPERIENCE: ExperienceItem = {
  jobTitle: "",
  company: "",
  location: "",
  startDate: "",
  endDate: "",
  current: false,
  description: "",
};

export const DEFAULT_EDUCATION: EducationItem = {
  degree: "",
  institution: "",
  location: "",
  startDate: "",
  endDate: "",
  description: "",
};
