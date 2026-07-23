"use client";

import Link from "next/link";
import Image from "next/image";
import { CheckBadgeIcon, ClockIcon, ExclamationTriangleIcon, NoSymbolIcon } from "@heroicons/react/24/solid";
import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, authFetchRaw } from "@/lib/api";
import Footer from "@/app/components/Footer";
import { useToasts } from "../components/useToasts";
import { resolveLogoUrl } from "../components/logoUrl";

const JobPostingModal = dynamic(() => import("../components/JobPostingModal"), {
  ssr: false,
});

const LogoUploadModal = dynamic(() => import("../components/LogoUploadModal"), {
  ssr: false,
});

type SocialLinks = { linkedin?: string; facebook?: string; instagram?: string; twitter?: string };

type CompanyProfile = {
  name?: string;
  slug?: string;
  status?: "inactive" | "pending_verification" | "active" | "rejected" | "suspended";
  industry?: string;
  size?: string;
  website?: string;
  description?: string;
  location?: string;
  contactEmail?: string;
  contactPhone?: string;
  logo?: string;
  ownerUserId?: string;
  benefits?: string[];
  socialLinks?: SocialLinks;
  galleryPhotos?: string[];
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
  const { token, loading, user } = useAuth("company");
  const [profile, setProfile] = useState<CompanyProfile>({});
  const [jobs, setJobs] = useState<CompanyJob[]>([]);
  const [applications, setApplications] = useState<CompanyApplication[]>([]);
  const [fetchingData, setFetchingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [logoMsg, setLogoMsg] = useState("");
  const [benefitInput, setBenefitInput] = useState("");
  const [galleryUploading, setGalleryUploading] = useState(false);
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
  const { pushToast } = useToasts();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("createJob") === "1") {
      setJobModalOpen(true);
    }
  }, []);

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
        pushToast("error", "Falha ao carregar dados da empresa.");
      })
      .finally(() => setFetchingData(false));
  }, [token, pushToast]);

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
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-400"
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
      await authFetch("/companies/profile", token!, { method: "PUT", body: JSON.stringify(profile) });
      setMsg("Perfil actualizado com sucesso.");
      pushToast("success", "Perfil actualizado com sucesso.");
    } catch (err: unknown) {
      setMsg((err as Error).message || "Erro ao guardar.");
      pushToast("error", (err as Error).message || "Erro ao guardar perfil.");
    } finally {
      setSaving(false);
    }
  };

  const addBenefit = (raw: string) => {
    const normalized = raw.trim().replace(/\s+/g, " ");
    if (!normalized) return;
    setProfile((prev) => {
      const current = prev.benefits ?? [];
      if (current.some((item) => item.toLowerCase() === normalized.toLowerCase())) return prev;
      return { ...prev, benefits: [...current, normalized] };
    });
    setBenefitInput("");
  };

  const removeBenefit = (benefit: string) => {
    setProfile((prev) => ({ ...prev, benefits: (prev.benefits ?? []).filter((item) => item !== benefit) }));
  };

  const setSocialLink = (key: keyof SocialLinks, value: string) => {
    setProfile((prev) => ({ ...prev, socialLinks: { ...prev.socialLinks, [key]: value } }));
  };

  const uploadGalleryPhoto = async (file: File) => {
    if (!token) return;
    setGalleryUploading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await authFetchRaw("/companies/profile/gallery", token, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setProfile((prev) => ({ ...prev, galleryPhotos: data.galleryPhotos ?? prev.galleryPhotos }));
      pushToast("success", "Foto adicionada à galeria.");
    } catch (err: unknown) {
      pushToast("error", (err as Error).message || "Erro ao carregar foto.");
    } finally {
      setGalleryUploading(false);
    }
  };

  const deleteGalleryPhoto = async (index: number) => {
    if (!token) return;
    try {
      const data = await authFetch<{ galleryPhotos: string[] }>(`/companies/profile/gallery/${index}`, token, { method: "DELETE" });
      setProfile((prev) => ({ ...prev, galleryPhotos: data.galleryPhotos }));
    } catch (err: unknown) {
      pushToast("error", (err as Error).message || "Erro ao remover foto.");
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
      <main className="mx-auto max-w-7xl px-6 pb-24 lg:pb-16 pt-8">
        <section>
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">Perfil da Empresa</h1>
              <p className="mt-1 text-gray-500">Actualize as informações públicas e gerencie vagas/candidaturas.</p>
            </div>
          </div>

          {(() => {
            const verificationCopy: Record<string, { tone: string; icon: ReactNode; title: string; body: string }> = {
              active: {
                tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
                icon: <CheckBadgeIcon className="h-5 w-5 text-emerald-600" />,
                title: "Empresa verificada",
                body: "A sua conta foi confirmada pela equipa Parvagas — o selo \"Verificada\" abaixo já aparece em todas as vagas publicadas, aumentando a confiança dos candidatos.",
              },
              pending_verification: {
                tone: "border-amber-200 bg-amber-50 text-amber-900",
                icon: <ClockIcon className="h-5 w-5 text-amber-600" />,
                title: "Conta em verificação: ainda não pode publicar vagas",
                body: "A equipa Parvagas confirma manualmente o NIF, o contacto e os dados do perfil de cada empresa antes da primeira publicação — normalmente em 1 a 2 dias úteis. Complete os campos abaixo (nome legal, contacto, website) para acelerar a análise.",
              },
              rejected: {
                tone: "border-red-200 bg-red-50 text-red-900",
                icon: <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />,
                title: "Conta rejeitada: contacte o suporte para nova análise",
                body: "A verificação não foi aprovada — reveja os dados da empresa (nome legal e NIF são os motivos mais comuns) e peça reavaliação junto do suporte.",
              },
              suspended: {
                tone: "border-red-200 bg-red-50 text-red-900",
                icon: <NoSymbolIcon className="h-5 w-5 text-red-600" />,
                title: "Conta suspensa",
                body: "O acesso a novas publicações está temporariamente bloqueado. Contacte o suporte Parvagas para entender o motivo e os próximos passos.",
              },
            };
            const copy = profile.status ? verificationCopy[profile.status] : undefined;
            if (!copy) return null;
            return (
              <section className={`mb-6 rounded-2xl border p-4 ${copy.tone}`}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">{copy.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">{copy.title}</p>
                    <p className="mt-1 text-sm opacity-90">{copy.body}</p>
                    {profile.status === "active" && (
                      <span className="app-badge app-badge-success mt-3 inline-flex w-fit items-center gap-1" title="Como aparece nas vagas publicadas">
                        <CheckBadgeIcon className="h-3.5 w-3.5" /> Verificada
                      </span>
                    )}
                  </div>
                </div>
              </section>
            );
          })()}

          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">A sua página pública</h2>
                {profile.status === "active" && profile.slug ? (
                  <p className="mt-1 break-all text-sm text-slate-600">parvagas.pt/Empresas/{profile.slug}</p>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Disponível após verificação da empresa.</p>
                )}
              </div>
              {profile.status === "active" && profile.slug ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`https://parvagas.pt/Empresas/${profile.slug}`);
                      pushToast("success", "Ligação copiada.");
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Copiar ligação
                  </button>
                  <Link
                    href={`/Empresas/${profile.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                  >
                    Ver página
                  </Link>
                </div>
              ) : null}
            </div>
          </section>

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
                    <Image src={resolveLogoUrl(profile.logo)} alt="Logo da empresa" width={180} height={180} className="h-full w-full object-contain p-3" unoptimized />
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
                    Gestão de upload, corte e escala agora é feita em modal para melhor controlo visual.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setLogoModalOpen(true)}
                  className="app-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm shadow-sm"
                >
                  {profile.logo ? "Gerir logo" : "Carregar logo"}
                </button>

                <p className="text-xs text-slate-500">Suporta PNG, JPG, WEBP, AVIF, GIF, BMP, TIFF, SVG e HEIC/HEIF (conversão automática para WEBP).</p>

                {logoMsg && (
                  <p className={logoMsg.includes("sucesso") ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" : "rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"}>
                    {logoMsg}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Galeria de fotos</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Fotos do escritório, da equipa ou de eventos — ajudam um candidato a imaginar-se a trabalhar convosco.
                </p>
              </div>
              <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {(profile.galleryPhotos ?? []).length}/6 fotos
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {(profile.galleryPhotos ?? []).map((url, index) => (
                <div key={url + index} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <Image src={url} alt={`Foto ${index + 1} da empresa`} fill unoptimized className="object-cover" />
                  <button
                    type="button"
                    onClick={() => deleteGalleryPhoto(index)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100"
                    aria-label="Remover foto"
                  >
                    x
                  </button>
                </div>
              ))}
              {(profile.galleryPhotos ?? []).length < 6 && (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs font-semibold text-slate-500 hover:bg-slate-100">
                  {galleryUploading ? "A carregar..." : "+ Adicionar foto"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={galleryUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) uploadGalleryPhoto(file);
                    }}
                  />
                </label>
              )}
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
              <Link href="/Portal/Empresa/Utilizadores" className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                Abrir gestão de utilizadores
              </Link>
              <Link href="/Portal/Empresa/Definicoes" className="inline-flex items-center rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100">
                Abrir definições
              </Link>
              <p className="text-sm text-slate-500">Convites, roles e remoções são geridos em Utilizadores. Tutorial disponível em Definições.</p>
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
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-400"
                placeholder="Descreva a missão, valores e cultura da empresa…"
                value={profile.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Benefícios e regalias</label>
              <input
                value={benefitInput}
                onChange={(e) => setBenefitInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addBenefit(benefitInput);
                  }
                }}
                onBlur={() => addBenefit(benefitInput)}
                placeholder="Ex: Seguro de saúde (Enter ou vírgula para adicionar)"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {(profile.benefits ?? []).map((benefit) => (
                  <button
                    key={benefit}
                    type="button"
                    onClick={() => removeBenefit(benefit)}
                    className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
                  >
                    <span>{benefit}</span>
                    <span aria-hidden="true">x</span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">Aparecem no perfil público da empresa para ajudar candidatos a decidir.</p>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">Redes sociais</p>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={profile.socialLinks?.linkedin ?? ""}
                  onChange={(e) => setSocialLink("linkedin", e.target.value)}
                  placeholder="LinkedIn — https://linkedin.com/company/…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <input
                  value={profile.socialLinks?.facebook ?? ""}
                  onChange={(e) => setSocialLink("facebook", e.target.value)}
                  placeholder="Facebook — https://facebook.com/…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <input
                  value={profile.socialLinks?.instagram ?? ""}
                  onChange={(e) => setSocialLink("instagram", e.target.value)}
                  placeholder="Instagram — https://instagram.com/…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <input
                  value={profile.socialLinks?.twitter ?? ""}
                  onChange={(e) => setSocialLink("twitter", e.target.value)}
                  placeholder="X / Twitter — https://x.com/…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
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
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>Pesquisar evento</span>
                <input
                  value={auditFilters.keyword}
                  onChange={(e) => setAuditFilters((prev) => ({ ...prev, keyword: e.target.value, page: 1 }))}
                  placeholder="Ex.: alteração de vaga"
                  className="app-input"
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>Filtrar por ação</span>
                <input
                  value={auditFilters.action}
                  onChange={(e) => setAuditFilters((prev) => ({ ...prev, action: e.target.value, page: 1 }))}
                  placeholder="Ex.: job.update"
                  className="app-input"
                />
              </label>
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

        {token && (
          <LogoUploadModal
            token={token}
            open={logoModalOpen}
            currentLogo={profile.logo}
            onClose={() => setLogoModalOpen(false)}
            onUploaded={(newLogo) => {
              setProfile((prev) => ({ ...prev, logo: newLogo }));
              setLogoMsg("Logo actualizada com sucesso.");
            }}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function EmpresaPerfilPage() {
  return <EmpresaPerfilContent />;
}
