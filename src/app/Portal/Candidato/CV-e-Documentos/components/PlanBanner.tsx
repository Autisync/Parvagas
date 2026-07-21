"use client";

import { useEffect, useState } from "react";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { authFetch } from "@/lib/api";
import RefundDisclosureNotice from "@/app/Portal/components/RefundDisclosureNotice";
import type { CVPlan, CVPlansResponse, CVSubResponse } from "./types";

// Subscription banner for the CV Builder — shows the current plan when active,
// or an upsell + plan picker modal when the candidate is still on the free tier.
export default function PlanBanner({ token }: { token: string | null }) {
  const [sub, setSub] = useState<CVSubResponse["subscription"] | null>(null);
  const [plans, setPlans] = useState<CVPlan[]>([]);
  const [open, setOpen] = useState(false);
  const [subscribing, setSubscribing] = useState("");
  const [provider, setProvider] = useState("multicaixa");
  const [instructions, setInstructions] = useState<{ message: string; reference: string } | null>(null);
  const [acceptedRefundPolicy, setAcceptedRefundPolicy] = useState(false);

  useEffect(() => {
    authFetch<CVPlansResponse>("/cv-builder/plans", "").catch(() => null).then((r) => setPlans(r?.plans || []));
    if (!token) return;
    authFetch<CVSubResponse>("/cv-builder/subscription", token).catch(() => null).then((r) => {
      if (r?.subscription) setSub(r.subscription);
    });
  }, [token]);

  const currentTier = sub?.tier ?? "free";

  const handleSubscribe = async (tier: string, price: number) => {
    if (!token) return;
    if (price > 0 && !acceptedRefundPolicy) return;
    setSubscribing(tier);
    setInstructions(null);
    try {
      const res = await authFetch<{ activated?: boolean; instructions?: { message: string; reference: string } }>(
        "/cv-builder/subscribe",
        token,
        { method: "POST", body: JSON.stringify({ tier, provider }) },
      );
      if (res.activated) {
        setSub((prev) => ({ ...(prev ?? { tier, status: "active", plan: plans.find((p) => p.tier === tier) ?? { tier, name: tier, price: 0, features: [] } }), tier, status: "active" }));
        setOpen(false);
      } else if (res.instructions) {
        setInstructions(res.instructions);
      }
    } catch {
      /* handled by global notifier */
    } finally {
      setSubscribing("");
    }
  };

  if (currentTier !== "free" && sub?.status === "active") {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <span className="text-green-700 text-lg">✓</span>
        <div>
          <p className="text-sm font-semibold text-green-800">Plano {sub.plan?.name ?? currentTier} ativo</p>
          {sub.currentPeriodEnd && (
            <p className="text-xs text-green-600">Válido até {new Date(sub.currentPeriodEnd).toLocaleDateString("pt-PT")}</p>
          )}
        </div>
        <button type="button" onClick={() => setOpen(true)} className="ml-auto text-xs text-green-700 underline">
          Gerir plano
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
          <LockClosedIcon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">Desbloqueie o Construtor de CV completo</p>
          <p className="mt-0.5 text-xs text-slate-600">
            Plano Pro (15 000 AOA/mês) — 3 CVs, pontuação IA, export DOCX/PDF, cartas de apresentação.
            Plano Premium (30 000 AOA/mês) — tudo ilimitado + candidatura automática.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
        >
          Ver planos
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Planos CV Builder</h2>
              <button type="button" onClick={() => { setOpen(false); setInstructions(null); }} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {instructions ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-900">Instruções de pagamento</p>
                <p className="mt-2 text-sm text-blue-800">{instructions.message}</p>
                <p className="mt-1 text-xs text-blue-600">Referência: <strong>{instructions.reference}</strong></p>
                <p className="mt-2 text-xs text-blue-600">O plano ativa automaticamente após confirmação do pagamento pelo administrador.</p>
                <button type="button" onClick={() => { setOpen(false); setInstructions(null); }} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Método de pagamento</label>
                  <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="multicaixa">Multicaixa Express</option>
                    <option value="unitel_money">Unitel Money</option>
                    <option value="bank">Transferência bancária</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div className="mb-4">
                  <RefundDisclosureNotice audience="candidate" checked={acceptedRefundPolicy} onChange={setAcceptedRefundPolicy} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {plans.map((plan) => (
                    <div
                      key={plan.tier}
                      className={`rounded-xl border p-4 flex flex-col gap-3 ${plan.tier === currentTier ? "border-red-300 bg-red-50" : "border-slate-200"}`}
                    >
                      <div>
                        <p className="font-bold text-slate-900">{plan.name}</p>
                        <p className="text-xl font-bold text-red-600 mt-1">
                          {plan.price === 0 ? "Grátis" : `${plan.price.toLocaleString("pt-PT")} AOA`}
                          {plan.price > 0 && <span className="text-xs font-normal text-slate-500">/mês</span>}
                        </p>
                      </div>
                      <ul className="space-y-1 flex-1">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-1.5 text-xs text-slate-600">
                            <span className="text-green-500">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        disabled={plan.tier === currentTier || subscribing === plan.tier || (plan.price > 0 && !acceptedRefundPolicy)}
                        onClick={() => handleSubscribe(plan.tier, plan.price)}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                          plan.tier === currentTier
                            ? "bg-slate-100 text-slate-400 cursor-default"
                            : "bg-red-600 text-white hover:bg-red-700"
                        }`}
                      >
                        {plan.tier === currentTier ? "Plano atual" : subscribing === plan.tier ? "A processar…" : plan.price === 0 ? "Selecionar grátis" : "Subscrever"}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
