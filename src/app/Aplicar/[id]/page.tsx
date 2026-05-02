"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import { useAppNotifier } from "@/app/components/AppNotifier";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import { apiFetch, apiUrl, authFetch, getToken, getUser } from "@/lib/api";

type JobDetail = {
  _id: string;
  title: string;
  location?: string;
  companyId?: { name?: string } | string;
};

type ProfileResponse = {
  profile?: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
  } | null;
};

type CandidateUser = {
  role?: string;
};

type ViewMode = "candidate" | "guest";

export default function ApplyJobPage({ params }: { params: { id: string } }) {
  const { notify } = useAppNotifier();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [token, setToken] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("guest");

  const [candidateForm, setCandidateForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    location: "",
    coverLetter: "",
    useLatestCv: true,
    customCv: null as File | null,
  });

  const [guestForm, setGuestForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    location: "",
    coverLetter: "",
    cv: null as File | null,
  });

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const [jobRes] = await Promise.all([
          apiFetch<{ job?: JobDetail }>(`/jobs/${params.id}`),
        ]);

        if (!mounted) return;
        setJob(jobRes.job || null);

        const t = getToken();
        const u = (getUser() || {}) as CandidateUser;
        const isCandidate = Boolean(t && u?.role === "candidate");
        setToken(t);
        setMode(isCandidate ? "candidate" : "guest");

        if (isCandidate && t) {
          const profileRes = await authFetch<ProfileResponse>("/candidates/profile", t);
          if (!mounted) return;
          setCandidateForm((prev) => ({
            ...prev,
            fullName: profileRes.profile?.fullName || prev.fullName,
            email: profileRes.profile?.email || prev.email,
            phone: profileRes.profile?.phone || prev.phone,
            location: profileRes.profile?.location || prev.location,
          }));
        }
      } catch (error: unknown) {
        if (mounted) notify(error instanceof Error ? error.message : "Erro ao carregar dados da vaga.", "error");
      } finally {
        if (mounted) setLoadingJob(false);
      }
    };

    bootstrap();
    return () => {
      mounted = false;
    };
  }, [params.id, notify]);

  const companyName = useMemo(() => {
    if (!job?.companyId || typeof job.companyId === "string") return "Empresa";
    return job.companyId.name || "Empresa";
  }, [job?.companyId]);

  const uploadWithProgress = (url: string, formData: FormData, authToken?: string) => {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", apiUrl(url));
      if (authToken) xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        setUploadProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      };

      xhr.onload = () => {
        setUploadProgress(100);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        try {
          const parsed = JSON.parse(xhr.responseText || "{}");
          reject(new Error(parsed.error || `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Falha de rede ao submeter candidatura."));
      xhr.send(formData);
    });
  };

  const submitCandidateApplication = async () => {
    if (!token) {
      notify("Sessão expirada. Inicie sessão novamente.", "error");
      return;
    }
    if (!job?._id) return;

    setSubmitting(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("jobId", job._id);
      formData.append("useLatestCv", candidateForm.useLatestCv ? "true" : "false");
      formData.append("coverLetter", candidateForm.coverLetter);
      if (!candidateForm.useLatestCv && candidateForm.customCv) {
        formData.append("customCv", candidateForm.customCv);
      }

      await uploadWithProgress("/candidates/jobs/apply", formData, token);
      notify("Candidatura submetida com sucesso.", "success");
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : "Erro ao submeter candidatura.", "error");
    } finally {
      setSubmitting(false);
      setTimeout(() => setUploadProgress(0), 500);
    }
  };

  const submitGuestQuickApply = async () => {
    if (!job?._id) return;
    if (!guestForm.fullName || !guestForm.email || !guestForm.phone || !guestForm.location || !guestForm.cv) {
      notify("Preencha os campos obrigatórios e anexe o CV.", "warning");
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("fullName", guestForm.fullName);
      formData.append("email", guestForm.email);
      formData.append("phone", guestForm.phone);
      formData.append("location", guestForm.location);
      formData.append("coverLetter", guestForm.coverLetter);
      formData.append("cv", guestForm.cv);

      await uploadWithProgress(`/public/jobs/${job._id}/quick-apply`, formData);
      notify("Candidatura rápida submetida. Enviámos instruções para o seu email.", "success");
      setGuestForm((prev) => ({ ...prev, cv: null, coverLetter: "" }));
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : "Erro ao submeter Quick Apply.", "error");
    } finally {
      setSubmitting(false);
      setTimeout(() => setUploadProgress(0), 500);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Breadcrumbs
          className="mb-6"
          items={[
            { label: "Início", href: "/" },
            { label: "Vagas", href: "/Vagas-Disponiveis" },
            { label: "Aplicar" },
          ]}
        />

        {loadingJob ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">A carregar vaga...</div>
        ) : !job ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">Vaga não encontrada.</div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Candidatura</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">{job.title}</h1>
              <p className="mt-1 text-sm text-slate-600">{companyName}{job.location ? ` · ${job.location}` : ""}</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="mb-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMode("candidate")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === "candidate" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  Já tenho conta
                </button>
                <button
                  type="button"
                  onClick={() => setMode("guest")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === "guest" ? "bg-red-600 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  Quick Apply
                </button>
              </div>

              {mode === "candidate" ? (
                <div className="space-y-4">
                  {!token ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      Inicie sessão para usar dados pré-preenchidos e acompanhar candidatura.
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={`/Login?next=/Aplicar/${job._id}`} className="rounded-lg bg-red-600 px-3 py-2 font-semibold text-white">Entrar</Link>
                        <Link href={`/Signup?next=/Aplicar/${job._id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700">Criar conta</Link>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <input className="rounded-xl border border-slate-300 px-3 py-2" value={candidateForm.fullName} onChange={(e) => setCandidateForm((p) => ({ ...p, fullName: e.target.value }))} placeholder="Nome" />
                        <input className="rounded-xl border border-slate-300 px-3 py-2" value={candidateForm.email} onChange={(e) => setCandidateForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" />
                        <input className="rounded-xl border border-slate-300 px-3 py-2" value={candidateForm.phone} onChange={(e) => setCandidateForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Telefone" />
                        <input className="rounded-xl border border-slate-300 px-3 py-2" value={candidateForm.location} onChange={(e) => setCandidateForm((p) => ({ ...p, location: e.target.value }))} placeholder="Localização" />
                      </div>

                      <fieldset className="space-y-2">
                        <legend className="text-sm font-semibold text-slate-800">CV para esta vaga</legend>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input type="radio" checked={candidateForm.useLatestCv} onChange={() => setCandidateForm((p) => ({ ...p, useLatestCv: true }))} />
                          Usar CV já guardado
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input type="radio" checked={!candidateForm.useLatestCv} onChange={() => setCandidateForm((p) => ({ ...p, useLatestCv: false }))} />
                          Enviar novo CV (PDF/DOCX)
                        </label>
                        {!candidateForm.useLatestCv ? (
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            onChange={(e) => setCandidateForm((p) => ({ ...p, customCv: e.target.files?.[0] || null }))}
                            className="block w-full rounded-xl border border-slate-300 px-3 py-2"
                          />
                        ) : null}
                      </fieldset>

                      <textarea
                        rows={4}
                        value={candidateForm.coverLetter}
                        onChange={(e) => setCandidateForm((p) => ({ ...p, coverLetter: e.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2"
                        placeholder="Nota curta para recrutador (opcional)"
                      />

                      <button
                        type="button"
                        onClick={submitCandidateApplication}
                        disabled={submitting || (!candidateForm.useLatestCv && !candidateForm.customCv)}
                        className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
                      >
                        {submitting ? "A submeter..." : "Confirmar candidatura"}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <input className="rounded-xl border border-slate-300 px-3 py-2" value={guestForm.fullName} onChange={(e) => setGuestForm((p) => ({ ...p, fullName: e.target.value }))} placeholder="Nome completo *" />
                    <input className="rounded-xl border border-slate-300 px-3 py-2" value={guestForm.email} onChange={(e) => setGuestForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email *" />
                    <input className="rounded-xl border border-slate-300 px-3 py-2" value={guestForm.phone} onChange={(e) => setGuestForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Telefone *" />
                    <input className="rounded-xl border border-slate-300 px-3 py-2" value={guestForm.location} onChange={(e) => setGuestForm((p) => ({ ...p, location: e.target.value }))} placeholder="Localização *" />
                  </div>

                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setGuestForm((p) => ({ ...p, cv: e.target.files?.[0] || null }))}
                    className="block w-full rounded-xl border border-slate-300 px-3 py-2"
                  />

                  <textarea
                    rows={4}
                    value={guestForm.coverLetter}
                    onChange={(e) => setGuestForm((p) => ({ ...p, coverLetter: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    placeholder="Nota curta para recrutador (opcional)"
                  />

                  <button
                    type="button"
                    onClick={submitGuestQuickApply}
                    disabled={submitting || !guestForm.cv}
                    className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
                  >
                    {submitting ? "A submeter..." : "Submeter Quick Apply"}
                  </button>
                </div>
              )}

              {uploadProgress > 0 ? (
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                    <span>Upload</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-red-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
