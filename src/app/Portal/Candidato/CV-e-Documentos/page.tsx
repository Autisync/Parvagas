"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, authFetchRaw } from "@/lib/api";
import { PlusIcon, DocumentTextIcon } from "@heroicons/react/24/outline";
import PageHeader from "@/app/components/PageHeader";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { useAppNotifier } from "@/app/components/AppNotifier";
import { normalizeParsedCvProfile } from "@/lib/cvProfile";

import PlanBanner from "./components/PlanBanner";
import UploadCard from "./components/UploadCard";
import DocumentToolsPanel from "./components/DocumentToolsPanel";
import AutoApplyPanel from "./components/AutoApplyPanel";
import ParsedFieldsForm from "./components/ParsedFieldsForm";
import GeneratedProfilesSection from "./components/GeneratedProfilesSection";
import DocumentsList from "./components/DocumentsList";
import { CV_DRAFT_SESSION_KEY, MAX_FILE_BYTES, PARSE_POLL_INTERVAL_MS, PARSE_POLL_TIMEOUT_MS, TARGET_FIELDS } from "./components/constants";
import { getApiErrorMessage } from "./components/utils";
import type { AutoApplyProposal, CandidateDocument, GeneratedCvProfile, ParsedDraft, ParseResponse, PageFeedback } from "./components/types";

export default function CvDocumentosPage() {
  const { token, loading } = useAuth("candidate", { allowAdmin: false });
  const router = useRouter();
  const { notify } = useAppNotifier();
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<PageFeedback | null>(null);
  const [approving, setApproving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [draft, setDraft] = useState<ParsedDraft | null>(null);
  const [missingSections, setMissingSections] = useState<string[]>([]);
  const [parseWarning, setParseWarning] = useState("");
  const [parseRunId, setParseRunId] = useState<string | null>(null);
  const [cvMappedFields, setCvMappedFields] = useState<string[]>([]);
  const [lowConfidenceFields, setLowConfidenceFields] = useState<string[]>([]);

  const [documents, setDocuments] = useState<CandidateDocument[]>([]);
  const [profiles, setProfiles] = useState<GeneratedCvProfile[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [listError, setListError] = useState("");

  const [targetField, setTargetField] = useState(TARGET_FIELDS[0]);
  const [jobDescription, setJobDescription] = useState("");
  const [generating, setGenerating] = useState(false);

  const [exporting, setExporting] = useState<string | null>(null);
  const [targetJobId, setTargetJobId] = useState("");
  const [savedJobOptions, setSavedJobOptions] = useState<{ id: string; title: string }[]>([]);

  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [autoApplyOptIn, setAutoApplyOptIn] = useState(false);
  const [savingAutoApply, setSavingAutoApply] = useState(false);

  const [proposals, setProposals] = useState<AutoApplyProposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // Own profile values (already typed once) get surfaced first in the TagInput
  // suggestion catalogs — see suggestionCatalogs.withOwnValues.
  const [existingSkills, setExistingSkills] = useState<string[]>([]);
  const [existingLanguages, setExistingLanguages] = useState<string[]>([]);
  const [existingCertifications, setExistingCertifications] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<GeneratedCvProfile | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [duplicatingProfileId, setDuplicatingProfileId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);

  const loadProposals = useCallback(async () => {
    if (!token) return;
    setLoadingProposals(true);
    try {
      const data = await authFetch<{ proposals: AutoApplyProposal[] }>("/candidates/auto-apply/proposals?status=pending", token);
      setProposals(data.proposals || []);
    } catch {
      // Non-critical — the rest of the page still works without this list.
    } finally {
      setLoadingProposals(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    authFetch<{
      profile: {
        preferredJobCategories?: string[];
        autoApplyOptIn?: boolean;
        skills?: string[];
        languages?: string[];
        certifications?: string[];
      };
    }>("/candidates/profile", token)
      .then((d) => {
        setPreferredCategories(d.profile?.preferredJobCategories || []);
        setAutoApplyOptIn(Boolean(d.profile?.autoApplyOptIn));
        setExistingSkills(d.profile?.skills || []);
        setExistingLanguages(d.profile?.languages || []);
        setExistingCertifications(d.profile?.certifications || []);
      })
      .catch(() => {});
    loadProposals();
    authFetch<{ jobs: { job?: { _id: string; title?: string } }[] }>("/candidates/jobs/saved?page=1&limit=20", token)
      .then((d) => {
        const options = (d.jobs || [])
          .filter((item): item is { job: { _id: string; title?: string } } => Boolean(item.job?._id))
          .map((item) => ({ id: item.job._id, title: item.job.title || "Vaga" }));
        setSavedJobOptions(options);
      })
      .catch(() => {});
  }, [token, loadProposals]);

  const toggleCategory = (category: string) => {
    setPreferredCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const saveAutoApplyPrefs = async (nextCategories: string[], nextOptIn: boolean) => {
    setSavingAutoApply(true);
    try {
      await authFetch("/candidates/profile", token!, {
        method: "PATCH",
        body: JSON.stringify({ preferredJobCategories: nextCategories, autoApplyOptIn: nextOptIn }),
      });
      notify("Preferências de área guardadas.", "success");
    } catch (err: unknown) {
      notify((err as Error).message || "Não foi possível guardar as preferências de área.", "error");
    } finally {
      setSavingAutoApply(false);
    }
  };

  const reviewProposal = async (proposalId: string, action: "approve" | "dismiss") => {
    setReviewingId(proposalId);
    try {
      await authFetch(`/candidates/auto-apply/proposals/${proposalId}/${action}`, token!, { method: "POST" });
      setProposals((prev) => prev.filter((p) => p._id !== proposalId));
      notify(action === "approve" ? "Candidatura submetida com sucesso." : "Sugestão dispensada.", "success");
    } catch (err: unknown) {
      notify((err as Error).message || "Não foi possível rever a sugestão.", "error");
    } finally {
      setReviewingId(null);
    }
  };

  const openCvBuilder = () => {
    router.push("/Portal/Candidato/Construtor-CV");
  };

  const handleExport = async (format: "pdf" | "docx" | "json") => {
    if (!token) return;
    setExporting(format);
    try {
      const jobParam = targetJobId ? `&targetJobId=${encodeURIComponent(targetJobId)}` : "";
      const res = await authFetchRaw(`/candidates/cv/export?format=${format}${jobParam}`, token);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail || "Não foi possível exportar o CV.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cv.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      notify((err as Error).message || "Não foi possível exportar o CV.", "error");
    } finally {
      setExporting(null);
    }
  };

  const latestCv = useMemo(() => documents.find((doc) => doc.type === "cv"), [documents]);

  const loadLists = useCallback(async () => {
    if (!token) return;
    setLoadingLists(true);
    setListError("");
    try {
      const [docsData, profilesData] = await Promise.all([
        authFetch<{ documents: CandidateDocument[] }>("/candidates/cv/documents", token),
        authFetch<{ cvProfiles: GeneratedCvProfile[] }>("/candidates/cv-profiles", token),
      ]);
      setDocuments(docsData.documents || []);
      setProfiles(profilesData.cvProfiles || []);
    } catch {
      setListError("Não foi possível carregar os documentos e perfis CV gerados.");
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
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/tiff",
      "image/bmp",
    ];
    const allowedByExt = /\.(pdf|doc|docx|png|jpe?g|webp|tiff?|bmp)$/i.test(file.name || "");

    if (!allowedByExt && !allowedByMime.includes(file.type)) {
      return "Formato inválido. Use PDF, DOC, DOCX ou imagem (PNG/JPG).";
    }
    if (file.size > MAX_FILE_BYTES) {
      return "O ficheiro excede o limite de 5 MB.";
    }
    return "";
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setUploadFeedback({ variant: "error", message: validationError });
      return;
    }

    setUploading(true);
    setUploadFeedback(null);
    try {
      const form = new FormData();
      form.append("cv", file);
      const res = await authFetchRaw("/candidates/cv/parse", token!, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as ParseResponse;
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Não foi possível processar o CV."));

      const parseRunId = data.parseRunId;
      if (!parseRunId) throw new Error("Não foi possível iniciar o processamento do CV.");

      let parsed = data;
      const startedAt = Date.now();
      while (!["completed", "failed"].includes(String(parsed.status || "").toLowerCase())) {
        if (Date.now() - startedAt > PARSE_POLL_TIMEOUT_MS) {
          throw new Error("O CV está a ser processado em segundo plano. Recarregue a página em instantes para ver os dados.");
        }
        await new Promise((resolve) => setTimeout(resolve, PARSE_POLL_INTERVAL_MS));
        parsed = await authFetch<ParseResponse>(`/candidates/cv/parse/${parseRunId}`, token!, {
          suppressGlobalErrors: true,
        });
      }

      if (String(parsed.status || "").toLowerCase() === "failed") {
        throw new Error(parsed.parserError || "Não foi possível processar o CV.");
      }

      const nextDraft = normalizeParsedCvProfile((parsed.parsedProfile || parsed.profileDraft || {}) as Record<string, unknown>);
      setDraft(nextDraft);
      setParseRunId(parseRunId);
      setMissingSections(parsed.missingFields || []);
      setParseWarning(parsed.parserError || "");
      const mappedFields = Object.entries(nextDraft)
        .filter(([, value]) => {
          if (Array.isArray(value)) return value.length > 0;
          return value !== null && value !== undefined && String(value).trim() !== "";
        })
        .map(([key]) => key);
      setCvMappedFields(mappedFields);

      const nextLowConfidence = Object.entries(parsed.confidence || {})
        .filter(([, score]) => Number(score) > 0 && Number(score) < 0.75)
        .map(([key]) => key)
        .flatMap((key) => {
          if (key === "fullName") return ["fullName"];
          if (key === "email") return ["email"];
          if (key === "phone") return ["phone"];
          if (key === "skills") return ["skills"];
          return [key];
        });
      setLowConfidenceFields(Array.from(new Set(nextLowConfidence)));

      if (process.env.NODE_ENV !== "production") {
        console.info("[cv-parse] frontend received parsed fields", {
          parseRunId: parsed.parseRunId,
          mappedFields,
        });
      }

      setUploadFeedback({ variant: "success", message: "Encontrámos informação no seu CV. Reveja e confirme antes de guardar." });
      setUploadDone(true);
      // Persist draft in sessionStorage so Meu-Perfil can show the AI suggestion banner
      try {
        sessionStorage.setItem(
          CV_DRAFT_SESSION_KEY,
          JSON.stringify({
            draft: nextDraft,
            lowConfidenceFields: Array.from(new Set(nextLowConfidence)),
          })
        );
      } catch { /* ignore */ }
      await loadLists();
    } catch (err: unknown) {
      setUploadDone(false);
      setUploadFeedback({ variant: "error", message: (err as Error).message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleApprove = async () => {
    if (!draft) return;
    setApproving(true);
    setSaveError("");
    try {
      const res = await authFetchRaw("/candidates/profile/approve", token!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileDraft: draft, parseRunId, consentGiven: true, cvWarnings: lowConfidenceFields }),
      });
      const data = (await res.json().catch(() => ({}))) as ParseResponse;
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Não foi possível guardar o perfil."));
      setDraft(null);
      setMissingSections([]);
      setParseWarning("");
      setUploadFeedback(null);
      notify("Perfil atualizado com sucesso a partir do CV.", "success");
    } catch (err: unknown) {
      setSaveError((err as Error).message);
    } finally {
      setApproving(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const data = await authFetch<{ cvProfile: GeneratedCvProfile }>("/candidates/cv-profiles/generate", token!, {
        method: "POST",
        body: JSON.stringify({ targetField, jobDescription }),
      });
      setProfiles((prev) => [data.cvProfile, ...prev]);
      notify("Perfil CV específico gerado. Reveja-o antes de o usar em candidaturas.", "success");
    } catch (err: unknown) {
      notify((err as Error).message || "Não foi possível gerar o perfil CV.", "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!window.confirm("Eliminar este perfil CV gerado? Esta ação não pode ser desfeita.")) return;
    setDeletingProfileId(id);
    try {
      await authFetch(`/candidates/cv-profiles/${id}`, token!, { method: "DELETE" });
      setProfiles((prev) => prev.filter((item) => item._id !== id));
      notify("Perfil CV removido.", "success");
    } catch (err: unknown) {
      notify((err as Error).message || "Não foi possível remover o perfil gerado.", "error");
    } finally {
      setDeletingProfileId(null);
    }
  };

  const handleDuplicateProfile = async (id: string) => {
    setDuplicatingProfileId(id);
    try {
      const data = await authFetch<{ cvProfile: GeneratedCvProfile }>(`/candidates/cv-profiles/${id}/duplicate`, token!, {
        method: "POST",
      });
      setProfiles((prev) => [data.cvProfile, ...prev]);
      notify("Perfil CV duplicado.", "success");
    } catch (err: unknown) {
      notify((err as Error).message || "Não foi possível duplicar o perfil CV.", "error");
    } finally {
      setDuplicatingProfileId(null);
    }
  };

  const startEdit = (item: GeneratedCvProfile) => {
    setEditingId(item._id);
    setEditingDraft({ ...item });
  };

  const saveEdit = async () => {
    if (!editingId || !editingDraft) return;
    setSavingEdit(true);
    try {
      const data = await authFetch<{ cvProfile: GeneratedCvProfile }>(`/candidates/cv-profiles/${editingId}`, token!, {
        method: "PATCH",
        body: JSON.stringify(editingDraft),
      });
      setProfiles((prev) => prev.map((item) => (item._id === editingId ? data.cvProfile : item)));
      setEditingId(null);
      setEditingDraft(null);
      notify("Perfil CV gerado atualizado.", "success");
    } catch (err: unknown) {
      notify((err as Error).message || "Não foi possível atualizar o perfil gerado.", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleDocSelected = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllDocs = () => {
    setSelectedDocIds((prev) => (prev.size === documents.length ? new Set() : new Set(documents.map((d) => d._id))));
  };

  const performDeleteDocuments = async (ids: string[]) => {
    if (!token || ids.length === 0) return;
    setDeletingBatch(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => authFetch(`/candidates/cv/documents/${id}`, token, { method: "DELETE" }))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      setSelectedDocIds(new Set());
      setConfirmDeleteIds(null);
      await loadLists();
      if (failed > 0) {
        notify(`Não foi possível remover ${failed} de ${ids.length} documento(s). Tente novamente.`, "error");
      } else {
        notify(ids.length > 1 ? `${ids.length} documentos removidos com sucesso.` : "Documento removido com sucesso.", "success");
      }
    } catch (err: unknown) {
      notify((err as Error).message || "Não foi possível remover o(s) documento(s).", "error");
    } finally {
      setDeletingBatch(false);
    }
  };

  const confirmDocNames = confirmDeleteIds
    ? documents.filter((d) => confirmDeleteIds.includes(d._id)).map((d) => d.fileName || "Documento")
    : [];

  return (
    <div className="p-6 sm:p-8">
      <PageHeader
        title="CV e Documentos"
        description="Carregue o seu CV, confirme os dados extraídos e gere versões específicas por área de emprego."
        action={
          <button
            type="button"
            onClick={openCvBuilder}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-red-700 transition-colors"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Construtor de CV
          </button>
        }
      />

      <PlanBanner token={token} />

      {listError ? (
        <div className="mb-6">
          <InlineErrorState title="Não foi possível carregar esta secção" message={listError} actionLabel="Tentar novamente" onAction={loadLists} />
        </div>
      ) : null}

      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <DocumentTextIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">CV principal</p>
            <p className="truncate text-sm font-semibold text-slate-900">{latestCv?.fileName || "Sem CV carregado"}</p>
          </div>
        </div>
        <div className="flex items-center gap-6 sm:border-l sm:border-slate-200 sm:pl-6">
          <div>
            <p className="text-xs font-medium text-slate-500">Documentos</p>
            <p className="text-lg font-semibold text-slate-900">{documents.length}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">CV perfis gerados</p>
            <p className="text-lg font-semibold text-slate-900">{profiles.length}</p>
          </div>
        </div>
      </div>

      <AutoApplyPanel
        preferredCategories={preferredCategories}
        autoApplyOptIn={autoApplyOptIn}
        savingAutoApply={savingAutoApply}
        onToggleCategory={toggleCategory}
        onToggleOptIn={() => {
          const next = !autoApplyOptIn;
          setAutoApplyOptIn(next);
          saveAutoApplyPrefs(preferredCategories, next);
        }}
        onSavePrefs={() => saveAutoApplyPrefs(preferredCategories, autoApplyOptIn)}
        proposals={proposals}
        loadingProposals={loadingProposals}
        reviewingId={reviewingId}
        onReviewProposal={reviewProposal}
      />

      <UploadCard
        inputRef={inputRef}
        uploading={uploading}
        uploadDone={uploadDone}
        feedback={uploadFeedback}
        onDismissFeedback={() => setUploadFeedback(null)}
        onUpload={handleUpload}
      />

      <DocumentToolsPanel
        targetJobId={targetJobId}
        onTargetJobChange={setTargetJobId}
        savedJobOptions={savedJobOptions}
        exporting={exporting}
        onExport={handleExport}
      />

      {draft ? (
        <ParsedFieldsForm
          draft={draft}
          setDraft={setDraft}
          missingSections={missingSections}
          parseWarning={parseWarning}
          lowConfidenceFields={lowConfidenceFields}
          cvMappedFields={cvMappedFields}
          approving={approving}
          onApprove={handleApprove}
          onCancel={() => {
            setDraft(null);
            setMissingSections([]);
            setParseWarning("");
            setSaveError("");
          }}
          existingSkills={existingSkills}
          existingLanguages={existingLanguages}
          existingCertifications={existingCertifications}
          saveError={saveError}
          onDismissSaveError={() => setSaveError("")}
        />
      ) : null}

      <GeneratedProfilesSection
        targetField={targetField}
        onTargetFieldChange={setTargetField}
        jobDescription={jobDescription}
        onJobDescriptionChange={setJobDescription}
        generating={generating}
        onGenerate={handleGenerate}
        profiles={profiles}
        loadingLists={loadingLists}
        editingId={editingId}
        editingDraft={editingDraft}
        onStartEdit={startEdit}
        onEditDraftChange={setEditingDraft}
        onCancelEdit={() => { setEditingId(null); setEditingDraft(null); }}
        onSaveEdit={saveEdit}
        savingEdit={savingEdit}
        onDuplicate={handleDuplicateProfile}
        duplicatingId={duplicatingProfileId}
        onDelete={handleDeleteProfile}
        deletingId={deletingProfileId}
      />

      <DocumentsList
        documents={documents}
        selectedDocIds={selectedDocIds}
        onToggleDoc={toggleDocSelected}
        onToggleSelectAll={toggleSelectAllDocs}
        onRequestDelete={setConfirmDeleteIds}
        confirmDeleteIds={confirmDeleteIds}
        confirmDocNames={confirmDocNames}
        deletingBatch={deletingBatch}
        onCancelDelete={() => setConfirmDeleteIds(null)}
        onConfirmDelete={() => performDeleteDocuments(confirmDeleteIds || [])}
      />
    </div>
  );
}
