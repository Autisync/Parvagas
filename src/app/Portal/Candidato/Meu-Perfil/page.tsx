"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/api";
import PageHeader from "@/app/components/PageHeader";
import Avatar from "@/app/components/Avatar";
import FileUpload from "@/app/components/FileUpload";
import ProfileCompletionCard from "@/app/components/ProfileCompletionCard";
import { TrashIcon } from "@heroicons/react/24/outline";
import { useAppNotifier } from "@/app/components/AppNotifier";

type Profile = {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  professionalTitle?: string;
  summary?: string;
  bio?: string;
  skills?: string[];
  experience?: Array<Record<string, unknown>>;
  education?: Array<Record<string, unknown>>;
  certifications?: string[];
  portfolioLinks?: string[];
  preferredJobType?: string;
  salaryExpectation?: string;
  availability?: string;
  profilePhotoUrl?: string;
};

type ProfileResponse = {
  profile?: Profile;
  latestCvDocument?: { _id: string; fileName?: string } | null;
};

const REQUIRED_FIELDS: Array<keyof Profile> = [
  "fullName",
  "email",
  "phone",
  "location",
  "professionalTitle",
  "summary",
  "preferredJobType",
  "salaryExpectation",
  "availability",
];

const splitList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const joinList = (value?: string[]) => (Array.isArray(value) ? value.join(", ") : "");

export default function MeuPerfilPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const [profile, setProfile] = useState<Profile>({});
  const [latestCvName, setLatestCvName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const { notify } = useAppNotifier();

  useEffect(() => {
    if (!token) return;
    setFetching(true);
    authFetch<ProfileResponse>("/candidates/profile", token)
      .then((d) => {
        setProfile(d.profile || {});
        setLatestCvName(d.latestCvDocument?.fileName || "");
      })
      .catch(() => setFetchError("Erro ao carregar perfil."))
      .finally(() => setFetching(false));
  }, [token]);

  useEffect(() => {
    if (!fetchError) return;
    notify(fetchError, "error");
    setFetchError("");
  }, [fetchError, notify]);

  useEffect(() => {
    if (!message) return;
    notify(message, message.toLowerCase().includes("sucesso") ? "success" : "error");
    setMessage("");
  }, [message, notify]);

  const completion = useMemo(() => {
    const done = REQUIRED_FIELDS.filter((field) => String(profile[field] || "").trim()).length;
    return Math.round((done / REQUIRED_FIELDS.length) * 100);
  }, [profile]);

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    for (const field of REQUIRED_FIELDS) {
      if (!String(profile[field] || "").trim()) {
        nextErrors[field] = "Obrigatório";
      }
    }
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
      nextErrors.email = "Email inválido";
    }
    if (profile.phone && !/^\+?[\d\s()\-]{7,20}$/.test(profile.phone)) {
      nextErrors.phone = "Telefone inválido";
    }
    if (!Array.isArray(profile.skills) || profile.skills.length === 0) {
      nextErrors.skills = "Adicione pelo menos uma skill";
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handlePhotoUpload = async () => {
    if (!photoFile || !token) return;

    setUploadingPhoto(true);
    setPhotoError("");
    try {
      const formData = new FormData();
      formData.append("photo", photoFile);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/candidates/profile/photo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = (await response.json()) as any;
        throw new Error(error.error || "Erro ao enviar foto");
      }

      const result = (await response.json()) as any;
      setProfile(result.profile || {});
      setPhotoFile(null);
      setMessage("Foto de perfil enviada com sucesso!");
    } catch (error: unknown) {
      setPhotoError((error as Error).message || "Erro ao enviar foto");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!token || !confirm("Tem certeza que deseja remover a foto de perfil?")) return;

    setDeletingPhoto(true);
    setPhotoError("");
    try {
      const response = await authFetch("/candidates/profile/photo", token, { method: "DELETE" }) as any;
      setProfile(response.profile || {});
      setMessage("Foto de perfil removida com sucesso!");
    } catch (error: unknown) {
      setPhotoError((error as Error).message || "Erro ao remover foto");
    } finally {
      setDeletingPhoto(false);
    }
  };

  const field = (label: string, key: keyof Profile, type = "text", required = false) => (
    <div key={String(key)}>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      <input
        type={type}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={(profile[key] as string) ?? ""}
        onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
      />
      {fieldErrors[key] ? <p className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p> : null}
    </div>
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    if (!validateForm()) {
      setMessage("Verifique os campos obrigatórios antes de guardar.");
      return;
    }

    setSaving(true);
    try {
      await authFetch("/candidates/profile", token!, { method: "PATCH", body: JSON.stringify(profile) });
      setMessage("Perfil atualizado com sucesso.");
    } catch (err: unknown) {
      const errorMessage = (err as Error).message || "Erro ao guardar perfil.";
      setMessage(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <PageHeader
        title="Meu Perfil"
        description="Atualize os seus dados e melhore a qualidade das recomendações de vagas."
        badge="Perfil"
      />

      {/* Profile Photo Section */}
      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-6 text-lg font-semibold text-slate-900">Foto de Perfil</h2>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <div>
            <Avatar src={profile.profilePhotoUrl} name={profile.fullName} size="xl" />
            {profile.profilePhotoUrl && (
              <button
                type="button"
                onClick={handleDeletePhoto}
                disabled={deletingPhoto}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-60"
              >
                <TrashIcon className="h-4 w-4" />
                {deletingPhoto ? "A remover..." : "Remover"}
              </button>
            )}
          </div>

          <div className="flex-1">
            <FileUpload
              accept="image/jpeg,image/png,image/webp"
              maxSize={5 * 1024 * 1024}
              label="Selecionar nova foto"
              helpText="JPG, PNG ou WEBP. Máximo 5MB."
              error={photoError}
              loading={uploadingPhoto}
              onFileSelected={setPhotoFile}
              preview={profile.profilePhotoUrl}
            />
            {photoFile && (
              <button
                type="button"
                onClick={handlePhotoUpload}
                disabled={uploadingPhoto}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {uploadingPhoto ? "A enviar..." : "Enviar Foto"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profile Completion */}
      <ProfileCompletionCard completion={completion} />

      {/* Stats Cards */}
      <div className="mb-8 mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Skills</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{(profile.skills || []).length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Experiência</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{Array.isArray(profile.experience) ? profile.experience.length : 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Educação</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{Array.isArray(profile.education) ? profile.education.length : 0}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Certificações</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{(profile.certifications || []).length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-600">Último CV</p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-900">{latestCvName || "Sem CV"}</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Informação Pessoal</h2>

        <div className="grid gap-5 md:grid-cols-2">
          {field("Nome completo", "fullName", "text", true)}
          {field("Email", "email", "email", true)}
          {field("Telefone", "phone", "tel", true)}
          {field("Localização", "location", "text", true)}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {field("Título profissional", "professionalTitle", "text", true)}
          {field("Tipo de trabalho preferido", "preferredJobType", "text", true)}
          {field("Expectativa salarial", "salaryExpectation", "text", true)}
          {field("Disponibilidade", "availability", "text", true)}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Resumo profissional<span className="ml-1 text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={profile.summary ?? ""}
            onChange={(e) => setProfile((p) => ({ ...p, summary: e.target.value, bio: e.target.value }))}
          />
          {fieldErrors.summary ? <p className="mt-1 text-xs text-red-600">{fieldErrors.summary}</p> : null}
        </div>

        <div className="border-t border-slate-200 pt-6">
          <h3 className="mb-5 font-semibold text-slate-900">Qualificações</h3>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Skills (vírgula separado)</label>
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={joinList(profile.skills)}
                onChange={(e) => setProfile((p) => ({ ...p, skills: splitList(e.target.value) }))}
              />
              {fieldErrors.skills ? <p className="mt-1 text-xs text-red-600">{fieldErrors.skills}</p> : null}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Certificações (vírgula separado)</label>
              <input
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={joinList(profile.certifications)}
                onChange={(e) => setProfile((p) => ({ ...p, certifications: splitList(e.target.value) }))}
              />
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-medium text-slate-700">Links de portfólio (vírgula separado)</label>
            <input
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={joinList(profile.portfolioLinks)}
              onChange={(e) => setProfile((p) => ({ ...p, portfolioLinks: splitList(e.target.value) }))}
            />
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <h3 className="mb-5 font-semibold text-slate-900">Experiência e Educação</h3>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Experiência (JSON array)</label>
              <textarea
                rows={4}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={JSON.stringify(profile.experience || [], null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setProfile((p) => ({ ...p, experience: Array.isArray(parsed) ? parsed : [] }));
                    setFieldErrors((prev) => {
                      const { experience, ...rest } = prev;
                      return rest;
                    });
                  } catch {
                    setFieldErrors((prev) => ({ ...prev, experience: "JSON inválido" }));
                  }
                }}
              />
              {fieldErrors.experience ? <p className="mt-1 text-xs text-red-600">{fieldErrors.experience}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Educação (JSON array)</label>
              <textarea
                rows={4}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={JSON.stringify(profile.education || [], null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setProfile((p) => ({ ...p, education: Array.isArray(parsed) ? parsed : [] }));
                    setFieldErrors((prev) => {
                      const { education, ...rest } = prev;
                      return rest;
                    });
                  } catch {
                    setFieldErrors((prev) => ({ ...prev, education: "JSON inválido" }));
                  }
                }}
              />
              {fieldErrors.education ? <p className="mt-1 text-xs text-red-600">{fieldErrors.education}</p> : null}
            </div>
          </div>
        </div>

        <div className="flex gap-3 border-t border-slate-200 pt-6">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "A guardar..." : "Guardar Alterações"}
          </button>
        </div>
      </form>
    </div>
  );
}
