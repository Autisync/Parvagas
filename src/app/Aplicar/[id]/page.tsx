"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";
import { useAppNotifier } from "@/app/components/AppNotifier";
import Breadcrumbs from "@/app/components/ui/Breadcrumbs";
import { apiFetch, authFetch, getToken, getUser } from "@/lib/api";
import { uploadWithProgress } from "@/lib/uploadClient";
import { getRecaptchaToken } from "@/lib/recaptcha";
import RecaptchaNotice from "@/app/components/RecaptchaNotice";
import { SuccessCheck, MilestoneCelebration } from "@/app/components/motion";
import { track } from "@/lib/analytics";

type JobDetail = {
  _id: string;
  title: string;
  location?: string;
  companyId?: { _id?: string; id?: string; name?: string } | string;
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

type CvDocument = {
  _id: string;
  fileName?: string;
  createdAt?: string;
};

type ViewMode = "candidate" | "guest";

export default function ApplyJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = use(params);
  const { notify } = useAppNotifier();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [guestTrackingUrl, setGuestTrackingUrl] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [accountRole, setAccountRole] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("guest");
  const [savedCvs, setSavedCvs] = useState<CvDocument[]>([]);

  const [candidateForm, setCandidateForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    location: "",
    coverLetter: "",
    useLatestCv: true,
    savedCvDocumentId: "",
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
          apiFetch<{ job?: JobDetail }>(`/jobs/${jobId}`, { suppressGlobalErrors: true }),
        ]);

        if (!mounted) return;
        setJob(jobRes.job || null);

        const t = getToken();
        const u = (getUser() || {}) as CandidateUser;
        const isCandidate = Boolean(t && u?.role === "candidate");
        setToken(t);
        setAccountRole(t ? u?.role || null : null);
        setMode(isCandidate ? "candidate" : "guest");

        if (isCandidate && t) {
          const [profileRes, docsRes] = await Promise.all([
            authFetch<ProfileResponse>("/candidates/profile", t, { suppressGlobalErrors: true }),
            authFetch<{ documents?: CvDocument[] }>("/candidates/cv/documents", t, { suppressGlobalErrors: true }),
          ]);
          if (!mounted) return;
          const docs = (docsRes.documents || []).filter(Boolean);
          setSavedCvs(docs);
          setCandidateForm((prev) => ({
            ...prev,
            fullName: profileRes.profile?.fullName || prev.fullName,
            email: profileRes.profile?.email || prev.email,
            phone: profileRes.profile?.phone || prev.phone,
            location: profileRes.profile?.location || prev.location,
            savedCvDocumentId: docs[0]?._id || "",
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
  }, [jobId, notify]);

  const companyName = useMemo(() => {
    if (!job?.companyId || typeof job.companyId === "string") return "Empresa";
    return job.companyId.name || "Empresa";
  }, [job?.companyId]);

  const companyId = useMemo(() => {
    if (!job?.companyId) return "";
    if (typeof job.companyId === "string") return job.companyId;
    return String(job.companyId._id || job.companyId.id || "");
  }, [job?.companyId]);
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
      if (companyId) formData.append("companyId", companyId);
      formData.append("useLatestCv", candidateForm.useLatestCv ? "true" : "false");
      formData.append("coverLetter", candidateForm.coverLetter);
      formData.append("phone", candidateForm.phone);
      formData.append("location", candidateForm.location);
      if (candidateForm.useLatestCv && candidateForm.savedCvDocumentId) {
        formData.append("savedCvDocumentId", candidateForm.savedCvDocumentId);
      }
      if (!candidateForm.useLatestCv && candidateForm.customCv) {
        formData.append("customCv", candidateForm.customCv);
      }

      await uploadWithProgress({
        path: "/candidates/jobs/apply",
        formData,
        token,
        onProgress: setUploadProgress,
      });
      notify("Candidatura submetida com sucesso.", "success");
      setSubmitted(true);
      setCelebrate(true);
      track("apply_success");
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
      if (companyId) formData.append("companyId", companyId);
      formData.append("fullName", guestForm.fullName);
      formData.append("email", guestForm.email);
      formData.append("phone", guestForm.phone);
      formData.append("location", guestForm.location);
      formData.append("coverLetter", guestForm.coverLetter);
      formData.append("cv", guestForm.cv);

      const captchaToken = await getRecaptchaToken("apply");
      const result = await uploadWithProgress<{ trackingUrl?: string }>({
        path: `/public/jobs/${job._id}/quick-apply`,
        formData,
        captchaToken,
        onProgress: setUploadProgress,
      });
      notify("Candidatura rápida submetida. Enviámos instruções para o seu email.", "success");
      setGuestForm((prev) => ({ ...prev, cv: null, coverLetter: "" }));
      setGuestTrackingUrl(result?.trackingUrl || null);
      setSubmitted(true);
      setCelebrate(true);
      track("apply_success");
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

        {submitted ? (
          <>
            <MilestoneCelebration show={celebrate} onDone={() => setCelebrate(false)} />
            <div className="app-card pv-animate-pop mx-auto max-w-xl p-8 text-center">
              <div className="flex justify-center">
                <SuccessCheck size={84} tone="brand" />
              </div>
              <h1 className="mt-6 text-balance text-2xl font-bold text-[var(--text-strong)]">
                Candidatura enviada!
              </h1>
              <p className="mx-auto mt-2 max-w-md text-pretty text-sm leading-relaxed text-[var(--text-muted)]">
                {job?.title
                  ? `A sua candidatura para ${job.title} foi submetida com sucesso. A empresa será notificada.`
                  : "A sua candidatura foi submetida com sucesso. A empresa será notificada."}
              </p>
              {mode === "guest" && guestTrackingUrl ? (
                <div className="mx-auto mt-5 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Sem conta? Guarde este link.</p>
                  <p className="mt-1">
                    Enviámos-lhe também por email um link único para acompanhar o estado desta candidatura a
                    qualquer momento.
                  </p>
                  <Link href={guestTrackingUrl} className="mt-2 inline-block break-all font-semibold text-red-700 hover:underline">
                    {guestTrackingUrl}
                  </Link>
                </div>
              ) : null}
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                {mode === "candidate" ? (
                  <Link href="/Portal/Candidato/Candidaturas" className="app-btn-primary px-5 py-2.5 text-sm">
                    Ver as minhas candidaturas
                  </Link>
                ) : null}
                {mode === "guest" && guestTrackingUrl ? (
                  <Link href={guestTrackingUrl} className="app-btn-primary px-5 py-2.5 text-sm">
                    Acompanhar candidatura
                  </Link>
                ) : null}
                <Link href="/Vagas-Disponiveis" className="app-btn-secondary px-5 py-2.5 text-sm">
                  Explorar mais vagas
                </Link>
              </div>
            </div>
          </>
        ) : loadingJob ? (
          <div className="app-card p-6">
            <div className="app-skeleton h-6 w-1/2" />
            <div className="app-skeleton mt-3 h-4 w-full" />
            <div className="app-skeleton mt-2 h-4 w-2/3" />
          </div>
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
                  ) : accountRole && accountRole !== "candidate" ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      Esta conta não é uma conta de candidato, por isso não pode candidatar-se com dados de perfil. Use o Quick Apply ou inicie sessão com uma conta de candidato.
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* Locked to the account: the acknowledgement email and
                            the applicant record on the company side always use
                            the verified account identity, never a value typed
                            here — so these stay read-only instead of pretending
                            to be editable. */}
                        <input readOnly className="cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500" value={candidateForm.fullName} placeholder="Nome" title="Vem da sua conta" />
                        <input readOnly className="cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500" value={candidateForm.email} placeholder="E-mail" title="Vem da sua conta" />
                        <input className="rounded-xl border border-slate-300 px-3 py-2" value={candidateForm.phone} onChange={(e) => setCandidateForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Telefone" />
                        <input className="rounded-xl border border-slate-300 px-3 py-2" value={candidateForm.location} onChange={(e) => setCandidateForm((p) => ({ ...p, location: e.target.value }))} placeholder="Localização" />
                      </div>

                      <fieldset className="space-y-2">
                        <legend className="text-sm font-semibold text-slate-800">CV para esta vaga</legend>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input type="radio" checked={candidateForm.useLatestCv} onChange={() => setCandidateForm((p) => ({ ...p, useLatestCv: true }))} />
                          Usar CV já guardado
                        </label>
                        {candidateForm.useLatestCv ? (
                          savedCvs.length > 0 ? (
                            <select
                              value={candidateForm.savedCvDocumentId}
                              onChange={(e) => setCandidateForm((p) => ({ ...p, savedCvDocumentId: e.target.value }))}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                            >
                              {savedCvs.map((doc) => (
                                <option key={doc._id} value={doc._id}>
                                  {doc.fileName || "CV"}
                                  {doc.createdAt ? ` (${new Date(doc.createdAt).toLocaleDateString("pt-PT")})` : ""}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-xs text-amber-700">
                              Não encontrou CV guardado. Selecione &quot;Enviar novo CV&quot; para anexar um ficheiro.
                            </p>
                          )
                        ) : null}
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input type="radio" checked={!candidateForm.useLatestCv} onChange={() => setCandidateForm((p) => ({ ...p, useLatestCv: false }))} />
                          Enviar novo CV (PDF/DOCX)
                        </label>
                        {!candidateForm.useLatestCv ? (
                          <input
                            type="file"
                            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                        disabled={
                          submitting ||
                          (!candidateForm.useLatestCv && !candidateForm.customCv) ||
                          (candidateForm.useLatestCv && !candidateForm.savedCvDocumentId)
                        }
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
                    <input className="rounded-xl border border-slate-300 px-3 py-2" value={guestForm.email} onChange={(e) => setGuestForm((p) => ({ ...p, email: e.target.value }))} placeholder="E-mail *" />
                    <input className="rounded-xl border border-slate-300 px-3 py-2" value={guestForm.phone} onChange={(e) => setGuestForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Telefone *" />
                    <input className="rounded-xl border border-slate-300 px-3 py-2" value={guestForm.location} onChange={(e) => setGuestForm((p) => ({ ...p, location: e.target.value }))} placeholder="Localização *" />
                  </div>

                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
              <RecaptchaNotice className="mt-4" />
            </section>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
