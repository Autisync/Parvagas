"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/api";
import {
  createComplianceCheck,
  dismissComplianceCheck,
  fetchComplianceCategories,
  fetchComplianceChecks,
  resolveComplianceCheck,
  type ComplianceCategory,
  type ComplianceCheckRecord,
} from "../adminClient";
import {
  AdminAlert,
  AdminEmptyState,
  AdminPageHeader,
  AdminSpinner,
  adminButtonClass,
  adminFieldClass,
  adminSecondaryButtonClass,
} from "../components/AdminUI";
import InlineErrorState from "@/app/components/errors/InlineErrorState";
import { useAppNotifier } from "@/app/components/AppNotifier";

const SEVERITY_TONE: Record<string, string> = {
  none: "border-slate-200 bg-slate-50 text-slate-500",
  low: "border-sky-200 bg-sky-50 text-sky-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-red-300 bg-red-50 text-red-700",
};

const SEVERITY_LABEL: Record<string, string> = { none: "Sem alertas", low: "Baixa", medium: "Média", high: "Alta" };

const STATUS_LABEL: Record<string, string> = { open: "Em aberto", resolved: "Resolvido", dismissed: "Dispensado" };

function DocStatusPill({ status }: { status: "published" | "unpublished" | "missing" }) {
  if (status === "published") return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">publicado</span>;
  if (status === "unpublished") return <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">sem publicação</span>;
  return <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">documento em falta</span>;
}

const emptyForm = { featureName: "", featureDescription: "" };

export default function AdminComplianceAnalyzerPage() {
  const { token } = useAuth("admin");
  const { notify } = useAppNotifier();

  const [categories, setCategories] = useState<ComplianceCategory[]>([]);
  const [checks, setChecks] = useState<ComplianceCheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("open");

  const [form, setForm] = useState(emptyForm);
  const [intake, setIntake] = useState<Record<string, boolean>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ComplianceCheckRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (filter: string) => {
      if (!token) return;
      setLoading(true);
      setError("");
      try {
        const [cats, list] = await Promise.all([
          fetchComplianceCategories(token),
          fetchComplianceChecks(token, filter === "all" ? undefined : filter),
        ]);
        setCategories(cats.categories || []);
        setChecks(list.complianceChecks || []);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Erro ao carregar o analisador de conformidade."));
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load(statusFilter);
  }, [load, statusFilter]);

  const runAnalysis = async () => {
    if (!token) return;
    if (!form.featureName.trim() || !form.featureDescription.trim()) {
      notify("Descreva a funcionalidade antes de analisar.", "error");
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      const check = await createComplianceCheck(token, {
        featureName: form.featureName.trim(),
        featureDescription: form.featureDescription.trim(),
        intake,
      });
      setResult(check);
      setChecks((prev) => [check, ...prev]);
      notify(
        check.severitySummary === "none" ? "Análise concluída — nenhum ponto assinalado." : `Análise concluída — severidade ${SEVERITY_LABEL[check.severitySummary].toLowerCase()}.`,
        check.severitySummary === "high" ? "error" : "success",
      );
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao correr a análise."), "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const act = async (check: ComplianceCheckRecord, action: "resolve" | "dismiss") => {
    if (!token) return;
    setBusyId(check._id);
    try {
      const updated = action === "resolve" ? await resolveComplianceCheck(token, check._id) : await dismissComplianceCheck(token, check._id);
      setChecks((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
      if (result?._id === updated._id) setResult(updated);
      notify(action === "resolve" ? "Marcado como resolvido." : "Dispensado.", "success");
    } catch (err: unknown) {
      notify(getErrorMessage(err, "Erro ao atualizar a análise."), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Legal & Conformidade"
        title="Analisador de Conformidade"
        description="Antes de lançar uma nova funcionalidade, verifique se entra em conflito com os documentos legais atuais — ou se falta um documento para a cobrir."
      />

      <AdminAlert tone="warning">
        Este é um checklist automático baseado em regras, não uma opinião jurídica. Cruza as suas respostas com os
        documentos legais reais da plataforma e diz onde atualizar — não substitui revisão jurídica para casos
        sensíveis (ex.: menores de idade).
      </AdminAlert>

      {error ? <div className="mt-4"><InlineErrorState message={error} onAction={() => load(statusFilter)} /></div> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="app-card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Nova análise</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700">Nome da funcionalidade</label>
            <input className={adminFieldClass} value={form.featureName} onChange={(e) => setForm((f) => ({ ...f, featureName: e.target.value }))} placeholder="ex.: Alertas de emprego por WhatsApp" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Descrição</label>
            <textarea
              className={adminFieldClass}
              rows={4}
              value={form.featureDescription}
              onChange={(e) => setForm((f) => ({ ...f, featureDescription: e.target.value }))}
              placeholder="Descreva o que a funcionalidade faz, que dados usa, e quem a pode ver."
            />
          </div>

          {loading ? (
            <AdminSpinner />
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-slate-700">A funcionalidade...</legend>
              {categories.map((cat) => (
                <label key={cat.key} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(intake[cat.key])}
                    onChange={(e) => setIntake((prev) => ({ ...prev, [cat.key]: e.target.checked }))}
                  />
                  <span>{cat.question}</span>
                </label>
              ))}
            </fieldset>
          )}

          <button type="button" className={adminButtonClass} disabled={analyzing} onClick={runAnalysis}>
            {analyzing ? "A analisar..." : "Analisar"}
          </button>
        </div>

        <div className="app-card space-y-4 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Resultado</h2>
          {!result ? (
            <AdminEmptyState title="Sem análise ainda" description="Preencha o formulário e clique em Analisar." />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${SEVERITY_TONE[result.severitySummary]}`}>
                  Severidade: {SEVERITY_LABEL[result.severitySummary]}
                </span>
                <span className="text-xs text-slate-500">{STATUS_LABEL[result.status]}</span>
              </div>

              {result.findings.length === 0 ? (
                <p className="text-sm text-slate-600">Nenhum ponto assinalado pelo checklist para as respostas dadas.</p>
              ) : (
                <ul className="space-y-3">
                  {result.findings.map((finding) => (
                    <li key={finding.category} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_TONE[finding.severity]}`}>
                          {SEVERITY_LABEL[finding.severity]}
                        </span>
                        <span className="flex flex-wrap gap-1">
                          {finding.documents.map((d) => (
                            <span key={d.slug} className="flex items-center gap-1 text-[11px] text-slate-500">
                              {d.title || d.slug} <DocStatusPill status={d.status} />
                            </span>
                          ))}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-800">{finding.question}</p>
                      <p className="mt-1 text-sm text-slate-600">{finding.guidance}</p>
                    </li>
                  ))}
                </ul>
              )}

              {result.status === "open" ? (
                <div className="flex gap-3 border-t border-slate-100 pt-3">
                  <button type="button" className={adminSecondaryButtonClass} disabled={busyId === result._id} onClick={() => act(result, "dismiss")}>
                    Dispensar
                  </button>
                  <button type="button" className={adminButtonClass} disabled={busyId === result._id} onClick={() => act(result, "resolve")}>
                    Marcar como resolvido
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Histórico de análises</h2>
          <select className={`${adminFieldClass} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="open">Em aberto</option>
            <option value="resolved">Resolvidos</option>
            <option value="dismissed">Dispensados</option>
            <option value="all">Todos</option>
          </select>
        </div>

        {loading ? (
          <div className="mt-4"><AdminSpinner /></div>
        ) : checks.length === 0 ? (
          <div className="mt-4"><AdminEmptyState title="Sem análises" description="Ainda não existem análises com este estado." /></div>
        ) : (
          <ul className="mt-4 space-y-2">
            {checks.map((check) => (
              <li key={check._id} className="app-card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{check.featureName}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{check.featureDescription}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_TONE[check.severitySummary]}`}>
                    {SEVERITY_LABEL[check.severitySummary]}
                  </span>
                  <span className="text-xs text-slate-400">{STATUS_LABEL[check.status]}</span>
                  <button type="button" className={adminSecondaryButtonClass} onClick={() => setResult(check)}>
                    Ver
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
