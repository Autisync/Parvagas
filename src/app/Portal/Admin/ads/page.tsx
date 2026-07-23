"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AdminLoadingLabel } from "../components/AdminUI";
import {
  AdminPermissions,
  createAdminAd,
  deleteAdminAd,
  fetchAdminAds,
  fetchAdminMe,
  flagAdminAd,
  hasPermission,
  pauseAdminAd,
  replaceAdminAd,
  setAdminAdStatus,
  statusBadgeClass,
  toDateLabel,
  unflagAdminAd,
  uploadAdminAdImage,
  type AdCampaignRecord,
  type AdminMe,
} from "../adminClient";
import { AdminModal, AdminPageHeader, AdminRestricted, adminButtonClass, adminFieldClass, adminSecondaryButtonClass } from "../components/AdminUI";
import FormFieldError from "@/app/components/errors/FormFieldError";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { useAppNotifier } from "@/app/components/AppNotifier";

const emptyForm = {
  title: "",
  placement: "homepage_banner",
  link: "",
  imageUrl: "",
  startDate: "",
  endDate: "",
  budget: 0,
  costPerClick: 0,
  costPerImpression: 0,
  targetCategory: "",
  targetLocation: "",
  active: true,
};

type AdFormState = typeof emptyForm;
type AdFormErrors = Partial<Record<keyof AdFormState, string>>;

function validateAdForm(values: AdFormState): AdFormErrors {
  const errors: AdFormErrors = {};

  // Only title + placement are required — matches the backend's
  // admin_create_ad, which accepts link/dates as optional. Link and dates
  // are validated for shape only when the admin actually provides them.
  if (!values.title.trim()) errors.title = "Indique o título do anúncio.";
  if (!values.placement.trim()) errors.placement = "Selecione o placement do anúncio.";

  if (values.link.trim()) {
    try {
      const url = new URL(values.link);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.link = "Use um URL completo começando por http:// ou https://.";
      }
    } catch {
      errors.link = "Use um URL válido para o destino do anúncio.";
    }
  }

  // Uses >=, not >, to mirror the backend's _validate_ad_fields, which
  // rejects end_date <= start_date (equal dates aren't a valid window).
  if (values.startDate && values.endDate && values.startDate >= values.endDate) {
    errors.endDate = "A data de fim deve ser posterior à data de início.";
  }

  return errors;
}

const PLACEMENT_LABELS: Record<string, string> = {
  homepage_banner: "Banner da Homepage",
  job_list: "Listagem de Vagas",
  sidebar: "Barra lateral (detalhe da vaga)",
};

/** Label + helper text wrapper — every campaign field explains itself. */
function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {error ? <FormFieldError id={`ad-${label}-error`} message={error} /> : null}
    </div>
  );
}

/** Faithful miniature of SponsoredAdSlot (the public renderer) so the admin
 * sees the creative exactly as visitors will, sized per placement. */
function AdCreativePreview({ title, imageUrl, link, placement }: { title?: string; imageUrl?: string; link?: string; placement?: string }) {
  const widthClass = placement === "sidebar" ? "max-w-xs" : placement === "job_list" ? "max-w-md" : "max-w-2xl";
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Como aparece em: {PLACEMENT_LABELS[placement || ""] || "—"}
      </p>
      {!imageUrl && !title ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
          Preencha o título e a imagem para ver a pré-visualização do anúncio.
        </p>
      ) : (
        <div className={`block overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${widthClass}`}>
          {imageUrl ? (
            <div className="relative h-40 w-full">
              <Image src={imageUrl} alt={title || "Publicidade"} fill sizes="400px" className="object-cover" unoptimized />
            </div>
          ) : null}
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600">Patrocinado</p>
            <h3 className="mt-1.5 text-base font-bold text-slate-900">{title || "Publicidade"}</h3>
            {link ? <p className="mt-1.5 text-sm font-semibold text-red-700">Ver oferta patrocinada</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}

type AdStage = "draft" | "scheduled" | "active" | "expired" | "flagged";

/** Client-side mirror of the backend's _compute_ad_status — computed from
 * the live fields (not the stored status string) so date-driven
 * transitions (scheduled→active→expired) are never stale. */
function computeAdStage(ad: AdCampaignRecord): AdStage {
  if (!ad.active) return "draft";
  if (ad.flagged) return "flagged";
  const now = Date.now();
  if (ad.startDate && now < new Date(ad.startDate).getTime()) return "scheduled";
  if (ad.endDate && now > new Date(ad.endDate).getTime()) return "expired";
  return "active";
}

const FUNNEL_STAGES: Array<{ stage: AdStage; label: string; hint: string; tone: string }> = [
  { stage: "draft",     label: "Rascunho / Inativa", hint: "Preparadas mas não exibidas", tone: "border-slate-200 bg-slate-50" },
  { stage: "scheduled", label: "Agendadas",          hint: "Entram em exibição na data de início", tone: "border-blue-200 bg-blue-50" },
  { stage: "active",    label: "Em exibição",        hint: "A ser mostradas aos visitantes agora", tone: "border-emerald-200 bg-emerald-50" },
  { stage: "expired",   label: "Terminadas",         hint: "Passaram a data de fim", tone: "border-slate-200 bg-white" },
  { stage: "flagged",   label: "Sinalizadas",        hint: "Retiradas para revisão", tone: "border-rose-200 bg-rose-50" },
];

/** Single source of truth for the campaign form — used by both the create
 * card and the edit modal so labels/hints never drift between the two. */
function AdFormFields({
  form,
  formErrors,
  uploadingImage,
  setField,
  clearError,
  onImageFile,
  showActiveToggle,
}: {
  form: AdFormState;
  formErrors: AdFormErrors;
  uploadingImage: boolean;
  setField: <K extends keyof AdFormState>(key: K, value: AdFormState[K]) => void;
  clearError: (key: keyof AdFormState) => void;
  onImageFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  showActiveToggle?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Título da campanha" hint="Nome do anúncio, visível aos visitantes no cartão patrocinado." error={formErrors.title}>
        <input
          value={form.title}
          onChange={(e) => { setField("title", e.target.value); clearError("title"); }}
          placeholder="Ex.: Curso de Informática — Instituto XYZ"
          className={adminFieldClass}
        />
      </Field>
      <Field label="Placement (onde aparece)" hint="A posição do site onde o anúncio será exibido." error={formErrors.placement}>
        <select
          value={form.placement}
          onChange={(e) => { setField("placement", e.target.value); clearError("placement"); }}
          className={adminFieldClass}
        >
          <option value="homepage_banner">Banner da Homepage</option>
          <option value="job_list">Listagem de Vagas</option>
          <option value="sidebar">Barra lateral (detalhe da vaga)</option>
        </select>
      </Field>
      <Field label="Link de destino (opcional)" hint="Para onde o visitante vai ao clicar. URL completo, começando por https://" error={formErrors.link}>
        <input
          value={form.link}
          onChange={(e) => { setField("link", e.target.value); clearError("link"); }}
          placeholder="https://www.anunciante.pt/oferta"
          className={adminFieldClass}
        />
      </Field>
      <Field label="Imagem do anúncio" hint="Envie um ficheiro (recomendado) ou cole o URL de uma imagem já alojada.">
        <div className="grid gap-2">
          <input type="file" accept="image/*" onChange={onImageFile} disabled={uploadingImage} className={adminFieldClass} />
          <input
            value={form.imageUrl}
            onChange={(e) => setField("imageUrl", e.target.value)}
            placeholder="ou URL: https://…/banner.png"
            className={adminFieldClass}
          />
          {uploadingImage ? <p className="text-xs text-slate-500">A enviar imagem...</p> : null}
        </div>
      </Field>
      <Field label="Data de início (opcional)" hint="Primeiro dia em que o anúncio é exibido. Vazio = exibe já." error={formErrors.startDate}>
        <input
          type="date"
          value={form.startDate}
          onChange={(e) => { setField("startDate", e.target.value); clearError("startDate"); }}
          className={adminFieldClass}
        />
      </Field>
      <Field label="Data de fim (opcional)" hint="Último dia de exibição — o anúncio pára automaticamente depois desta data. Vazio = sem data de fim." error={formErrors.endDate}>
        <input
          type="date"
          value={form.endDate}
          onChange={(e) => { setField("endDate", e.target.value); clearError("endDate"); }}
          className={adminFieldClass}
        />
      </Field>
      <Field label="Orçamento total (AOA)" hint="Teto de gasto da campanha. Deixe 0 para não impor limite.">
        <input
          type="number" min={0} step="0.01"
          value={form.budget}
          onChange={(e) => setField("budget", Number(e.target.value))}
          className={adminFieldClass}
        />
      </Field>
      <Field label="Custo por clique (AOA)" hint="Quanto o anunciante paga por cada clique. 0 se cobrado apenas por impressão ou valor fixo.">
        <input
          type="number" min={0} step="0.01"
          value={form.costPerClick}
          onChange={(e) => setField("costPerClick", Number(e.target.value))}
          className={adminFieldClass}
        />
      </Field>
      <Field label="Custo por impressão (AOA)" hint="Quanto o anunciante paga por cada visualização. Normalmente uma fração pequena, ex.: 0.05.">
        <input
          type="number" min={0} step="0.0001"
          value={form.costPerImpression}
          onChange={(e) => setField("costPerImpression", Number(e.target.value))}
          className={adminFieldClass}
        />
      </Field>
      <Field label="Segmentar por categoria (opcional)" hint="Mostrar apenas em vagas desta categoria, ex.: Tecnologia. Vazio = todas.">
        <input
          value={form.targetCategory}
          onChange={(e) => setField("targetCategory", e.target.value)}
          placeholder="Ex.: Tecnologia"
          className={adminFieldClass}
        />
      </Field>
      <Field label="Segmentar por localização (opcional)" hint="Mostrar apenas em vagas desta localização, ex.: Luanda. Vazio = todas.">
        <input
          value={form.targetLocation}
          onChange={(e) => setField("targetLocation", e.target.value)}
          placeholder="Ex.: Luanda"
          className={adminFieldClass}
        />
      </Field>
      {showActiveToggle ? (
        <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setField("active", e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
          />
          Campanha ativa (desmarcada = guardada mas não exibida)
        </label>
      ) : null}
    </div>
  );
}

export default function AdminAdsPage() {
  const { token } = useAuth("admin");
  const [me, setMe] = useState<AdminMe | null>(null);
  const [ads, setAds] = useState<AdCampaignRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formErrors, setFormErrors] = useState<AdFormErrors>({});
  const [selectedAd, setSelectedAd] = useState<AdCampaignRecord | null>(null);
  const [previewAd, setPreviewAd] = useState<AdCampaignRecord | null>(null);
  const [view, setView] = useState<"list" | "funnel">("list");
  const [scheduleDates, setScheduleDates] = useState<Record<string, string>>({});
  const [previewImage, setPreviewImage] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const { notify } = useAppNotifier();

  const setField = useCallback(<K extends keyof AdFormState>(key: K, value: AdFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "imageUrl") setPreviewImage(String(value));
  }, []);

  const clearError = useCallback((key: keyof AdFormState) => {
    setFormErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const canManage = useMemo(() => hasPermission(me, AdminPermissions.ADS_MANAGE), [me]);
  const canCreate = useMemo(() => hasPermission(me, AdminPermissions.ADS_CREATE) || hasPermission(me, AdminPermissions.AD_DRAFT), [me]);
  const canFlag = useMemo(() => hasPermission(me, AdminPermissions.AD_FLAG), [me]);
  const canPause = useMemo(() => hasPermission(me, AdminPermissions.AD_PAUSE), [me]);
  const canPublish = useMemo(() => hasPermission(me, AdminPermissions.AD_PUBLISH) || hasPermission(me, AdminPermissions.ADS_MANAGE), [me]);
  const canViewAds = useMemo(() => canManage || canCreate || canFlag || canPause || canPublish, [canCreate, canFlag, canManage, canPause, canPublish]);

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [currentAdmin, adList] = await Promise.all([fetchAdminMe(token), fetchAdminAds(token)]);
      setMe(currentAdmin);
      setAds(adList.ads || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar campanhas.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !canCreate) return;
    const nextErrors = validateAdForm(form);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      notify(Object.values(nextErrors)[0] || "Corrija os erros no formulário antes de guardar.", "error");
      return;
    }
    setBusy(true);
    try {
      await createAdminAd(token, form);
      setForm(emptyForm);
      setFormErrors({});
      setPreviewImage("");
      await load();
      notify("Anúncio criado com sucesso.", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Erro ao criar anúncio.", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (ad: AdCampaignRecord) => {
    if (!token || !canPublish) return;
    setBusy(true);
    try {
      await setAdminAdStatus(token, ad._id, !ad.active);
      await load();
      notify(ad.active ? "Anúncio desativado." : "Anúncio ativado.", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Erro ao atualizar anúncio.", "error");
    } finally {
      setBusy(false);
    }
  };

  const pause = async (ad: AdCampaignRecord) => {
    if (!token || !canPause) return;
    setBusy(true);
    try {
      await pauseAdminAd(token, ad._id, "Pausado por moderação operacional");
      await load();
      notify("Anúncio pausado.", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Erro ao pausar anúncio.", "error");
    } finally {
      setBusy(false);
    }
  };

  const flag = async (ad: AdCampaignRecord) => {
    if (!token || !canFlag) return;
    const reason = window.prompt("Motivo da sinalização:") || "";
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await flagAdminAd(token, ad._id, reason.trim());
      await load();
      notify("Anúncio sinalizado para revisão.", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Erro ao sinalizar anúncio.", "error");
    } finally {
      setBusy(false);
    }
  };

  const unflag = async (ad: AdCampaignRecord) => {
    if (!token || !canFlag) return;
    setBusy(true);
    try {
      await unflagAdminAd(token, ad._id);
      await load();
      notify("Sinalização removida.", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Erro ao remover sinalização.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ad: AdCampaignRecord) => {
    if (!token || !canManage) return;
    if (!window.confirm("Eliminar esta campanha?")) return;
    setBusy(true);
    try {
      await deleteAdminAd(token, ad._id);
      await load();
      notify("Anúncio eliminado.", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Erro ao remover anúncio.", "error");
    } finally {
      setBusy(false);
    }
  };

  const scheduleAd = async (ad: AdCampaignRecord) => {
    if (!token || !canPublish) return;
    const date = scheduleDates[ad._id];
    if (!date) {
      notify("Escolha uma data de início.", "error");
      return;
    }
    setBusy(true);
    try {
      await replaceAdminAd(token, ad._id, { startDate: date, active: true });
      await load();
      setScheduleDates((prev) => {
        const next = { ...prev };
        delete next[ad._id];
        return next;
      });
      notify("Campanha agendada.", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Erro ao agendar campanha.", "error");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (ad: AdCampaignRecord) => {
    if (!canCreate) return;
    setSelectedAd(ad);
    setForm({
      title: ad.title || "",
      placement: ad.placement || "homepage_banner",
      link: ad.link || "",
      imageUrl: ad.imageUrl || "",
      startDate: String(ad.startDate || "").slice(0, 10),
      endDate: String(ad.endDate || "").slice(0, 10),
      budget: Number(ad.budget || 0),
      costPerClick: Number(ad.costPerClick || 0),
      costPerImpression: Number(ad.costPerImpression || 0),
      targetCategory: ad.targetCategory || "",
      targetLocation: ad.targetLocation || "",
      active: Boolean(ad.active),
    });
    setFormErrors({});
    setPreviewImage(ad.imageUrl || "");
  };

  const saveEdit = async () => {
    if (!token || !selectedAd || !canCreate) return;
    const nextErrors = validateAdForm(form);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      notify(Object.values(nextErrors)[0] || "Corrija os erros no formulário antes de guardar.", "error");
      return;
    }
    setSavingEdit(true);
    try {
      await replaceAdminAd(token, selectedAd._id, form);
      setSelectedAd(null);
      setFormErrors({});
      await load();
      notify("Anúncio atualizado com sucesso.", "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Erro ao atualizar anúncio.", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const onImageFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file after a failed upload
    if (!file || !token) return;
    setUploadingImage(true);
    try {
      // Upload to durable storage — never stuff a base64 data URL into the
      // imageUrl field, it bloats every ad-delivery API response and the
      // image is never actually persisted anywhere durable.
      const { imageUrl, previewUrl } = await uploadAdminAdImage(token, file);
      setForm((prev) => ({ ...prev, imageUrl }));
      setPreviewImage(previewUrl || "");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Erro ao enviar a imagem.", "error");
    } finally {
      setUploadingImage(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-4 border-red-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error && !canViewAds) {
    // Distinguishes "we couldn't confirm your permissions" (retry-able)
    // from "we confirmed you genuinely don't have access" below — a failed
    // /admin/me call must never be presented as the latter.
    return <div className="mt-4"><InlineErrorState message={error} onAction={load} /></div>;
  }

  if (!canViewAds) {
    return <AdminRestricted title="Campanhas restritas">Apenas super-admin pode criar e gerir campanhas publicitárias.</AdminRestricted>;
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Campanhas"
        title="Gestão de Anúncios"
        description="Controle placements, janelas de execução e estado dos anúncios patrocinados."
      />

      {error ? <div className="mt-4"><InlineErrorState message={error} onAction={load} /></div> : null}

      {canCreate && (
        <form onSubmit={submit} className="mt-5 app-card p-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">Nova campanha</p>
          <AdFormFields
            form={form}
            formErrors={formErrors}
            uploadingImage={uploadingImage}
            setField={setField}
            clearError={clearError}
            onImageFile={onImageFile}
          />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <AdCreativePreview title={form.title} imageUrl={previewImage || form.imageUrl} link={form.link} placement={form.placement} />
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={busy} className={adminButtonClass}>
              <AdminLoadingLabel loading={busy} idle="Criar anúncio" busy="A guardar..." />
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setView("list")}
          className={`rounded-xl border px-3 py-2 text-sm font-semibold ${view === "list" ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}
        >
          Vista Lista
        </button>
        <button
          type="button"
          onClick={() => setView("funnel")}
          className={`rounded-xl border px-3 py-2 text-sm font-semibold ${view === "funnel" ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}
        >
          Vista Funil
        </button>
      </div>

      {view === "funnel" ? (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-4">
          {FUNNEL_STAGES.map(({ stage, label, hint, tone }) => {
            const stageAds = ads.filter((ad) => computeAdStage(ad) === stage);
            return (
              <div key={stage} className={`w-72 shrink-0 rounded-2xl border p-3 ${tone}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">{label}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{stageAds.length}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
                <div className="mt-3 space-y-2">
                  {stageAds.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-3 text-center text-xs text-slate-400">Sem campanhas</p>
                  ) : (
                    stageAds.map((ad) => (
                      <div key={ad._id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <p className="text-sm font-semibold text-slate-900">{ad.title || "Campanha"}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{PLACEMENT_LABELS[ad.placement || ""] || ad.placement || "—"}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{toDateLabel(ad.startDate)} → {toDateLabel(ad.endDate)}</p>
                        {ad.budget ? (
                          <p className="mt-0.5 text-xs text-slate-500">Gasto: {(ad.spent ?? 0).toLocaleString("pt-PT")} / {ad.budget.toLocaleString("pt-PT")}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button onClick={() => setPreviewAd(ad)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">Pré-ver</button>
                          {canCreate ? (
                            <button onClick={() => openEdit(ad)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">Editar</button>
                          ) : null}
                          {canPublish && stage === "draft" ? (
                            <button onClick={() => toggle(ad)} disabled={busy} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50">Publicar</button>
                          ) : null}
                          {canPublish && (stage === "active" || stage === "scheduled") ? (
                            <button onClick={() => toggle(ad)} disabled={busy} className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50">Desativar</button>
                          ) : null}
                          {canPause && ad.active ? (
                            <button onClick={() => pause(ad)} disabled={busy} className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 disabled:opacity-50">Pausar</button>
                          ) : null}
                          {canFlag && !ad.flagged ? (
                            <button onClick={() => flag(ad)} disabled={busy} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Sinalizar</button>
                          ) : null}
                          {canFlag && ad.flagged ? (
                            <button onClick={() => unflag(ad)} disabled={busy} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50">Remover sinalização</button>
                          ) : null}
                          {canManage ? (
                            <button onClick={() => remove(ad)} disabled={busy} className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">Eliminar</button>
                          ) : null}
                        </div>
                        {canPublish && stage === "draft" ? (
                          <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2">
                            <input
                              type="date"
                              value={scheduleDates[ad._id] || ""}
                              onChange={(e) => setScheduleDates((prev) => ({ ...prev, [ad._id]: e.target.value }))}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                            />
                            <button
                              onClick={() => scheduleAd(ad)}
                              disabled={busy || !scheduleDates[ad._id]}
                              className="shrink-0 rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 disabled:opacity-50"
                            >
                              Agendar
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div className="mt-4 grid gap-3">
        {ads.map((ad) => (
          <article key={ad._id} className="app-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{ad.title || "Campanha"}</p>
                <p className="text-xs text-slate-500">{ad.placement || "placement"} · {ad.link || "sem link"}</p>
                <p className="text-xs text-slate-500">{toDateLabel(ad.startDate)} até {toDateLabel(ad.endDate)}</p>
                <p className="text-xs text-slate-500">
                  Impressões: {ad.impressions || 0} · Cliques: {ad.clicks || 0} · CTR: {(ad.ctr ?? 0).toFixed(2)}%
                </p>
                {ad.budget ? (
                  <p className="text-xs text-slate-500">
                    Gasto: {(ad.spent ?? 0).toLocaleString("pt-PT")} / {ad.budget.toLocaleString("pt-PT")}
                    {(ad.budgetRemaining ?? 1) <= 0 ? <span className="ml-1 font-semibold text-rose-600">· orçamento esgotado</span> : null}
                  </p>
                ) : null}
                {(ad.targetCategory || ad.targetLocation) ? (
                  <p className="text-xs text-slate-500">Segmentação: {[ad.targetCategory, ad.targetLocation].filter(Boolean).join(" · ")}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(ad.active ? "active" : "archived")}`}>
                  {ad.active ? "active" : "inactive"}
                </span>
                {ad.flagged ? (
                  <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">Sinalizado</span>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => setPreviewAd(ad)} disabled={busy} className={adminSecondaryButtonClass}>
                Pré-ver
              </button>
              <button onClick={() => openEdit(ad)} disabled={busy || !canCreate} className={adminSecondaryButtonClass}>
                Editar
              </button>
              {canPublish ? (
                <button onClick={() => toggle(ad)} disabled={busy} className={ad.active ? "rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60" : adminSecondaryButtonClass}>
                  {ad.active ? "Desativar" : "Publicar"}
                </button>
              ) : null}
              {canPause ? (
                <button onClick={() => pause(ad)} disabled={busy || !ad.active} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60">
                  Pausar
                </button>
              ) : null}
              {canFlag && !ad.flagged ? (
                <button onClick={() => flag(ad)} disabled={busy} className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60">
                  Sinalizar
                </button>
              ) : null}
              {canFlag && ad.flagged ? (
                <button onClick={() => unflag(ad)} disabled={busy} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60">
                  Remover sinalização
                </button>
              ) : null}
              <button onClick={() => remove(ad)} disabled={busy || !canManage} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60">
                Eliminar
              </button>
            </div>
          </article>
        ))}
      </div>
      )}

      <AdminModal
        open={Boolean(selectedAd)}
        title="Editar campanha"
        onClose={() => {
          setSelectedAd(null);
          setFormErrors({});
        }}
        footer={(
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => {
              setSelectedAd(null);
              setFormErrors({});
            }} className={adminSecondaryButtonClass}>Cancelar</button>
            <button type="button" onClick={saveEdit} disabled={savingEdit} className={adminButtonClass}>
              <AdminLoadingLabel loading={savingEdit} idle="Guardar alterações" busy="A guardar..." />
            </button>
          </div>
        )}
      >
        <AdFormFields
          form={form}
          formErrors={formErrors}
          uploadingImage={uploadingImage}
          setField={setField}
          clearError={clearError}
          onImageFile={onImageFile}
          showActiveToggle
        />
        <div className="mt-4 border-t border-slate-100 pt-4">
          <AdCreativePreview title={form.title} imageUrl={previewImage || form.imageUrl} link={form.link} placement={form.placement} />
        </div>
      </AdminModal>

      <AdminModal
        open={Boolean(previewAd)}
        title={previewAd ? `Pré-visualização — ${previewAd.title || "Campanha"}` : "Pré-visualização"}
        onClose={() => setPreviewAd(null)}
      >
        {previewAd ? (
          <AdCreativePreview
            title={previewAd.title}
            imageUrl={previewAd.imageUrl || undefined}
            link={previewAd.link || undefined}
            placement={previewAd.placement || undefined}
          />
        ) : null}
      </AdminModal>
    </div>
  );
}
