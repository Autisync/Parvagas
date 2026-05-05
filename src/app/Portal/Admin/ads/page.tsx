"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  AdminPermissions,
  createAdminAd,
  deleteAdminAd,
  fetchAdminAds,
  fetchAdminMe,
  hasPermission,
  statusBadgeClass,
  toDateLabel,
  updateAdminAd,
  type AdCampaignRecord,
  type AdminMe,
} from "../adminClient";
import { AdminPageHeader, AdminRestricted, adminButtonClass, adminFieldClass, adminSecondaryButtonClass } from "../components/AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";

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

export default function AdminAdsPage() {
  const { token } = useAuth("admin");
  const [me, setMe] = useState<AdminMe | null>(null);
  const [ads, setAds] = useState<AdCampaignRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canManage = useMemo(() => hasPermission(me, AdminPermissions.ADS_MANAGE), [me]);
  const canCreate = useMemo(() => hasPermission(me, AdminPermissions.ADS_CREATE), [me]);

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
    setBusy(true);
    setError("");
    try {
      await createAdminAd(token, form);
      setForm(emptyForm);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao criar campanha.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (ad: AdCampaignRecord) => {
    if (!token || !canManage) return;
    setBusy(true);
    setError("");
    try {
      await updateAdminAd(token, ad._id, { active: !ad.active });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar campanha.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ad: AdCampaignRecord) => {
    if (!token || !canManage) return;
    if (!window.confirm("Eliminar esta campanha?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteAdminAd(token, ad._id);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao remover campanha.");
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return <AdminRestricted title="Campanhas restritas">Apenas super-admin pode criar e gerir campanhas publicitárias.</AdminRestricted>;
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Campanhas"
        title="Gestão de Ad Campaigns"
        description="Controle placements, janelas de execução e estado das campanhas publicitárias."
      />

      {error ? <div className="mt-4"><InlineErrorState /></div> : null}

      {canCreate && (
        <form onSubmit={submit} className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              required
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Título da campanha"
              className={adminFieldClass}
            />
            <select
              value={form.placement}
              onChange={(e) => setForm((prev) => ({ ...prev, placement: e.target.value }))}
              className={adminFieldClass}
            >
              <option value="homepage_banner">Homepage Banner</option>
              <option value="sidebar">Sidebar</option>
              <option value="inline">Inline</option>
              <option value="newsletter">Newsletter</option>
            </select>
            <input
              required
              value={form.link}
              onChange={(e) => setForm((prev) => ({ ...prev, link: e.target.value }))}
              placeholder="https://example.com"
              className={adminFieldClass}
            />
            <input
              value={form.imageUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
              placeholder="URL da imagem/banner"
              className={adminFieldClass}
            />
            <input
              type="date"
              required
              value={form.startDate}
              onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
              className={adminFieldClass}
            />
            <input
              type="date"
              required
              value={form.endDate}
              onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
              className={adminFieldClass}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy} className={adminButtonClass}>{busy ? "A guardar..." : "Criar campanha"}</button>
          </div>
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
              <button onClick={() => toggle(ad)} disabled={busy} className={adminSecondaryButtonClass}>
                {ad.active ? "Desativar" : "Ativar"}
              </button>
              <button onClick={() => remove(ad)} disabled={busy} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60">
                Eliminar
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
