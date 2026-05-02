"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiUrl, authFetch } from "@/lib/api";

type ParsedDraft = {
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  professionalTitle?: string;
  summary?: string;
  skills?: string[];
  experience?: unknown[];
  education?: unknown[];
  certifications?: string[];
  portfolioLinks?: string[];
  preferredJobType?: string;
  salaryExpectation?: string;
  availability?: string;
  [key: string]: unknown;
};

type ParseResponse = {
  parseRunId?: string;
  profileDraft?: ParsedDraft;
  missingFields?: string[];
};

type CandidateDocument = {
  _id: string;
  fileName?: string;
  type?: string;
  createdAt?: string;
  signedUrl?: string;
};

type GeneratedCvProfile = {
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

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const TARGET_FIELDS = [
  "Customer Support",
  "IT Helpdesk",
  "Frontend Developer",
  "Administration",
  "Sales",
  "Healthcare",
  "Construction",
  "Hospitality",
];

const toCsv = (value?: string[]) => (Array.isArray(value) ? value.join(", ") : "");
const fromCsv = (value: string) => value.split(",").map((x) => x.trim()).filter(Boolean);

export default function CvDocumentosPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [draft, setDraft] = useState<ParsedDraft | null>(null);
  const [parseRunId, setParseRunId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [documents, setDocuments] = useState<CandidateDocument[]>([]);
  const [profiles, setProfiles] = useState<GeneratedCvProfile[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const [targetField, setTargetField] = useState(TARGET_FIELDS[0]);
  const [jobDescription, setJobDescription] = useState("");
  const [generating, setGenerating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<GeneratedCvProfile | null>(null);

  const latestCv = useMemo(() => documents.find((doc) => doc.type === "cv"), [documents]);

  const loadLists = useCallback(async () => {
    if (!token) return;
    setLoadingLists(true);
    try {
      const [docsData, profilesData] = await Promise.all([
        authFetch<{ documents: CandidateDocument[] }>("/candidates/cv/documents", token),
        authFetch<{ cvProfiles: GeneratedCvProfile[] }>("/candidates/cv-profiles", token),
      ]);
      setDocuments(docsData.documents || []);
      setProfiles(profilesData.cvProfiles || []);
    } catch {
      setError("Erro ao carregar documentos e perfis CV gerados.");
    } finally {
      setLoadingLists(false);
    }
  }, [token]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
  }

  const validateFile = (file: File) => {
    const allowedByMime = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const allowedByExt = /\.(pdf|doc|docx)$/i.test(file.name || "");

    if (!allowedByExt && !allowedByMime.includes(file.type)) {
      return "Formato inválido. Use PDF, DOC ou DOCX.";
    }
    if (file.size > MAX_FILE_BYTES) {
      return "Ficheiro excede o limite de 8MB.";
    }
    return "";
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("cv", file);
      const res = await fetch(apiUrl("/candidates/cv/parse"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao processar CV.");

      const parsed = data as ParseResponse;
      setDraft(parsed.profileDraft || {});
      setParseRunId(parsed.parseRunId || null);
      setMessage("CV processado com sucesso. Reveja e confirme os dados.");
      await loadLists();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleApprove = async () => {
    if (!draft) return;
    setApproving(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/candidates/profile/approve"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ profileDraft: draft, parseRunId, consentGiven: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao guardar perfil.");
      setDraft(null);
      setMessage("Perfil atualizado com sucesso a partir do CV.");
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setApproving(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const data = await authFetch<{ cvProfile: GeneratedCvProfile }>("/candidates/cv-profiles/generate", token!, {
        method: "POST",
        body: JSON.stringify({ targetField, jobDescription }),
      });
      setProfiles((prev) => [data.cvProfile, ...prev]);
      setMessage("Perfil CV específico gerado. Revise antes de usar em candidaturas.");
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao gerar perfil CV específico.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      await authFetch(`/candidates/cv-profiles/${id}`, token!, { method: "DELETE" });
      setProfiles((prev) => prev.filter((item) => item._id !== id));
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao remover perfil gerado.");
    }
  };

  const handleDuplicateProfile = async (id: string) => {
    try {
      const data = await authFetch<{ cvProfile: GeneratedCvProfile }>(`/candidates/cv-profiles/${id}/duplicate`, token!, {
        method: "POST",
      });
      setProfiles((prev) => [data.cvProfile, ...prev]);
      setMessage("Perfil CV duplicado.");
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao duplicar perfil CV.");
    }
  };

  const startEdit = (item: GeneratedCvProfile) => {
    setEditingId(item._id);
    setEditingDraft({ ...item });
  };

  const saveEdit = async () => {
    if (!editingId || !editingDraft) return;
    try {
      const data = await authFetch<{ cvProfile: GeneratedCvProfile }>(`/candidates/cv-profiles/${editingId}`, token!, {
        method: "PATCH",
        body: JSON.stringify(editingDraft),
      });
      setProfiles((prev) => prev.map((item) => (item._id === editingId ? data.cvProfile : item)));
      setEditingId(null);
      setEditingDraft(null);
      setMessage("Perfil CV gerado atualizado.");
    } catch (err: unknown) {
      setError((err as Error).message || "Erro ao atualizar perfil gerado.");
    }
  };

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">CV e Documentos</h1>
        <p className="mt-2 text-slate-600">Carregue CV, aprove dados extraídos e gere perfis específicos por área de emprego.</p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-600">CV principal</p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-900">{latestCv?.fileName || "Sem CV carregado"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-600">Documentos</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{documents.length}</p>
        </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500">CV perfis gerados</p>
            <p className="mt-1 text-2xl font-bold text-slate-800">{profiles.length}</p>
          </div>
        </div>

        <div
          className="cursor-pointer rounded-2xl border-2 border-dashed border-red-200 p-10 text-center transition-colors hover:bg-red-50"
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleUpload} />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
              <p className="font-medium text-red-600">A processar CV...</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-4xl">CV</p>
              <p className="font-semibold text-gray-700">Clique para carregar CV</p>
              <p className="mt-1 text-sm text-gray-400">PDF/DOC/DOCX • max 8 MB</p>
            </>
          )}
        </div>

        {error ? <p className="mt-4 text-red-600">{error}</p> : null}
        {message ? <p className="mt-4 text-green-600">{message}</p> : null}

        {draft ? (
          <div className="mt-8 rounded-2xl border border-gray-100 p-6">
            <h2 className="mb-4 text-xl font-bold">Revisão dos dados extraídos</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Nome</span>
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={String(draft.fullName || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), fullName: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Email</span>
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={String(draft.email || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), email: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Telefone</span>
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={String(draft.phone || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), phone: e.target.value }))} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Título profissional</span>
                <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={String(draft.professionalTitle || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), professionalTitle: e.target.value }))} />
              </label>
            </div>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-gray-600">Resumo</span>
              <textarea className="w-full rounded-xl border border-gray-200 px-3 py-2" rows={4} value={String(draft.summary || "")} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), summary: e.target.value }))} />
            </label>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-gray-600">Skills (vírgula)</span>
              <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={toCsv((draft.skills as string[]) || [])} onChange={(e) => setDraft((prev) => ({ ...(prev || {}), skills: fromCsv(e.target.value) }))} />
            </label>

            <div className="mt-4 flex gap-3">
              <button onClick={handleApprove} disabled={approving} className="rounded-xl bg-red-600 px-6 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {approving ? "A guardar..." : "Confirmar e guardar"}
              </button>
              <button onClick={() => setDraft(null)} className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        <section className="mt-10 rounded-2xl border border-gray-100 p-6">
          <h2 className="text-xl font-bold">Gerar CV por área de emprego</h2>
          <p className="mt-1 text-sm text-gray-500">Gere versões especializadas sem sobrescrever o perfil principal.</p>
          <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleGenerate}>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Área alvo</span>
              <select className="w-full rounded-xl border border-gray-200 px-3 py-2" value={targetField} onChange={(e) => setTargetField(e.target.value)}>
                {TARGET_FIELDS.map((field) => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-gray-600">Descrição da vaga (opcional)</span>
              <textarea rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
            </label>
            <div>
              <button type="submit" disabled={generating} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                {generating ? "A gerar..." : "Gerar perfil CV"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Perfis CV gerados</h2>
          {loadingLists ? <p className="text-sm text-gray-500">A carregar...</p> : null}
          {!loadingLists && profiles.length === 0 ? <p className="text-sm text-gray-500">Ainda não existem perfis CV gerados.</p> : null}
          <div className="space-y-4">
            {profiles.map((item) => {
              const editing = editingId === item._id && editingDraft;
              return (
                <article key={item._id} className="rounded-2xl border border-gray-100 p-4">
                  {!editing ? (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold">{item.label || item.targetField}</p>
                          <p className="text-xs text-gray-500">Área: {item.targetField}</p>
                        </div>
                        <div className="flex gap-2 text-xs">
                          <button className="rounded border px-2 py-1" onClick={() => startEdit(item)}>Editar</button>
                          <button className="rounded border px-2 py-1" onClick={() => handleDuplicateProfile(item._id)}>Duplicar</button>
                          <button className="rounded border px-2 py-1 text-red-600" onClick={() => handleDeleteProfile(item._id)}>Eliminar</button>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-gray-700">{item.professionalSummary || "Sem resumo."}</p>
                      <p className="mt-2 text-xs text-gray-500">Keywords: {(item.suggestedKeywords || []).slice(0, 8).join(", ") || "N/A"}</p>
                    </>
                  ) : (
                    <>
                      <label className="block text-sm">
                        <span className="mb-1 block text-gray-600">Resumo profissional</span>
                        <textarea rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2" value={editingDraft.professionalSummary || ""} onChange={(e) => setEditingDraft({ ...editingDraft, professionalSummary: e.target.value })} />
                      </label>
                      <label className="mt-3 block text-sm">
                        <span className="mb-1 block text-gray-600">Key skills (vírgula)</span>
                        <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={toCsv(editingDraft.keySkills)} onChange={(e) => setEditingDraft({ ...editingDraft, keySkills: fromCsv(e.target.value) })} />
                      </label>
                      <label className="mt-3 block text-sm">
                        <span className="mb-1 block text-gray-600">Suggested keywords (vírgula)</span>
                        <input className="w-full rounded-xl border border-gray-200 px-3 py-2" value={toCsv(editingDraft.suggestedKeywords)} onChange={(e) => setEditingDraft({ ...editingDraft, suggestedKeywords: fromCsv(e.target.value) })} />
                      </label>
                      <label className="mt-3 block text-sm">
                        <span className="mb-1 block text-gray-600">Cover letter draft</span>
                        <textarea rows={4} className="w-full rounded-xl border border-gray-200 px-3 py-2" value={editingDraft.coverLetterDraft || ""} onChange={(e) => setEditingDraft({ ...editingDraft, coverLetterDraft: e.target.value })} />
                      </label>
                      <div className="mt-3 flex gap-2">
                        <button className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white" onClick={saveEdit}>Guardar</button>
                        <button className="rounded border px-3 py-1.5 text-xs" onClick={() => { setEditingId(null); setEditingDraft(null); }}>Cancelar</button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold">Documentos</h2>
          {documents.length === 0 ? <p className="text-sm text-gray-500">Sem documentos carregados.</p> : null}
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc._id} className="flex items-center justify-between rounded-xl border border-gray-100 p-3 text-sm">
                <div>
                  <p className="font-medium">{doc.fileName || "Documento"}</p>
                  <p className="text-xs text-gray-500">{doc.type || "file"} • {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString("pt-AO") : ""}</p>
                </div>
                {doc.signedUrl ? <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="text-red-600 hover:underline">Abrir</a> : null}
              </div>
            ))}
          </div>
        </section>
    </div>
  );
}
