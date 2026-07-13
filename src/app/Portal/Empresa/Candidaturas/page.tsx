"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useApplications } from "@/hooks/useQueries";
import { useDebounce } from "@/hooks/useDebounce";
import { authFetch, authFetchRaw } from "@/lib/api";
import Footer from "@/app/components/Footer";
import DecisionDashboard from "@/app/Portal/components/DecisionDashboard";
import InsightsToolbar from "@/app/Portal/components/InsightsToolbar";
import StickyPortalHeading from "@/app/Portal/components/StickyPortalHeading";
import { useToasts } from "../components/useToasts";

const CompanySidebar = dynamic(() => import("../components/CompanySidebar"), {
  ssr: false,
  loading: () => <div className="h-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" />,
});

type Application = {
  _id: string;
  status: string;
  candidateUserId?: string;
  profileSnapshot?: { fullName?: string; email?: string; skills?: string[] };
  jobId?: { title?: string } | null;
  createdAt?: string;
};

type CandidateCvPayload = {
  candidate: {
    fullName?: string;
    email?: string;
    location?: string;
    professionalTitle?: string;
    summary?: string;
    skills?: string[];
  };
  documents: Array<{
    _id: string;
    fileName?: string;
    signedUrl?: string;
    mimeType?: string;
    createdAt?: string;
    isNativeResume?: boolean;
  }>;
};

const hiringStatuses = ["under_review", "viewed", "shortlisted", "interview", "offer", "rejected", "hired"];
const ITEMS_PER_PAGE = 5;
const statusLabel: Record<string, string> = {
  submitted: "Submetida", under_review: "Em revisão", viewed: "Visualizada", shortlisted: "Em análise",
  interview: "Entrevista", offer: "Oferta", rejected: "Rejeitada", hired: "Contratado/a", withdrawn: "Retirada",
};

export default function EmpresaCandidaturasPage() {
  const { token, loading } = useAuth("company");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activePreset, setActivePreset] = useState("overview");
  const [updating, setUpdating] = useState<string | null>(null);
  const [cvLoadingFor, setCvLoadingFor] = useState<string | null>(null);
  const [selectedCv, setSelectedCv] = useState<CandidateCvPayload | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [resumeDownloading, setResumeDownloading] = useState(false);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [notes, setNotes] = useState<Array<{ _id: string; body?: string; rating?: number | null; createdAt?: string }>>([]);
  const [noteBody, setNoteBody] = useState("");
  const [noteRating, setNoteRating] = useState(0);
  const [notesLoading, setNotesLoading] = useState(false);

  const toggleNotes = async (id: string) => {
    if (notesFor === id) { setNotesFor(null); return; }
    setNotesFor(id);
    setNotes([]);
    setNoteBody("");
    setNoteRating(0);
    setNotesLoading(true);
    try {
      const data = await authFetch<{ notes: typeof notes }>(`/applications/${id}/notes`, token!, { suppressGlobalErrors: true });
      setNotes(data.notes || []);
    } catch { /* ignore */ } finally { setNotesLoading(false); }
  };

  const addNote = async (id: string) => {
    if (!noteBody.trim() && !noteRating) return;
    try {
      const data = await authFetch<{ note: { _id: string; body?: string; rating?: number | null; createdAt?: string } }>(
        `/applications/${id}/notes`, token!,
        { method: "POST", body: JSON.stringify({ body: noteBody.trim(), rating: noteRating || null }), suppressGlobalErrors: true }
      );
      setNotes((prev) => [data.note, ...prev]);
      setNoteBody("");
      setNoteRating(0);
    } catch { /* ignore */ }
  };
  const { pushToast } = useToasts();

  // Debounce search query to avoid API calls on every keystroke
  const debouncedQuery = useDebounce(query, 400);

  // Fetch applications with pagination using TanStack Query
  const { data: applicationsData, isLoading, error, refetch } = useApplications(token, page, 20);
  
  const applications = useMemo(() => applicationsData?.applications || [], [applicationsData]);
  const totalRecords = applicationsData?.total || 0;
  const totalPages = applicationsData?.totalPages || 1;

  // Show error toast if fetch fails (429 or other errors)
  useEffect(() => {
    if (error) {
      const errorMessage = (error as Error).message || "Erro ao carregar candidaturas.";
      pushToast("error", errorMessage);
    }
  }, [error, pushToast]);

  const dashboard = useMemo(() => {
    const total = applications.length;
    const submitted = applications.filter((item) => item.status === "submitted").length;
    const inReview = applications.filter((item) => item.status === "viewed" || item.status === "shortlisted").length;
    const interview = applications.filter((item) => item.status === "interview").length;
    const hired = applications.filter((item) => item.status === "hired").length;
    const rejected = applications.filter((item) => item.status === "rejected").length;

    return {
      total: totalRecords,
      submitted,
      inReview,
      interview,
      hired,
      rejected,
      conversionRate: totalRecords > 0 ? Math.round((hired / totalRecords) * 100) : 0,
      rejectionRate: totalRecords > 0 ? Math.round((rejected / totalRecords) * 100) : 0,
    };
  }, [applications, totalRecords]);

  const filteredApplications = useMemo(() => {
    const normalized = debouncedQuery.trim().toLowerCase();
    return applications.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!normalized) return true;

      const candidate = (item.profileSnapshot?.fullName || "").toLowerCase();
      const email = (item.profileSnapshot?.email || "").toLowerCase();
      const jobTitle = (item.jobId && typeof item.jobId === "object" ? item.jobId.title : "")?.toLowerCase() || "";
      return candidate.includes(normalized) || email.includes(normalized) || jobTitle.includes(normalized);
    });
  }, [applications, debouncedQuery, statusFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, statusFilter]);

  if (loading || isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" /></div>;

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    try {
      await authFetch(`/applications/${id}/status`, token!, { method: "PATCH", body: JSON.stringify({ status }) });
      pushToast("success", "Estado da candidatura atualizado.");
      refetch();
    } catch (err: unknown) {
      pushToast("error", (err as Error).message || "Erro ao actualizar candidatura.");
    } finally {
      setUpdating(null);
    }
  };

  const viewCandidateCv = async (applicationId: string) => {
    setCvLoadingFor(applicationId);
    try {
      const payload = await authFetch<CandidateCvPayload>(`/applications/${applicationId}/candidate-cv`, token!);
      setSelectedCv(payload);
      setSelectedApplicationId(applicationId);
    } catch (err: unknown) {
      pushToast("error", (err as Error).message || "Erro ao carregar CV do candidato.");
    } finally {
      setCvLoadingFor(null);
    }
  };

  const downloadResumeCv = async () => {
    if (!selectedApplicationId || resumeDownloading) return;
    setResumeDownloading(true);
    try {
      const res = await authFetchRaw(`/applications/${selectedApplicationId}/resume-cv`, token!);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "cv.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(href);
    } catch (err: unknown) {
      pushToast("error", (err as Error).message || "Erro ao descarregar CV.");
    } finally {
      setResumeDownloading(false);
    }
  };

  const applyPreset = (presetKey: string) => {
    setActivePreset(presetKey);
    if (presetKey === "overview") {
      setQuery("");
      setStatusFilter("all");
      return;
    }
    if (presetKey === "interviews") {
      setQuery("");
      setStatusFilter("interview");
      return;
    }
    if (presetKey === "triage") {
      setQuery("");
      setStatusFilter("submitted");
      return;
    }
    if (presetKey === "hired") {
      setQuery("");
      setStatusFilter("hired");
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="pt-8 px-6 pb-24 lg:pb-16 max-w-7xl mx-auto">
        <div className="grid gap-6 lg:grid-cols-[260px,1fr] lg:items-start">
          <CompanySidebar />

          <section>
            <StickyPortalHeading
              title="Candidaturas Recebidas"
              subtitle="Acompanhe o funil e tome decisoes de recrutamento mais rapidamente."
              meta={`${filteredApplications.length} de ${totalRecords} candidatura${totalRecords !== 1 ? "s" : ""}`}
              topClassName="top-4"
            />

            <DecisionDashboard
              className="mb-6"
              title="Dashboard de decisao"
              subtitle="Indicadores para priorizar pipeline, entrevistas e contratacoes."
              badge={`Conversao: ${dashboard.conversionRate}%`}
              metrics={[
                { label: "Total", value: dashboard.total },
                { label: "Novas/Submetidas", value: dashboard.submitted },
                { label: "Em revisao", value: dashboard.inReview },
                { label: "Entrevistas", value: dashboard.interview },
              ]}
              reportLines={[
                `Contratacoes: ${dashboard.hired} (${dashboard.conversionRate}%)`,
                `Rejeicoes: ${dashboard.rejected} (${dashboard.rejectionRate}%)`,
              ]}
              actionLines={[
                dashboard.submitted > 0 ? `Revise ${dashboard.submitted} candidaturas novas hoje.` : "Sem candidaturas novas pendentes de triagem.",
                dashboard.interview > 0 ? `Agende proximos passos para ${dashboard.interview} perfis em entrevista.` : "Ainda sem entrevistas ativas.",
                dashboard.conversionRate < 15 ? "Considere ajustar requisitos da vaga para aumentar conversao." : "Conversao saudavel do pipeline atual.",
              ]}
            />

            <InsightsToolbar
              query={query}
              onQueryChange={(next) => {
                setQuery(next);
                setActivePreset("custom");
              }}
              placeholder="Pesquisar por candidato, email ou vaga"
              selectedFilter={statusFilter}
              onFilterChange={(next) => {
                setStatusFilter(next);
                setActivePreset("custom");
              }}
              resultLabel={`${filteredApplications.length} resultados`}
              activePreset={activePreset}
              onPresetSelect={applyPreset}
              presets={[
                { key: "overview", label: "Visao geral", description: "Todas as candidaturas" },
                { key: "interviews", label: "Entrevistas", description: "Apenas candidaturas em entrevista" },
                { key: "triage", label: "Triagem inicial", description: "Submetidas por analisar" },
                { key: "hired", label: "Contratadas", description: "Fechadas com contratacao" },
              ]}
              filters={[
                { key: "all", label: "Todas", count: applications.length },
                { key: "submitted", label: "Submetidas", count: applications.filter((item) => item.status === "submitted").length },
                { key: "shortlisted", label: "Em analise", count: applications.filter((item) => item.status === "shortlisted").length },
                { key: "interview", label: "Entrevista", count: applications.filter((item) => item.status === "interview").length },
                { key: "hired", label: "Contratadas", count: applications.filter((item) => item.status === "hired").length },
              ]}
            />

            {filteredApplications.length === 0 && !isLoading && <p className="text-gray-500 text-center py-12">Nenhuma candidatura encontrada para os filtros atuais.</p>}
            <div className="space-y-4">
              {filteredApplications.map(a => {
                const name = a.profileSnapshot?.fullName ?? "Candidato";
                const email = a.profileSnapshot?.email ?? "";
                const jobTitle = a.jobId && typeof a.jobId === "object" ? a.jobId.title : "";
                return (
                  <div key={a._id} className="border border-gray-100 rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-700 font-bold text-sm shrink-0">{name.slice(0, 2).toUpperCase()}</div>
                          <div>
                            <p className="font-bold">{name}</p>
                            <p className="text-xs text-gray-500">{email}</p>
                          </div>
                        </div>
                        {jobTitle && <p className="text-sm text-gray-500 mt-2">Para: <strong>{jobTitle}</strong></p>}
                        {a.profileSnapshot?.skills && a.profileSnapshot.skills.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {a.profileSnapshot.skills.slice(0, 4).map(s => <span key={s} className="text-xs border rounded px-2 py-0.5 text-gray-600">{s}</span>)}
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => viewCandidateCv(a._id)}
                            disabled={cvLoadingFor === a._id}
                            className="app-action app-action-neutral disabled:opacity-50"
                          >
                            {cvLoadingFor === a._id ? "A abrir CV..." : "Ver CV"}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleNotes(a._id)}
                            className="app-action app-action-neutral"
                          >
                            {notesFor === a._id ? "Ocultar notas" : "Notas & avaliação"}
                          </button>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <select
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                          value={a.status}
                          disabled={updating === a._id || a.status === "withdrawn"}
                          onChange={e => updateStatus(a._id, e.target.value)}
                        >
                          {hiringStatuses.map(s => <option key={s} value={s}>{statusLabel[s]}</option>)}
                          {a.status === "submitted" && <option value="submitted">Submetida</option>}
                          {a.status === "withdrawn" && <option value="withdrawn">Retirada</option>}
                        </select>
                        {a.createdAt && <p className="text-xs text-gray-500 mt-1">{new Date(a.createdAt).toLocaleDateString("pt-AO")}</p>}
                      </div>
                    </div>

                    {notesFor === a._id && (
                      <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-muted)] p-4 pv-animate-fade">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-1" role="radiogroup" aria-label="Avaliação">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button key={n} type="button" onClick={() => setNoteRating(n)} aria-label={`${n} estrelas`}
                                className={`text-lg leading-none ${n <= noteRating ? "text-amber-500" : "text-slate-300"}`}>★</button>
                            ))}
                          </div>
                          <input
                            className="app-input flex-1 min-w-[180px]"
                            placeholder="Adicionar nota interna sobre o candidato..."
                            value={noteBody}
                            onChange={(e) => setNoteBody(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") addNote(a._id); }}
                          />
                          <button type="button" onClick={() => addNote(a._id)} className="app-btn-primary px-4 py-2 text-sm">Guardar</button>
                        </div>
                        <div className="mt-3 space-y-2">
                          {notesLoading ? (
                            <p className="text-xs text-[var(--text-subtle)]">A carregar notas...</p>
                          ) : notes.length === 0 ? (
                            <p className="text-xs text-[var(--text-subtle)]">Ainda sem notas para este candidato.</p>
                          ) : notes.map((n) => (
                            <div key={n._id} className="rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-amber-500 text-sm">{n.rating ? "★".repeat(n.rating) : ""}</span>
                                <span className="text-xs text-[var(--text-subtle)]">{n.createdAt ? new Date(n.createdAt).toLocaleDateString("pt-PT") : ""}</span>
                              </div>
                              {n.body && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{n.body}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="text-sm text-slate-600">Pagina {page} de {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  className="rounded-xl border px-4 py-2 text-sm disabled:opacity-40"
                >
                  Seguinte
                </button>
              </div>
            )}

            {selectedCv ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
                <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-5">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">CV do candidato</h3>
                      <p className="text-sm text-slate-600">{selectedCv.candidate?.fullName || "Candidato"} · {selectedCv.candidate?.email || "sem email"}</p>
                    </div>
                    <button type="button" onClick={() => { setSelectedCv(null); setSelectedApplicationId(null); }} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">Fechar</button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs uppercase text-slate-500">Localização</p>
                      <p className="text-sm font-medium text-slate-800">{selectedCv.candidate?.location || "--"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs uppercase text-slate-500">Título</p>
                      <p className="text-sm font-medium text-slate-800">{selectedCv.candidate?.professionalTitle || "--"}</p>
                    </div>
                  </div>

                  {selectedCv.candidate?.summary ? (
                    <div className="mt-4 rounded-xl border border-slate-200 p-3">
                      <p className="text-xs uppercase text-slate-500">Resumo</p>
                      <p className="mt-1 text-sm text-slate-700">{selectedCv.candidate.summary}</p>
                    </div>
                  ) : null}

                  {Array.isArray(selectedCv.candidate?.skills) && selectedCv.candidate.skills.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedCv.candidate.skills.map((skill) => (
                        <span key={skill} className="rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700">{skill}</span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-5 space-y-2">
                    <p className="text-sm font-semibold text-slate-800">Documentos</p>
                    {selectedCv.documents.length === 0 ? (
                      <p className="text-sm text-slate-500">Sem CV disponível para este candidato.</p>
                    ) : (
                      selectedCv.documents.map((doc) => (
                        <div key={doc._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5 text-sm">
                          <span className="text-slate-700">
                            {doc.fileName || "Documento"}
                            {doc.isNativeResume && <span className="ml-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">Construtor de CV</span>}
                          </span>
                          {doc.isNativeResume ? (
                            <button
                              type="button"
                              onClick={downloadResumeCv}
                              disabled={resumeDownloading}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              {resumeDownloading ? "A descarregar…" : "Descarregar"}
                            </button>
                          ) : doc.signedUrl ? (
                            <a href={doc.signedUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">
                              Abrir
                            </a>
                          ) : (
                            <span className="text-xs text-slate-500">Indisponível</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
