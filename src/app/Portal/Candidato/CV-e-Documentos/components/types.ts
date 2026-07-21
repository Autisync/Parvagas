// Shared types for the CV e Documentos page and its section components.

export type ParsedDraft = {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  postcode?: string;
  nationality?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  professionalSummary?: string;
  professionalTitle?: string;
  jobTitle?: string;
  yearsOfExperience?: number | null;
  summary?: string;
  skills?: string[];
  languages?: string[];
  workExperience?: Array<{
    jobTitle?: string;
    company?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
    description?: string;
  }>;
  experience?: Array<{
    jobTitle?: string;
    company?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
    description?: string;
  }>;
  education?: Array<{
    degree?: string;
    institution?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  certifications?: string[];
  portfolioLinks?: string[];
  preferredJobType?: string;
  expectedSalaryAoa?: number | null;
  availability?: string;
  [key: string]: unknown;
};

export type ParseResponse = {
  success?: boolean;
  parseRunId?: string;
  status?: string;
  file?: {
    id?: string | null;
    filename?: string;
    mimeType?: string;
    size?: number;
  };
  parsedProfile?: ParsedDraft;
  confidence?: Record<string, number>;
  warnings?: string[];
  profileDraft?: ParsedDraft;
  missingFields?: string[];
  parserError?: string;
  message?: string;
  error?: {
    message?: string;
  } | string;
};

export type CandidateDocument = {
  _id: string;
  fileName?: string;
  type?: string;
  createdAt?: string;
  signedUrl?: string;
};

export type GeneratedCvProfile = {
  _id: string;
  targetField: string;
  label?: string;
  professionalSummary?: string;
  keySkills?: string[];
  experienceHighlights?: string[];
  suggestedKeywords?: string[];
  coverLetterDraft?: string;
  approved?: boolean;
  updatedAt?: string;
};

export type AutoApplyProposal = {
  _id: string;
  jobId: string;
  job?: {
    _id: string;
    title?: string;
    location?: string;
    workMode?: string;
    companyId?: { name?: string } | string;
  } | null;
  matchScore: number;
  matchReasons: string[];
  status: string;
  createdAt?: string;
};

export type CVPlan = {
  tier: string;
  name: string;
  price: number;
  features: string[];
};

export type CVSubResponse = {
  subscription: {
    tier: string;
    status: string;
    plan: CVPlan;
    currentPeriodEnd?: string | null;
    cancelRequestedAt?: string | null;
  };
};

export type CVPlansResponse = { plans: CVPlan[] };

export type PageFeedback = {
  variant: "success" | "error" | "warning" | "info";
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};
