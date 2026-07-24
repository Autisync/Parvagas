"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, authFetchRaw, apiFetch, getErrorMessage } from "@/lib/api";
import { useAppNotifier } from "@/app/components/AppNotifier";
import { CheckIcon } from "@heroicons/react/24/outline";
import { SuccessCheck } from "@/app/components/motion";
import { track } from "@/lib/analytics";
import RefundDisclosureNotice from "@/app/Portal/components/RefundDisclosureNotice";
import DisputePaymentForm from "@/app/Portal/components/DisputePaymentForm";

type Plan = {
  _id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
  features: string[];
  promoPrice?: number | null;
  promoLabel?: string | null;
};

type Subscription = {
  _id: string;
  status: string;
  plan?: { code?: string; name?: string } | null;
  currentPeriodEnd?: string | null;
  cancelRequestedAt?: string | null;
};

type Instructions = { reference: string; amount: number; currency: string; message: string };

const PROVIDERS = [
  { value: "multicaixa", label: "Multicaixa Express" },
  { value: "unitel_money", label: "Unitel Money" },
  { value: "bank", label: "Transferência bancária" },
];

function fmt(value: number, currency: string) {
  return `${value.toLocaleString("pt-PT")} ${currency}`;
}

export default function EmpresaPlanosPage() {
  const { token } = useAuth("company");
  const { notify } = useAppNotifier();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("multicaixa");
  const [subscribing, setSubscribing] = useState("");
  const [instructions, setInstructions] = useState<Instructions | null>(null);
  const [acceptedRefundPolicy, setAcceptedRefundPolicy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, subRes] = await Promise.all([
        apiFetch<{ plans: Plan[] }>("/plans", { suppressGlobalErrors: true }),
        token ? authFetch<{ subscription: Subscription | null }>("/companies/subscription", token, { suppressGlobalErrors: true }) : Promise.resolve({ subscription: null }),
      ]);
      setPlans(plansRes.plans || []);
      setSubscription(subRes.subscription || null);
    } catch (err) {
      notify(getErrorMessage(err, "Erro ao carregar planos."), "error");
    } finally {
      setLoading(false);
    }
  }, [token, notify]);

  useEffect(() => { load(); }, [load]);

  const subscribe = async (plan: Plan) => {
    if (!token) return;
    if (plan.price > 0 && !acceptedRefundPolicy) return;
    setSubscribing(plan.code);
    track("subscribe_start", { plan: plan.code });
    setInstructions(null);
    try {
      const res = await authFetch<{ activated?: boolean; instructions?: Instructions }>(
        "/companies/subscribe", token,
        { method: "POST", body: JSON.stringify({ planCode: plan.code, provider }), suppressGlobalErrors: true }
      );
      if (res.activated) {
        notify("Plano ativado com sucesso!", "success");
        await load();
      } else if (res.instructions) {
        setInstructions(res.instructions);
        await load();
      }
    } catch (err) {
      notify(getErrorMessage(err, "Não foi possível subscrever."), "error");
    } finally {
      setSubscribing("");
    }
  };

  const activeCode = subscription?.status === "active" ? subscription.plan?.code : null;

  const handleCancel = async () => {
    if (!token) return;
    if (!window.confirm(
      "Cancelar a renovação da subscrição? O acesso mantém-se até ao final do período já pago, sem reembolso do período em curso."
    )) {
      return;
    }
    setCancelling(true);
    try {
      await authFetch("/companies/subscription/cancel", token, { method: "POST", suppressGlobalErrors: true });
      notify("Cancelamento agendado — o acesso mantém-se até ao final do período atual.", "success");
      await load();
    } catch (err) {
      notify(getErrorMessage(err, "Não foi possível cancelar a subscrição."), "error");
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadReceipt = async () => {
    if (!token) return;
    setDownloadingReceipt(true);
    try {
      const res = await authFetchRaw("/companies/subscription/receipt", token, { suppressGlobalErrors: true });
      if (!res.ok) throw new Error("Nenhum recibo disponível.");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "recibo-parvagas.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(href);
    } catch (err) {
      notify(getErrorMessage(err, "Não foi possível obter o recibo."), "error");
    } finally {
      setDownloadingReceipt(false);
    }
  };

  const handleResume = async () => {
    if (!token) return;
    setCancelling(true);
    try {
      await authFetch("/companies/subscription/resume", token, { method: "POST", suppressGlobalErrors: true });
      notify("Subscrição reativada — a renovação automática continua.", "success");
      await load();
    } catch (err) {
      notify(getErrorMessage(err, "Não foi possível reativar a subscrição."), "error");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-7xl px-6 pb-24 lg:pb-16 pt-8">
        <div className="space-y-6">
          <header>
            <h1 className="text-2xl font-bold text-[var(--text-strong)] sm:text-3xl">Planos &amp; Faturação</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Escolha o plano que se adequa ao seu recrutamento. Pague localmente via Multicaixa Express, Unitel Money ou transferência.
            </p>
          </header>

          {subscription?.status === "active" && (
            <div className="app-card flex flex-wrap items-center gap-3 border-emerald-200 bg-[var(--success-50)] p-4">
              <SuccessCheck size={28} tone="success" />
              <p className="flex-1 text-sm font-medium text-[var(--success-700)]">
                Plano ativo: <strong>{subscription.plan?.name}</strong>
                {subscription.currentPeriodEnd ? ` · ${subscription.cancelRequestedAt ? "acesso até" : "renova em"} ${new Date(subscription.currentPeriodEnd).toLocaleDateString("pt-PT")}` : ""}
                {subscription.cancelRequestedAt ? " · cancelamento agendado" : ""}
              </p>
              {subscription.plan?.code !== "free" && (
                <button
                  type="button"
                  onClick={handleDownloadReceipt}
                  disabled={downloadingReceipt}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloadingReceipt ? "A obter..." : "Descarregar recibo"}
                </button>
              )}
              {subscription.plan?.code !== "free" && (
                subscription.cancelRequestedAt ? (
                  <button
                    type="button"
                    onClick={handleResume}
                    disabled={cancelling}
                    className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                  >
                    Reativar subscrição
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                  >
                    Cancelar subscrição
                  </button>
                )
              )}
              {subscription.plan?.code !== "free" && (
                <div className="w-full">
                  <DisputePaymentForm submitPath="/companies/subscription/dispute" />
                </div>
              )}
            </div>
          )}

          {instructions && (
            <div className="app-card border-amber-200 bg-[var(--warning-50)] p-5">
              <p className="text-sm font-semibold text-[var(--warning-600)]">Pagamento pendente</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{instructions.message}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span className="rounded-lg bg-white px-3 py-1.5 font-mono font-semibold text-[var(--text-strong)]">Ref: {instructions.reference}</span>
                <span className="rounded-lg bg-white px-3 py-1.5 font-semibold text-[var(--text-strong)]">{fmt(instructions.amount, instructions.currency)}</span>
              </div>
              <p className="mt-2 text-xs text-[var(--text-subtle)]">A conta é ativada assim que o pagamento for confirmado.</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[var(--text-muted)]">Método de pagamento:</label>
            <select className="app-input w-auto py-1.5" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <RefundDisclosureNotice audience="company" checked={acceptedRefundPolicy} onChange={setAcceptedRefundPolicy} />

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="app-skeleton h-72 rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid gap-4 pv-stagger sm:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan) => {
                const isActive = activeCode === plan.code;
                const featured = plan.code === "business";
                return (
                  <div key={plan._id} className={`app-card flex flex-col p-6 ${featured ? "ring-2 ring-[var(--brand-500)]" : ""}`}>
                    {featured && <span className="app-badge app-badge-danger mb-2 self-start">Mais popular</span>}
                    <h3 className="text-lg font-bold text-[var(--text-strong)]">{plan.name}</h3>
                    {plan.promoPrice != null ? (
                      <div className="mt-2">
                        {plan.promoLabel && (
                          <span className="app-badge app-badge-success mb-1 inline-block">{plan.promoLabel}</span>
                        )}
                        <div className="flex items-baseline gap-2">
                          <p className="text-3xl font-bold tracking-tight text-[var(--text-strong)]">
                            {fmt(plan.promoPrice, plan.currency)}
                          </p>
                          <p className="text-sm font-medium text-[var(--text-subtle)] line-through">
                            {fmt(plan.price, plan.currency)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--text-strong)]">
                        {plan.price === 0 ? "Grátis" : fmt(plan.price, plan.currency)}
                      </p>
                    )}
                    <p className="text-xs text-[var(--text-subtle)]">{plan.interval === "month" ? "por mês" : "pagamento único"}</p>
                    <ul className="mt-4 flex-1 space-y-2">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success-600)]" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => subscribe(plan)}
                      disabled={isActive || subscribing === plan.code || (plan.price > 0 && !acceptedRefundPolicy)}
                      className={`mt-5 w-full px-4 py-2.5 text-sm ${featured ? "app-btn-primary" : "app-btn-secondary"} disabled:opacity-60`}
                    >
                      {isActive ? "Plano atual" : subscribing === plan.code ? "A processar..." : plan.price === 0 ? "Selecionar" : "Subscrever"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
