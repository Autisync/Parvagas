"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, authFetchRaw } from "@/lib/api";
import Footer from "@/app/components/Footer";
import CompanySidebar from "../components/CompanySidebar";
import JobPostingModal from "../components/JobPostingModal";
import { useToasts } from "../components/useToasts";

type CompanyProfile = {
  name?: string;
  industry?: string;
  size?: string;
  website?: string;
  description?: string;
  location?: string;
  contactEmail?: string;
  contactPhone?: string;
  logo?: string;
  ownerUserId?: string;
};

type TeamMember = {
  _id: string;
  fullName?: string;
  email?: string;
  companyTeamRole?: "owner" | "recruiter" | "viewer";
};

type TeamInvite = {
  _id: string;
  status?: "pending" | "accepted" | "revoked" | "expired";
};

type AuditEntry = {
  _id: string;
  action?: string;
  resourceType?: string;
  createdAt?: string;
  actorUserId?: string;
  actor?: { fullName?: string; email?: string } | null;
};

type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type CompanyJob = {
  _id: string;
  title?: string;
  status?: string;
  location?: string;
  createdAt?: string;
};

type CompanyApplication = {
  _id: string;
  status?: string;
  createdAt?: string;
  jobId?: { title?: string } | null;
  profileSnapshot?: { fullName?: string; email?: string };
};

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
  draft: "Rascunho",
  archived: "Arquivada",
  submitted: "Submetida",
  viewed: "Visualizada",
  shortlisted: "Pré-selecionada",
  interview: "Entrevista",
  hired: "Contratado/a",
  withdrawn: "Retirada",
};

function EmpresaPerfilContent() {
  const searchParams = useSearchParams();
  const { token, loading, user } = useAuth("company");
  const [profile, setProfile] = useState<CompanyProfile>({});
  const [jobs, setJobs] = useState<CompanyJob[]>([]);
  const [applications, setApplications] = useState<CompanyApplication[]>([]);
  const [fetchingData, setFetchingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [logoMsg, setLogoMsg] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditPagination, setAuditPagination] = useState<PaginationMeta | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState({
    action: "",
    resourceType: "",
    keyword: "",
    page: 1,
    limit: 12,
  });
  const [teamOwnerUserId, setTeamOwnerUserId] = useState("");
  const [logoCropMode, setLogoCropMode] = useState<"fit" | "square">("fit");
  const { pushToast } = useToasts();

  useEffect(() => {
    if (searchParams.get("createJob") === "1") {
      setJobModalOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      authFetch<{ company: CompanyProfile }>("/companies/profile", token),
      authFetch<{ jobs: CompanyJob[] }>("/companies/jobs", token),
      authFetch<{ applications: CompanyApplication[] }>("/companies/applications", token),
      authFetch<{ members: TeamMember[]; ownerUserId: string }>("/companies/team", token),
      authFetch<{ invites: TeamInvite[] }>("/companies/team/invites", token),
    ])
      .then(([companyData, jobsData, applicationsData, teamData, invitesData]) => {
        setProfile(companyData.company || {});
        setJobs(jobsData.jobs || []);
        setApplications(applicationsData.applications || []);
        setTeamMembers(teamData.members || []);
        setTeamOwnerUserId(teamData.ownerUserId || "");
        setTeamInvites(invitesData.invites || []);
      })
      .catch(() => {
        setFetchError("Erro ao carregar dados da área da empresa.");
        pushToast("error", "Falha ao carregar dados da empresa.");
      })
      .finally(() => setFetchingData(false));
  }, [token, pushToast]);

  useEffect(() => {
    if (!fetchError) return;
    pushToast("error", fetchError);
    setFetchError("");
  }, [fetchError, pushToast]);

  useEffect(() => {
    if (!token) return;
    setAuditLoading(true);
    const query = new URLSearchParams({
      page: String(auditFilters.page),
      limit: String(auditFilters.limit),
      ...(auditFilters.action ? { action: auditFilters.action } : {}),
      ...(auditFilters.resourceType ? { resourceType: auditFilters.resourceType } : {}),
      ...(auditFilters.keyword ? { keyword: auditFilters.keyword } : {}),
    }).toString();

    authFetch<{ entries: AuditEntry[]; pagination?: PaginationMeta }>(`/companies/audit-timeline?${query}`, token)
      .then((data) => {
        setAuditEntries(data.entries || []);
        setAuditPagination(data.pagination || null);
      })
      .catch(() => {
        setAuditEntries([]);
        setAuditPagination(null);
      })
      .finally(() => setAuditLoading(false));
  }, [token, auditFilters]);

  if (loading || fetchingData) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>;

  const set = (k: keyof CompanyProfile, v: string) => setProfile(p => ({ ...p, [k]: v }));

  const inp = (label: string, key: keyof CompanyProfile, type = "text", placeholder = "") => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
        value={(profile[key] as string) ?? ""}
        onChange={e => set(key, e.target.value)}
      />
    </div>
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      await authFetch("/companies/profile", token!, { method: "PATCH", body: JSON.stringify(profile) });
      setMsg("Perfil actualizado com sucesso.");
      pushToast("success", "Perfil actualizado com sucesso.");
    } catch (err: unknown) {
      setMsg((err as Error).message || "Erro ao guardar.");
      pushToast("error", (err as Error).message || "Erro ao guardar perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!token) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setLogoMsg("Formato inválido. Use PNG, JPG ou WEBP.");
      return;
    }

    const MAX_SIZE_MB = 4;
    const MAX_DIM = 1600;
    const TARGET_DIM = 600;

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setLogoMsg(`Ficheiro muito grande. Limite de ${MAX_SIZE_MB}MB.`);
      return;
    }

    let processedFile: File = file;

    try {
      const imageBitmap = await createImageBitmap(file);
      if (imageBitmap.width > MAX_DIM || imageBitmap.height > MAX_DIM) {
        setLogoMsg(`Dimensão inválida. Máximo permitido: ${MAX_DIM}x${MAX_DIM}px.`);
        imageBitmap.close();
        return;
      }

      let sourceX = 0;
      let sourceY = 0;
      let sourceW = imageBitmap.width;
      let sourceH = imageBitmap.height;

      if (logoCropMode === "square") {
        const side = Math.min(imageBitmap.width, imageBitmap.height);
        sourceX = Math.floor((imageBitmap.width - side) / 2);
        sourceY = Math.floor((imageBitmap.height - side) / 2);
        sourceW = side;
        sourceH = side;
      }

      const scale = Math.min(1, TARGET_DIM / Math.max(sourceW, sourceH));
      const outW = Math.max(1, Math.round(sourceW * scale));
      const outH = Math.max(1, Math.round(sourceH * scale));

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        imageBitmap.close();
        throw new Error("Não foi possível processar a imagem.");
      }
      ctx.drawImage(imageBitmap, sourceX, sourceY, sourceW, sourceH, 0, 0, outW, outH);
      imageBitmap.close();

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
      if (!blob) throw new Error("Falha ao comprimir imagem.");
      processedFile = new File([blob], "company-logo.webp", { type: "image/webp" });
    } catch (err: unknown) {
      setLogoMsg(err instanceof Error ? err.message : "Erro ao processar imagem.");
      return;
    }

    const form = new FormData();
    form.append("logo", processedFile);

    setUploadingLogo(true);
    setLogoMsg("");
    try {
      const res = await authFetchRaw("/companies/profile/logo", token, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setProfile((prev) => ({ ...prev, logo: data.company?.logo || data.logoUrl }));
      setLogoMsg("Logo actualizada com sucesso (comprimida no browser). Limites: 4MB, 1600x1600px.");
      pushToast("success", "Logo da empresa actualizada.");
    } catch (err: unknown) {
      setLogoMsg(err instanceof Error ? err.message : "Erro ao carregar logo.");
      pushToast("error", err instanceof Error ? err.message : "Erro ao carregar logo.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const currentUserId = String(
    (user as { id?: string; _id?: string } | null)?.id ||
      (user as { id?: string; _id?: string } | null)?._id ||
      ""
  );
  const isOwner = Boolean(currentUserId && currentUserId === String(teamOwnerUserId || profile.ownerUserId || ""));

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">
        <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
          <CompanySidebar />

          <section>
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-bold">Perfil da Empresa</h1>
                <p className="mt-1 text-gray-500">Actualize as informações públicas e gerencie vagas/candidaturas.</p>
              </div>
              <button
                onClick={() => setJobModalOpen(true)}
                className="app-btn-primary"
              >
                + Nova vaga (modal)
              </button>
            </div>

            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Logo da empresa</h2>
                  <p className="mt-1 max-w-2xl text-sm text-slate-600">
                    Esta imagem aparece nas vagas publicadas e ajuda candidatos a reconhecerem a empresa.
                  </p>
                </div>
                <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  PNG, JPG ou WEBP · até 4MB
                </span>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[180px,1fr]">
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {profile.logo ? (
                      <Image src={profile.logo} alt="Logo da empresa" width={144} height={144} className="h-full w-full object-contain p-3" unoptimized />
                    ) : (
                      <div className="text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-lg font-bold text-red-700">
                          +
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-600">Sem logo</p>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-center text-xs text-slate-500">Pré-visualização</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Imagem pública da empresa</p>
                    <p className="mt-1 text-sm text-slate-600">
                      O ficheiro é comprimido no browser e validado com limite máximo de 1600x1600px.
                    </p>
                  </div>

                  <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700">
                    {uploadingLogo ? "A carregar logo..." : profile.logo ? "Substituir logo" : "Carregar logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                    />
                  </label>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Modo de corte</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        aria-pressed={logoCropMode === "fit"}
                        onClick={() => setLogoCropMode("fit")}
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition ${logoCropMode === "fit" ? "border-red-200 bg-red-50 text-red-800 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
                      >
                        <span className="block font-semibold">Manter proporção</span>
                        <span className="mt-0.5 block text-xs opacity-80">Preserva a imagem completa.</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={logoCropMode === "square"}
                        onClick={() => setLogoCropMode("square")}
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition ${logoCropMode === "square" ? "border-red-200 bg-red-50 text-red-800 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
                      >
                        <span className="block font-semibold">Quadrado</span>
                        <span className="mt-0.5 block text-xs opacity-80">Centraliza para avatar/logo.</span>
                      </button>
                    </div>
                  </div>

                  {logoMsg && (
                    <p className={logoMsg.includes("sucesso") ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" : "rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"}>
                      {logoMsg}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold text-slate-900">Membros da equipa</h2>
              <p className="mt-1 text-sm text-slate-600">A gestão detalhada da equipa agora fica centralizada numa área dedicada para evitar duplicação operacional.</p>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Membros ativos</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{teamMembers.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Convites pendentes</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{teamInvites.filter((invite) => invite.status === "pending").length}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Conta principal</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{isOwner ? "Está a usar a conta owner" : "Apenas leitura nesta área"}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link href="/Portal/Empresa/Utilizadores" className="app-btn-primary">
                  Abrir gestão de utilizadores
                </Link>
                <p className="text-sm text-slate-500">Convites, roles e remoções agora são geridos apenas nessa página.</p>
              </div>
            </section>

            <form onSubmit={handleSave} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="grid gap-5 md:grid-cols-2">
                {inp("Nome da empresa *", "name")}
                {inp("Sector / Indústria", "industry", "text", "Ex: Tecnologia, Banca")}
                {inp("Dimensão", "size", "text", "Ex: 50–200 colaboradores")}
                {inp("Website", "website", "url", "https://…")}
                {inp("Localização principal", "location", "text", "Ex: Luanda, Talatona")}
                {inp("Email de contacto", "contactEmail", "email")}
                {inp("Telefone de contacto", "contactPhone", "tel")}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Descrição da empresa</label>
                <textarea
                  rows={5}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400"
                  placeholder="Descreva a missão, valores e cultura da empresa…"
                  value={profile.description ?? ""}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>
              {msg && <p className={msg.includes("sucesso") ? "text-green-600" : "text-red-600"}>{msg}</p>}
              <button type="submit" disabled={saving} className="rounded-xl bg-red-600 px-6 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {saving ? "A guardar…" : "Guardar alterações"}
              </button>
            </form>

            <section className="mt-8 grid gap-4 lg:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">Vagas da empresa</h3>
                  <Link href="/Portal/Empresa/Minhas-Vagas" className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Ver todas</Link>
                </div>
                {jobs.length === 0 ? (
                  <p className="text-sm text-slate-500">Sem vagas ainda. Clique em Nova vaga para criar um pedido.</p>
                ) : (
                  <div className="space-y-2">
                    {jobs.slice(0, 5).map((job) => (
                      <div key={job._id} className="rounded-xl border border-slate-100 p-3">
                        <p className="text-sm font-semibold text-slate-900">{job.title || "Sem título"}</p>
                        <p className="mt-1 text-xs text-slate-500">{statusLabel[job.status || ""] || job.status || "--"}{job.location ? ` · ${job.location}` : ""}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900">Candidaturas recebidas</h3>
                  <Link href="/Portal/Empresa/Candidaturas" className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Ver todas</Link>
                </div>
                {applications.length === 0 ? (
                  <p className="text-sm text-slate-500">Sem candidaturas recebidas no momento.</p>
                ) : (
                  <div className="space-y-2">
                    {applications.slice(0, 5).map((application) => (
                      <div key={application._id} className="rounded-xl border border-slate-100 p-3">
                        <p className="text-sm font-semibold text-slate-900">{application.profileSnapshot?.fullName || "Candidato"}</p>
                        <p className="mt-1 text-xs text-slate-500">{application.jobId?.title || "Vaga"} · {statusLabel[application.status || ""] || application.status || "--"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>

            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-bold text-slate-900">Timeline de auditoria</h3>
              <p className="mt-1 text-sm text-slate-600">Histórico de alterações em perfil, vagas, candidaturas e convites.</p>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <input
                  value={auditFilters.keyword}
                  onChange={(e) => setAuditFilters((prev) => ({ ...prev, keyword: e.target.value, page: 1 }))}
                  placeholder="Pesquisar evento"
                  className="app-input"
                />
                <input
                  value={auditFilters.action}
                  onChange={(e) => setAuditFilters((prev) => ({ ...prev, action: e.target.value, page: 1 }))}
                  placeholder="Filtrar por ação"
                  className="app-input"
                />
                <select
                  value={auditFilters.resourceType}
                  onChange={(e) => setAuditFilters((prev) => ({ ...prev, resourceType: e.target.value, page: 1 }))}
                  className="app-input"
                >
                  <option value="">Todos os recursos</option>
                  <option value="Company">Company</option>
                  <option value="Job">Job</option>
                  <option value="Application">Application</option>
                  <option value="CompanyInvite">CompanyInvite</option>
                  <option value="User">User</option>
                </select>
                <select
                  value={auditFilters.limit}
                  onChange={(e) => setAuditFilters((prev) => ({ ...prev, limit: Number(e.target.value), page: 1 }))}
                  className="app-input"
                >
                  <option value={12}>12 por página</option>
                  <option value={24}>24 por página</option>
                  <option value={50}>50 por página</option>
                </select>
              </div>

              <div className="mt-4 space-y-2">
                {auditLoading ? (
                  <p className="text-sm text-slate-500">A carregar auditoria...</p>
                ) : auditEntries.length === 0 ? (
                  <p className="text-sm text-slate-500">Sem eventos recentes.</p>
                ) : (
                  auditEntries.map((entry) => (
                    <div key={entry._id} className="rounded-xl border border-slate-100 px-3 py-2">
                      <p className="text-sm font-semibold text-slate-900">{entry.action || "Evento"}</p>
                      <p className="text-xs text-slate-500">{entry.actor?.fullName || entry.actor?.email || "Sistema"} · {entry.resourceType || "--"} · {entry.createdAt ? new Date(entry.createdAt).toLocaleString("pt-AO") : "--"}</p>
                    </div>
                  ))
                )}
              </div>

              {auditPagination && auditPagination.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <p className="text-xs text-slate-500">Página {auditPagination.page} de {auditPagination.totalPages} · {auditPagination.total} eventos</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={auditPagination.page <= 1}
                      onClick={() => setAuditFilters((prev) => ({ ...prev, page: Math.max(prev.page - 1, 1) }))}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={auditPagination.page >= auditPagination.totalPages}
                      onClick={() => setAuditFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40"
                    >
                      Seguinte
                    </button>
                  </div>
                </div>
              )}
            </section>
          </section>
        </div>

        {token && (
          <JobPostingModal
            token={token}
            open={jobModalOpen}
            onClose={() => setJobModalOpen(false)}
            onCreated={(job) => {
              setJobs((prev) => [job, ...prev]);
              pushToast("success", "Pedido de vaga submetido para revisão.");
            }}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function EmpresaPerfilPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" /></div>}>
      <EmpresaPerfilContent />
    </Suspense>
  );
}
