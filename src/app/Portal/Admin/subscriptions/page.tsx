"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import {
  AdminPermissions,
  confirmCandidateCvPayment,
  confirmCompanyPayment,
  createAdminPlan,
  deleteAdminPlan,
  fetchAdminCandidateCvPlans,
  fetchAdminMe,
  fetchAdminPlans,
  fetchAdminTransactions,
  fetchAnalytics,
  fetchExpiringSubscriptions,
  hasPermission,
  rejectAdminTransaction,
  toDateLabel,
  updateAdminCandidateCvPlan,
  updateAdminPlan,
  type AdminMe,
  type AnalyticsResponse,
  type CandidateCvPlanRecord,
  type ExpiringSubscription,
  type PlanRecord,
  type TransactionRecord,
} from "../adminClient";
import { AdminEmptyState, AdminModal, AdminPageHeader, AdminRestricted, adminButtonClass, adminFieldClass, adminSecondaryButtonClass } from "../components/AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { useAppNotifier } from "@/app/components/AppNotifier";

const emptyPlanForm = { code: "", name: "", price: 0, currency: "AOA", interval: "month" as "month" | "one_time", features: "", active: true };
type PlanFormState = typeof emptyPlanForm;

function featuresToText(features: string[]) {
  return (features || []).join("\n");
}

function textToFeatures(text: string) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

export default function AdminSubscriptionsPage() {
  const { token } = useAuth("admin");
  const { notify } = useAppNotifier();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [cvPlans, setCvPlans] = useState<CandidateCvPlanRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [expiring, setExpiring] = useState<ExpiringSubscription[]>([]);
  const [txStatusFilter, setTxStatusFilter] = useState("pending");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm);

  const canManage = useMemo(() => hasPermission(me, AdminPermissions.SUBSCRIPTIONS_MANAGE), [me]);

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    try {
      const [currentAdmin, plansRes, cvPlansRes, txRes, analyticsRes, expiringRes] = await Promise.all([
        fetchAdminMe(token),
        fetchAdminPlans(token),
        fetchAdminCandidateCvPlans(token),
        fetchAdminTransactions(token, { status: txStatusFilter === "all" ? undefined : txStatusFilter, limit: 50 }),
        fetchAnalytics(token),
        fetchExpiringSubscriptions(token, 7),
      ]);
      setMe(currentAdmin);
      setPlans(plansRes.plans || []);
      setCvPlans(cvPlansRes.candidateCvPlans || []);
      setTransactions(txRes.transactions || []);
      setAnalytics(analyticsRes);
      setExpiring(expiringRes.expiring || []);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Erro ao carregar subscrições."));
    }
  }, [token, txStatusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreatePlan = () => {
    setEditingPlanId(null);
    setPlanForm(emptyPlanForm);
    setPlanModalOpen(true);
  };

  const openEditPlan = (plan: PlanRecord) => {
    setEditingPlanId(plan._id);
    setPlanForm({ code: plan.code, name: plan.name, price: plan.price, currency: plan.currency, interval: plan.interval, features: featuresToText(plan.features), active: plan.active });
    setPlanModalOpen(true);
  };

  const submitPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !canManage) return;
    setBusy(true);
    try {
      const payload = { ...planForm, features: textToFeatures(planForm.features) };
      if (editingPlanId) {
        await updateAdminPlan(token, editingPlanId, payload);
        notify("Plano atualizado.", "success");
      } else {
        await createAdminPlan(token, payload);
        notify("Plano criado.", "success");
      }
      setPlanModalOpen(false);
      await load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao guardar o plano."), "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (plan: PlanRecord) => {
    if (!token || !canManage) return;
    setBusy(true);
    try {
      await updateAdminPlan(token, plan._id, { active: !plan.active });
      await load();
      notify(plan.active ? "Plano desativado." : "Plano ativado.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao atualizar o plano."), "error");
    } finally {
      setBusy(false);
    }
  };

  const removePlan = async (plan: PlanRecord) => {
    if (!token || !canManage) return;
    if (!window.confirm(`Eliminar o plano "${plan.name}"?`)) return;
    setBusy(true);
    try {
      await deleteAdminPlan(token, plan._id);
      await load();
      notify("Plano eliminado.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao eliminar o plano."), "error");
    } finally {
      setBusy(false);
    }
  };

  const updateCvPlanField = async (plan: CandidateCvPlanRecord, patch: Partial<CandidateCvPlanRecord>) => {
    if (!token || !canManage) return;
    setBusy(true);
    try {
      await updateAdminCandidateCvPlan(token, plan._id, patch);
      await load();
      notify("Plano CV Builder atualizado.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao atualizar o plano."), "error");
    } finally {
      setBusy(false);
    }
  };

  const rejectPayment = async (tx: TransactionRecord) => {
    if (!token || !canManage) return;
    if (!window.confirm(`Rejeitar a transação ${tx.reference}?`)) return;
    setBusy(true);
    try {
      await rejectAdminTransaction(token, tx._id, "cancelled");
      notify("Transação cancelada.", "success");
      await load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao rejeitar a transação."), "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmPayment = async (tx: TransactionRecord) => {
    if (!token || !canManage || !tx.reference) return;
    setBusy(true);
    try {
      if (tx.partyType === "company") {
        await confirmCompanyPayment(token, tx.reference);
      } else if (tx.partyType === "candidate") {
        await confirmCandidateCvPayment(token, tx.reference);
      } else {
        notify("Não foi possível determinar o tipo de subscrição para esta transação.", "error");
        return;
      }
      notify("Pagamento confirmado.", "success");
      await load();
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao confirmar pagamento."), "error");
    } finally {
      setBusy(false);
    }
  };

  if (me && !canManage) {
    return (
      <AdminRestricted title="Acesso restrito">
        Não tem permissão para gerir subscrições e planos.
      </AdminRestricted>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Monetização"
        title="Subscrições"
        description="Ofertas de planos para empresas e candidatos, e pagamentos pendentes de confirmação."
      />

      {error ? <div className="mt-4"><InlineErrorState /></div> : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Receita (últimos 30 dias)</p>
          <p className="mt-2 text-3xl font-bold text-emerald-900">
            {(analytics?.business?.revenueInRange ?? 0).toLocaleString("pt-PT")} AOA
          </p>
          {analytics?.trends?.revenuePct != null ? (
            <p className="mt-1 text-xs font-semibold text-emerald-700">
              {analytics.trends.revenuePct >= 0 ? "+" : ""}{analytics.trends.revenuePct}% vs. período anterior
            </p>
          ) : null}
        </div>
        <div className="app-card p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Transações pagas na série (14 dias)</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{(analytics?.series?.revenue || []).length}</p>
          <p className="mt-1 text-xs text-slate-500">dias com pelo menos um pagamento confirmado</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-amber-700">A expirar em 7 dias</p>
          <p className="mt-2 text-3xl font-bold text-amber-900">{expiring.length}</p>
          <p className="mt-1 text-xs text-amber-700">subscrições ativas por renovar</p>
        </div>
      </section>

      {expiring.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-slate-900">A expirar em 7 dias</h2>
          <div className="mt-4 space-y-2">
            {expiring.map((entry, i) => (
              <div key={`${entry.scope}-${entry.userId}-${i}`} className="app-card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-slate-900">{entry.name || "—"} <span className="text-xs font-normal text-slate-400">({entry.scope})</span></p>
                  <p className="text-xs text-slate-500">Plano: {entry.planName || "—"}</p>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  expira em {toDateLabel(entry.currentPeriodEnd || undefined)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Planos de Empresa</h2>
          {canManage && (
            <button type="button" onClick={openCreatePlan} className={adminButtonClass}>
              Adicionar plano
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article key={plan._id} className="app-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">{plan.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${plan.active ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-slate-200 bg-slate-100 text-slate-500"}`}>
                  {plan.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{plan.code}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {plan.price === 0 ? "Grátis" : `${plan.price.toLocaleString("pt-PT")} ${plan.currency}`}
                {plan.price > 0 ? <span className="text-sm font-normal text-slate-500">{plan.interval === "month" ? "/mês" : " (único)"}</span> : null}
              </p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {plan.features.map((f, i) => <li key={i}>• {f}</li>)}
              </ul>
              {canManage && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => openEditPlan(plan)} disabled={busy} className={adminSecondaryButtonClass}>Editar</button>
                  <button type="button" onClick={() => toggleActive(plan)} disabled={busy} className={adminSecondaryButtonClass}>{plan.active ? "Desativar" : "Ativar"}</button>
                  <button type="button" onClick={() => removePlan(plan)} disabled={busy} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60">Eliminar</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-slate-900">Planos CV Builder (Candidatos)</h2>
        <p className="mt-1 text-xs text-slate-500">Os três níveis (Grátis/Pro/Premium) são fixos — apenas o conteúdo (preço, funcionalidades, limites) é editável.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cvPlans.map((plan) => (
            <article key={plan._id} className="app-card p-4">
              <p className="font-semibold text-slate-900">{plan.name}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{plan.tier}</p>
              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-700">Preço (AOA/mês)</span>
                <input
                  type="number"
                  min={0}
                  className={adminFieldClass}
                  defaultValue={plan.price}
                  disabled={!canManage}
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    if (value !== plan.price) updateCvPlanField(plan, { price: value });
                  }}
                />
              </label>
              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-700">Máx. CVs (-1 = ilimitado)</span>
                <input
                  type="number"
                  className={adminFieldClass}
                  defaultValue={plan.maxResumes}
                  disabled={!canManage}
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    if (value !== plan.maxResumes) updateCvPlanField(plan, { maxResumes: value });
                  }}
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {([
                  ["aiScore", "Pontuação IA"],
                  ["aiRewrite", "IA rewrite"],
                  ["coverLetters", "Cartas de apresentação"],
                  ["autoApply", "Auto-candidatura"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={plan[key]}
                      disabled={!canManage}
                      onChange={(e) => updateCvPlanField(plan, { [key]: e.target.checked } as Partial<CandidateCvPlanRecord>)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">Transações</h2>
          <select value={txStatusFilter} onChange={(e) => setTxStatusFilter(e.target.value)} className={adminFieldClass}>
            <option value="pending">Pendentes</option>
            <option value="paid">Pagas</option>
            <option value="failed">Falhadas</option>
            <option value="cancelled">Canceladas</option>
            <option value="all">Todas</option>
          </select>
        </div>
        {transactions.length === 0 ? (
          <div className="mt-4">
            <AdminEmptyState title="Sem transações nesta vista" description="Ajuste o filtro de estado." />
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {transactions.map((tx) => (
              <div key={tx._id} className="app-card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-slate-900">{tx.partyName || "—"} <span className="text-xs font-normal text-slate-400">({tx.partyType})</span></p>
                  <p className="text-xs text-slate-500">
                    {tx.reference} · {tx.amount.toLocaleString("pt-PT")} {tx.currency} · {tx.provider} · {tx.kind}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tx.status === "paid" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : tx.status === "pending" ? "border border-amber-200 bg-amber-50 text-amber-800" : "border border-slate-200 bg-slate-100 text-slate-600"}`}>
                    {tx.status}
                  </span>
                  {canManage && tx.status === "pending" && tx.partyType !== "unknown" && (
                    <button type="button" onClick={() => confirmPayment(tx)} disabled={busy} className={adminSecondaryButtonClass}>
                      Confirmar pagamento
                    </button>
                  )}
                  {canManage && tx.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => rejectPayment(tx)}
                      disabled={busy}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Rejeitar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <AdminModal
        open={planModalOpen}
        title={editingPlanId ? "Editar plano" : "Adicionar plano"}
        onClose={() => setPlanModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPlanModalOpen(false)} className={adminSecondaryButtonClass}>Cancelar</button>
            <button type="submit" form="plan-form" disabled={busy} className={adminButtonClass}>{busy ? "A guardar..." : "Guardar"}</button>
          </div>
        }
      >
        <form id="plan-form" onSubmit={submitPlan} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Código (identificador único)</span>
            <input type="text" className={adminFieldClass} value={planForm.code} disabled={Boolean(editingPlanId)} onChange={(e) => setPlanForm((p) => ({ ...p, code: e.target.value }))} required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Nome</span>
            <input type="text" className={adminFieldClass} value={planForm.name} onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))} required />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Preço</span>
              <input type="number" min={0} className={adminFieldClass} value={planForm.price} onChange={(e) => setPlanForm((p) => ({ ...p, price: Number(e.target.value) }))} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Periodicidade</span>
              <select className={adminFieldClass} value={planForm.interval} onChange={(e) => setPlanForm((p) => ({ ...p, interval: e.target.value as "month" | "one_time" }))}>
                <option value="month">Mensal</option>
                <option value="one_time">Pagamento único</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Funcionalidades (uma por linha)</span>
            <textarea className={`${adminFieldClass} resize-y`} rows={4} value={planForm.features} onChange={(e) => setPlanForm((p) => ({ ...p, features: e.target.value }))} />
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={planForm.active} onChange={(e) => setPlanForm((p) => ({ ...p, active: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
            Ativo
          </label>
        </form>
      </AdminModal>
    </div>
  );
}
