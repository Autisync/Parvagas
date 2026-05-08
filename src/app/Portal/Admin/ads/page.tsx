"use client";

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
  active: true,
};

type AdFormState = typeof emptyForm;
type AdFormErrors = Partial<Record<keyof AdFormState, string>>;

function validateAdForm(values: AdFormState): AdFormErrors {
  const errors: AdFormErrors = {};

  if (!values.title.trim()) errors.title = "Indique o título do anúncio.";
  if (!values.placement.trim()) errors.placement = "Selecione o placement do anúncio.";

  if (!values.link.trim()) {
    errors.link = "Indique o link de destino.";
  } else {
    try {
      const url = new URL(values.link);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.link = "Use um URL completo começando por http:// ou https://.";
      }
    } catch {
      errors.link = "Use um URL válido para o destino do anúncio.";
    }
  }

  if (!values.startDate) errors.startDate = "Selecione a data de início.";
  if (!values.endDate) errors.endDate = "Selecione a data de fim.";

  if (values.startDate && values.endDate && values.startDate > values.endDate) {
    errors.endDate = "A data de fim deve ser igual ou posterior à data de início.";
  }

  return errors;
}

export default function AdminAdsPage() {
  const { token } = useAuth("admin");
  const [me, setMe] = useState<AdminMe | null>(null);
  const [ads, setAds] = useState<AdCampaignRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formErrors, setFormErrors] = useState<AdFormErrors>({});
  const [selectedAd, setSelectedAd] = useState<AdCampaignRecord | null>(null);
  const [previewImage, setPreviewImage] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const { notify } = useAppNotifier();

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
    if (Object.keys(nextErrors).length > 0) return;
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
      active: Boolean(ad.active),
    });
    setFormErrors({});
    setPreviewImage(ad.imageUrl || "");
  };

  const saveEdit = async () => {
    if (!token || !selectedAd || !canCreate) return;
    const nextErrors = validateAdForm(form);
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
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
    if (!file) return;
    const value = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
      reader.readAsDataURL(file);
    });
    setForm((prev) => ({ ...prev, imageUrl: value }));
    setPreviewImage(value);
  };

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
        <form onSubmit={submit} className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              required
              value={form.title}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, title: value }));
                setFormErrors((prev) => ({ ...prev, title: undefined }));
              }}
              placeholder="Título da campanha"
              className={adminFieldClass}
            />
            <FormFieldError id="ad-title-error" message={formErrors.title} />
            <select
              value={form.placement}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, placement: value }));
                setFormErrors((prev) => ({ ...prev, placement: undefined }));
              }}
              className={adminFieldClass}
            >
              <option value="homepage_banner">Homepage Banner</option>
              <option value="sidebar">Sidebar</option>
              <option value="inline">Inline</option>
              <option value="newsletter">Newsletter</option>
            </select>
            <FormFieldError id="ad-placement-error" message={formErrors.placement} />
            <input
              required
              value={form.link}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, link: value }));
                setFormErrors((prev) => ({ ...prev, link: undefined }));
              }}
              placeholder="https://example.com"
              className={adminFieldClass}
            />
            <FormFieldError id="ad-link-error" message={formErrors.link} />
            <input
              value={form.imageUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
              placeholder="URL da imagem/banner"
              className={adminFieldClass}
            />
            <input type="file" accept="image/*" onChange={onImageFile} className={adminFieldClass} />
            <input
              type="date"
              required
              value={form.startDate}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, startDate: value }));
                setFormErrors((prev) => ({ ...prev, startDate: undefined }));
              }}
              className={adminFieldClass}
            />
            <FormFieldError id="ad-start-date-error" message={formErrors.startDate} />
            <input
              type="date"
              required
              value={form.endDate}
              onChange={(e) => {
                const value = e.target.value;
                setForm((prev) => ({ ...prev, endDate: value }));
                setFormErrors((prev) => ({ ...prev, endDate: undefined }));
              }}
              className={adminFieldClass}
            />
            <FormFieldError id="ad-end-date-error" message={formErrors.endDate} />
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy} className={adminButtonClass}>
              <AdminLoadingLabel loading={busy} idle="Criar anúncio" busy="A guardar..." />
            </button>
          </div>
          {previewImage ? <img src={previewImage} alt="Pré-visualização do anúncio" className="mt-3 h-24 rounded-xl border border-slate-200 object-contain p-1" /> : null}
        </form>
      )}

      <div className="mt-5 grid gap-3">
        {ads.map((ad) => (
          <article key={ad._id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{ad.title || "Campanha"}</p>
                <p className="text-xs text-slate-500">{ad.placement || "placement"} · {ad.link || "sem link"}</p>
                <p className="text-xs text-slate-400">{toDateLabel(ad.startDate)} até {toDateLabel(ad.endDate)}</p>
                <p className="text-xs text-slate-500">Impressões: {ad.impressions || 0} · Cliques: {ad.clicks || 0}</p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(ad.active ? "active" : "archived")}`}>
                {ad.active ? "active" : "inactive"}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
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
              {canFlag ? (
                <button onClick={() => flag(ad)} disabled={busy} className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60">
                  Sinalizar
                </button>
              ) : null}
              <button onClick={() => remove(ad)} disabled={busy || !canManage} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60">
                Eliminar
              </button>
            </div>
          </article>
        ))}
      </div>

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
        <div className="grid gap-3 md:grid-cols-2">
          <input value={form.title} onChange={(e) => {
            const value = e.target.value;
            setForm((prev) => ({ ...prev, title: value }));
            setFormErrors((prev) => ({ ...prev, title: undefined }));
          }} placeholder="Título" className={adminFieldClass} />
          <select value={form.placement} onChange={(e) => {
            const value = e.target.value;
            setForm((prev) => ({ ...prev, placement: value }));
            setFormErrors((prev) => ({ ...prev, placement: undefined }));
          }} className={adminFieldClass}>
            <option value="homepage_banner">Homepage Banner</option>
            <option value="sidebar">Job List Sidebar</option>
            <option value="inline">Inline</option>
            <option value="newsletter">Newsletter</option>
          </select>
          <FormFieldError id="edit-ad-title-error" message={formErrors.title} />
          <FormFieldError id="edit-ad-placement-error" message={formErrors.placement} />
          <input value={form.link} onChange={(e) => {
            const value = e.target.value;
            setForm((prev) => ({ ...prev, link: value }));
            setFormErrors((prev) => ({ ...prev, link: undefined }));
          }} placeholder="Link URL" className={adminFieldClass} />
          <input value={form.imageUrl} onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))} placeholder="URL da imagem" className={adminFieldClass} />
          <FormFieldError id="edit-ad-link-error" message={formErrors.link} />
          <input type="date" value={form.startDate} onChange={(e) => {
            const value = e.target.value;
            setForm((prev) => ({ ...prev, startDate: value }));
            setFormErrors((prev) => ({ ...prev, startDate: undefined }));
          }} className={adminFieldClass} />
          <input type="date" value={form.endDate} onChange={(e) => {
            const value = e.target.value;
            setForm((prev) => ({ ...prev, endDate: value }));
            setFormErrors((prev) => ({ ...prev, endDate: undefined }));
          }} className={adminFieldClass} />
          <FormFieldError id="edit-ad-start-date-error" message={formErrors.startDate} />
          <FormFieldError id="edit-ad-end-date-error" message={formErrors.endDate} />
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500" />
            Campanha ativa
          </label>
        </div>
      </AdminModal>
    </div>
  );
}
