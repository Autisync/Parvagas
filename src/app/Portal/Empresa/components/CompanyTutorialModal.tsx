"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch, setUser } from "@/lib/api";

type CompanyProfile = {
  name?: string;
  industry?: string;
  location?: string;
  contactEmail?: string;
  description?: string;
  logo?: string;
};

type Props = {
  token: string;
  userId: string;
  hasSeenTutorial?: boolean;
  onComplete?: () => void;
};

type TutorialStep = {
  id: string;
  title: string;
  description: string;
  highlight?: string;
};

const REPLAY_FLAG = "parvagas_company_tutorial_replay";

const steps: TutorialStep[] = [
  {
    id: "welcome",
    title: "Bem-vindo ao Portal Empresa",
    description:
      "Este guia mostra os atalhos essenciais para publicar vagas, gerir candidaturas e colaborar com a sua equipa.",
    highlight: "Dica: pode sair agora e retomar no mesmo passo a qualquer momento.",
  },
  {
    id: "profile",
    title: "Complete o perfil da empresa",
    description:
      "Preencha dados de contacto, descrição e identidade visual para aumentar a confiança dos candidatos e acelerar a aprovação.",
  },
  {
    id: "jobs",
    title: "Publique vagas com qualidade",
    description:
      "Use Nova vaga para criar pedidos claros com responsabilidades, requisitos e competências. Vagas mais completas atraem melhores candidaturas.",
  },
  {
    id: "applications",
    title: "Acompanhe candidaturas",
    description:
      "No menu Candidaturas, filtre por estado e responda rapidamente para manter o pipeline ativo.",
  },
  {
    id: "team_and_notifications",
    title: "Colabore com a equipa",
    description:
      "Configure utilizadores e use o sino de notificações para mensagens internas e alertas operacionais.",
    highlight: "Pode reabrir este tutorial em Definições quando quiser.",
  },
];

const profileFieldLabels: Array<[keyof CompanyProfile, string]> = [
  ["name", "Nome da empresa"],
  ["industry", "Setor"],
  ["location", "Localização"],
  ["contactEmail", "Email de contacto"],
  ["description", "Descrição da empresa"],
  ["logo", "Logótipo"],
];

export default function CompanyTutorialModal({ token, userId, hasSeenTutorial, onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [missingProfileFields, setMissingProfileFields] = useState<string[]>([]);

  const stepStorageKey = useMemo(() => `parvagas_company_tutorial_step_${userId || "anonymous"}`, [userId]);

  useEffect(() => {
    if (!token) return;
    const replayFlag = typeof window !== "undefined" ? localStorage.getItem(REPLAY_FLAG) : null;

    if (replayFlag === "1") {
      const savedStep = Number(localStorage.getItem(stepStorageKey) || 0);
      setStepIndex(Number.isFinite(savedStep) ? Math.min(Math.max(savedStep, 0), steps.length - 1) : 0);
      setOpen(true);
      localStorage.removeItem(REPLAY_FLAG);
      return;
    }

    if (!hasSeenTutorial) {
      const savedStep = Number(localStorage.getItem(stepStorageKey) || 0);
      setStepIndex(Number.isFinite(savedStep) ? Math.min(Math.max(savedStep, 0), steps.length - 1) : 0);
      setOpen(true);
    }
  }, [hasSeenTutorial, stepStorageKey, token]);

  useEffect(() => {
    const openTutorial = () => {
      const savedStep = Number(localStorage.getItem(stepStorageKey) || 0);
      setStepIndex(Number.isFinite(savedStep) ? Math.min(Math.max(savedStep, 0), steps.length - 1) : 0);
      setOpen(true);
    };

    window.addEventListener("parvagas:open-company-tutorial", openTutorial);
    return () => window.removeEventListener("parvagas:open-company-tutorial", openTutorial);
  }, [stepStorageKey]);

  useEffect(() => {
    if (!open || !token) return;
    authFetch<{ company?: CompanyProfile }>("/companies/profile", token, { suppressGlobalErrors: true })
      .then((res) => {
        const company = res.company || {};
        const missing = profileFieldLabels
          .filter(([field]) => !String(company[field] || "").trim())
          .map(([, label]) => label);
        setMissingProfileFields(missing);
      })
      .catch(() => setMissingProfileFields([]));
  }, [open, token]);

  const currentStep = steps[stepIndex];
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);
  const isLast = stepIndex === steps.length - 1;

  const persistStep = (value: number) => {
    localStorage.setItem(stepStorageKey, String(value));
  };

  const handleCloseAndSaveProgress = () => {
    persistStep(stepIndex);
    setOpen(false);
  };

  const handleNext = () => {
    if (isLast) return;
    const next = Math.min(stepIndex + 1, steps.length - 1);
    setStepIndex(next);
    persistStep(next);
  };

  const handleBack = () => {
    const previous = Math.max(stepIndex - 1, 0);
    setStepIndex(previous);
    persistStep(previous);
  };

  const handleComplete = async () => {
    try {
      setSaving(true);
      await authFetch("/companies/tutorial/seen", token, { method: "PATCH" });
      const previous = JSON.parse(localStorage.getItem("parvagas_user") || "null") || {};
      setUser({ ...previous, hasSeenEmpresaTutorial: true });
      localStorage.removeItem(stepStorageKey);
      setOpen(false);
      onComplete?.();
    } catch {
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Guia de onboarding</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">{currentStep.title}</h2>
            <p className="mt-2 text-sm text-slate-600">Passo {stepIndex + 1} de {steps.length}</p>
          </div>
          <button
            type="button"
            onClick={handleCloseAndSaveProgress}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>

        <div className="mt-4 h-2 w-full rounded-full bg-slate-200">
          <div className="h-2 rounded-full bg-red-600 transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">{currentStep.description}</p>
          {currentStep.highlight ? <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{currentStep.highlight}</p> : null}

          {currentStep.id === "profile" ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Campos de perfil por completar:</p>
              {missingProfileFields.length === 0 ? (
                <p className="mt-1">Excelente: o perfil essencial já está completo.</p>
              ) : (
                <ul className="mt-2 list-disc pl-5">
                  {missingProfileFields.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleCloseAndSaveProgress}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Guardar e sair
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              disabled={stepIndex === 0}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Voltar
            </button>
            {!isLast ? (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Seguinte
              </button>
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                disabled={saving}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {saving ? "A guardar..." : "Concluir tutorial"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
