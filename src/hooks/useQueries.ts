import { useQuery } from "@tanstack/react-query";
import { authFetch, apiFetch } from "@/lib/api";

export type Application = {
  _id: string;
  status: string;
  candidateUserId?: string;
  profileSource?: string;
  profileSnapshot?: { fullName?: string; email?: string; phone?: string; skills?: string[] };
  jobId?: { title?: string; location?: string; companyId?: { name?: string } } | null;
  createdAt?: string;
  statusHistory?: { status: string; changedAt: string; note?: string }[];
};

export type PaginatedResponse<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ApplicationsResponse = {
  applications: Application[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

/**
 * useApplications: Fetch applications with pagination
 * Supports filtering for candidates (own apps) and companies (received apps)
 */
export function useApplications(token: string | null, page: number = 1, limit: number = 20, jobId?: string) {
  return useQuery<ApplicationsResponse>({
    queryKey: ["applications", page, limit, jobId ?? null],
    queryFn: () => authFetch<ApplicationsResponse>(`/applications?page=${page}&limit=${limit}${jobId ? `&jobId=${encodeURIComponent(jobId)}` : ""}`, token!),
    enabled: !!token,
    staleTime: 2 * 60 * 1000, // 2 minutes for applications
  });
}

export type Job = {
  _id: string;
  title: string;
  location?: string;
  workMode?: string;
  category?: string;
  salaryRange?: string;
  requiredSkills?: string[];
  companyId?: { name?: string } | string;
  createdAt?: string;
  description?: string;
};

export type JobsResponse = {
  jobs: Job[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

/**
 * usePublicJobs: Fetch publicly available jobs with pagination and filters
 */
export function usePublicJobs(
  page: number = 1,
  limit: number = 10,
  filters: Record<string, string> = {}
) {
  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", String(limit));
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value) queryParams.set(key, value);
  });

  return useQuery<JobsResponse>({
    queryKey: ["jobs", page, limit, filters],
    queryFn: () => apiFetch<JobsResponse>(`/jobs?${queryParams.toString()}`),
    staleTime: 5 * 60 * 1000, // 5 minutes for public jobs
  });
}

/**
 * useRecommendedJobs: Fetch AI-recommended jobs for authenticated candidate
 */
export function useRecommendedJobs(token: string | null, page: number = 1, limit: number = 20) {
  return useQuery<{ jobs: Job[] } & { pagination?: { page: number; limit: number; total: number; totalPages: number } }>({
    queryKey: ["recommendedJobs", page, limit],
    queryFn: () => authFetch<any>(`/candidates/jobs/recommended?page=${page}&limit=${limit}`, token!),
    enabled: !!token,
    staleTime: 10 * 60 * 1000, // 10 minutes for recommendations
  });
}

export type CompanyJob = {
  _id: string;
  title: string;
  location?: string;
  workMode?: string;
  category?: string;
  salaryRange?: string;
  status?: string;
  visibility?: string;
  createdAt?: string;
  applicationCount?: number;
};

export type CompanyJobsResponse = {
  jobs: CompanyJob[];
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  quota?: { activeJobs: number; maxActiveJobs: number };
};

/**
 * useCompanyJobs: Fetch jobs posted by a company
 */
export function useCompanyJobs(token: string | null, page: number = 1, limit: number = 20) {
  return useQuery<CompanyJobsResponse>({
    queryKey: ["companyJobs", page, limit],
    queryFn: () => authFetch<CompanyJobsResponse>(`/companies/jobs?page=${page}&limit=${limit}`, token!),
    enabled: !!token,
    staleTime: 3 * 60 * 1000, // 3 minutes for company jobs
  });
}
