"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, apiFetch, getErrorMessage } from "@/lib/api";
import { useAppNotifier } from "@/app/components/AppNotifier";
import { CheckIcon } from "@heroicons/react/24/outline";
import { SuccessCheck } from "@/app/components/motion";
import { track } from "@/lib/analytics";

const CompanySidebar = dynamic(() => import("../components/CompanySidebar"), {
  ssr: false,
  loading: () => <div className="h-80 app-card p-4" />,
});

type Plan = {
  _id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
  features: string[];
};

type Subscription = {
  _id: string;
  status: string;
  plan?: { code?: string; name?: string } | null;
  currentPeriodEnd?: string | null;
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

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-7xl px-6 pb-24 lg:pb-16 pt-8">
        <div className="grid gap-6 lg:grid-cols-[260px,1fr] lg:items-start">
          <CompanySidebar />
          <div className="space-y-6">
            <header>
              <h1 className="text-2xl font-bold text-[var(--text-strong)] sm:text-3xl">Planos &amp; Faturação</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Escolha o plano que se adequa ao seu recrutamento. Pague localmente via Multicaixa Express, Unitel Money ou transferência.
              </p>
            </header>

            {subscription?.status === "active" && (
              <div className="app-card flex items-center gap-3 border-emerald-200 bg-[var(--success-50)] p-4">
                <SuccessCheck size={28} tone="success" />
                <p className="text-sm font-medium text-[var(--success-700)]">
                  Plano ativo: <strong>{subscription.plan?.name}</strong>
                  {subscription.currentPeriodEnd ? ` · renova em ${new Date(subscription.currentPeriodEnd).toLocaleDateString("pt-PT")}` : ""}
                </p>
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
                      <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--text-strong)]">
                        {plan.price === 0 ? "Grátis" : fmt(plan.price, plan.currency)}
                      </p>
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
                        disabled={isActive || subscribing === plan.code}
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
        </div>
      </main>
    </div>
  );
}
