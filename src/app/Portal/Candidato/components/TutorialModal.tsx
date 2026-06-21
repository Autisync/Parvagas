"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  XMarkIcon,
  MapPinIcon,
  MagnifyingGlassIcon,
  DocumentArrowUpIcon,
  BellIcon,
  UserCircleIcon,
  BriefcaseIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { authFetch, getUser, setUser } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

export type TutorialStep = {
  id: number;
  icon: React.ReactNode;
  colorClass: string; // Tailwind bg class for icon ring
  title: string;
  titleEn: string;
  body: string;
  bodyEn: string;
  tip?: string;
  tipEn?: string;
  /** optional illustrated screenshot hint path */
  hint?: string;
};

// ── Copy ─────────────────────────────────────────────────────────────────────

const STEPS: TutorialStep[] = [
  {
    id: 1,
    icon: <MapPinIcon className="h-7 w-7" />,
    colorClass: "bg-red-600",
    title: "Bem-vindo ao Parvagas",
    titleEn: "Welcome to Parvagas",
    body: "O Parvagas é a plataforma angolana que conecta candidatos a oportunidades de emprego em Angola e Portugal. Aqui pode criar o seu perfil profissional, pesquisar vagas e candidatar-se com um clique.",
    bodyEn: "Parvagas is the platform connecting job seekers to opportunities across Angola and Portugal. Create your professional profile, browse vacancies and apply in one click.",
    tip: "A plataforma está disponível em Português e Inglês — altere o idioma no menu superior.",
    tipEn: "The platform is available in Portuguese and English — switch languages in the top menu.",
  },
  {
    id: 2,
    icon: <UserCircleIcon className="h-7 w-7" />,
    colorClass: "bg-red-600",
    title: "O seu perfil profissional",
    titleEn: "Your professional profile",
    body: 'Na secção "Meu Perfil" pode preencher as suas informações pessoais, competências, experiência profissional e educação — mesmo sem ter um CV. Pode guardar o progresso e retomar mais tarde.',
    bodyEn: 'Under "Meu Perfil" you can fill in personal details, skills, work experience and education — even without a CV. Save progress and continue later.',
    tip: 'Use a barra lateral esquerda para navegar para "Meu Perfil" a qualquer momento.',
    tipEn: 'Use the left sidebar to navigate to "Meu Perfil" at any time.',
  },
  {
    id: 3,
    icon: <MagnifyingGlassIcon className="h-7 w-7" />,
    colorClass: "bg-red-600",
    title: "Pesquisar vagas de emprego",
    titleEn: "Search for jobs",
    body: 'Em "Vagas Disponíveis" pode pesquisar por palavra-chave, localização, categoria, tipo de contrato e muito mais. Guarde as vagas que lhe interessam clicando no ícone de coração.',
    bodyEn: 'Under "Vagas Disponíveis" search by keyword, location, category, contract type and more. Save interesting vacancies by clicking the heart icon.',
    tip: "Vagas destacadas aparecem no seu Dashboard com base no seu perfil.",
    tipEn: "Highlighted vacancies appear on your Dashboard based on your profile.",
  },
  {
    id: 4,
    icon: <BriefcaseIcon className="h-7 w-7" />,
    colorClass: "bg-red-600",
    title: "Candidatar-se a uma vaga",
    titleEn: "Apply for a job",
    body: 'Ao abrir uma vaga, clique em "Candidatar-me" para submeter a sua candidatura. Pode acompanhar o estado de todas as suas candidaturas na secção "Candidaturas".',
    bodyEn: 'Open any vacancy and click "Candidatar-me" to submit your application. Track the status of all applications under "Candidaturas".',
    tip: "Mantenha o perfil actualizado para aumentar as suas hipóteses de ser contactado.",
    tipEn: "Keep your profile up-to-date to improve your chances of being contacted.",
  },
  {
    id: 5,
    icon: <BellIcon className="h-7 w-7" />,
    colorClass: "bg-red-600",
    title: "Alertas e notificações",
    titleEn: "Alerts and notifications",
    body: 'Em "Alertas" pode criar alertas personalizados para receber novas vagas por email. Em "Definições" pode gerir as suas preferências de notificação.',
    bodyEn: 'Under "Alertas" create personalised job alerts to receive new vacancies by email. Under "Definições" manage your notification preferences.',
    tip: "Active os alertas para nunca perder uma oportunidade relevante.",
    tipEn: "Enable alerts so you never miss a relevant opportunity.",
  },
  {
    id: 6,
    icon: <DocumentArrowUpIcon className="h-7 w-7" />,
    colorClass: "bg-red-600",
    title: "Carregar ou criar o seu CV",
    titleEn: "Upload or build your CV",
    body: 'Opcionalmente, pode carregar um CV em PDF ou DOCX e o sistema preencherá automaticamente o seu perfil. Em alternativa, descarregue o nosso modelo de CV e preencha-o. O carregamento é completamente opcional — já pode usar a plataforma sem CV.',
    bodyEn: 'Optionally upload a CV in PDF or DOCX format and the system will auto-fill your profile. Alternatively, download our CV template and fill it in. Upload is entirely optional — you can use the platform without a CV.',
    tip: 'Aceda a "Configurar Perfil" na barra lateral para iniciar o assistente de preenchimento.',
    tipEn: 'Go to "Configurar Perfil" in the sidebar to start the profile setup wizard.',
  },
];

// ── Illustrations (simple SVG blobs, inline) ──────────────────────────────────

const STEP_ILLUSTRATIONS: Record<number, React.ReactNode> = {
  1: (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <rect width="200" height="120" rx="12" fill="#fef2f2" />
      <circle cx="100" cy="48" r="28" fill="#fecaca" />
      <circle cx="100" cy="48" r="16" fill="#ef4444" />
      <path d="M76 80 Q100 60 124 80" stroke="#ef4444" strokeWidth="3" fill="none" strokeLinecap="round" />
      <text x="100" y="110" textAnchor="middle" fontSize="10" fill="#9ca3af">Parvagas</text>
    </svg>
  ),
  2: (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <rect width="200" height="120" rx="12" fill="#fef2f2" />
      <rect x="20" y="20" width="60" height="80" rx="8" fill="#fecaca" />
      <rect x="28" y="32" width="44" height="6" rx="3" fill="#ef4444" />
      <rect x="28" y="44" width="32" height="4" rx="2" fill="#fca5a5" />
      <rect x="28" y="54" width="36" height="4" rx="2" fill="#fca5a5" />
      <rect x="28" y="64" width="28" height="4" rx="2" fill="#fca5a5" />
      <rect x="100" y="20" width="80" height="80" rx="8" fill="#fff7ed" />
      <circle cx="140" cy="50" r="14" fill="#fed7aa" />
      <rect x="112" y="70" width="56" height="6" rx="3" fill="#fb923c" />
      <rect x="118" y="82" width="44" height="4" rx="2" fill="#fdba74" />
    </svg>
  ),
  3: (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <rect width="200" height="120" rx="12" fill="#fef2f2" />
      <rect x="14" y="14" width="172" height="34" rx="8" fill="#fee2e2" />
      <rect x="24" y="24" width="100" height="14" rx="4" fill="#fca5a5" />
      <rect x="134" y="24" width="40" height="14" rx="4" fill="#ef4444" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x="14" y={58 + i * 22} width="172" height="16" rx="6" fill={i === 0 ? "#fee2e2" : "#fff7f7"} />
      ))}
      <rect x="20" y="62" width="60" height="8" rx="3" fill="#fca5a5" />
      <rect x="20" y="84" width="80" height="8" rx="3" fill="#e5e7eb" />
      <rect x="20" y="106" width="50" height="8" rx="3" fill="#e5e7eb" />
    </svg>
  ),
  4: (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <rect width="200" height="120" rx="12" fill="#fef2f2" />
      <rect x="20" y="16" width="160" height="88" rx="10" fill="#fff" stroke="#fca5a5" strokeWidth="1.5" />
      <rect x="32" y="30" width="80" height="10" rx="4" fill="#fca5a5" />
      <rect x="32" y="46" width="136" height="6" rx="3" fill="#e5e7eb" />
      <rect x="32" y="58" width="110" height="6" rx="3" fill="#e5e7eb" />
      <rect x="32" y="70" width="120" height="6" rx="3" fill="#e5e7eb" />
      <rect x="108" y="84" width="56" height="14" rx="6" fill="#ef4444" />
      <text x="136" y="95" textAnchor="middle" fontSize="7" fill="#fff">Candidatar-me</text>
    </svg>
  ),
  5: (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <rect width="200" height="120" rx="12" fill="#fef2f2" />
      <circle cx="100" cy="50" r="30" fill="#fee2e2" />
      <path d="M87 50 L96 59 L116 42" stroke="#ef4444" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="30" y="88" width="140" height="12" rx="6" fill="#fecaca" />
      <circle cx="46" cy="94" r="5" fill="#ef4444" />
      <circle cx="100" cy="94" r="5" fill="#ef4444" />
      <circle cx="154" cy="94" r="5" fill="#ef4444" />
    </svg>
  ),
  6: (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      <rect width="200" height="120" rx="12" fill="#fef2f2" />
      <rect x="54" y="16" width="92" height="88" rx="8" fill="#fff" stroke="#fca5a5" strokeWidth="1.5" />
      <rect x="64" y="28" width="72" height="8" rx="3" fill="#fca5a5" />
      <rect x="64" y="42" width="60" height="4" rx="2" fill="#e5e7eb" />
      <rect x="64" y="52" width="68" height="4" rx="2" fill="#e5e7eb" />
      <rect x="64" y="62" width="52" height="4" rx="2" fill="#e5e7eb" />
      <rect x="64" y="76" width="72" height="16" rx="6" fill="#ef4444" />
      <path d="M94 84 L100 78 L106 84" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M100 78 L100 90" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

// ── Modal ─────────────────────────────────────────────────────────────────────

export interface TutorialModalProps {
  /** token needed to call PATCH /candidates/tutorial/seen */
  token: string;
  /** called after completion or skip */
  onDone: () => void;
  /** force start from step 1 (replay) */
  forceReplay?: boolean;
  /** Portuguese (default) or English */
  lang?: "pt" | "en";
}

const STORAGE_KEY = "parvagas_tutorial_step";

export default function TutorialModal({ token, onDone, forceReplay = false, lang = "pt" }: TutorialModalProps) {
  const router = useRouter();
  const isPt = lang !== "en";

  // Restore progress from localStorage unless replaying
  const initialStep = forceReplay
    ? 1
    : Math.min(Math.max(1, parseInt(localStorage.getItem(STORAGE_KEY) || "1", 10)), STEPS.length);

  const [step, setStep] = useState(initialStep);
  const [closing, setClosing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  const current = STEPS[step - 1];
  const isLast = step === STEPS.length;
  const isFirst = step === 1;

  // Save progress
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(step));
  }, [step]);

  // Focus trap
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { handleClose(); return; }
      if (e.key === "ArrowRight" || (e.key === "Enter" && document.activeElement === nextBtnRef.current)) {
        if (!isLast) setStep((s) => s + 1);
        return;
      }
      if (e.key === "ArrowLeft") {
        if (!isFirst) setStep((s) => s - 1);
        return;
      }
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    nextBtnRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const markSeen = useCallback(async () => {
    try {
      await authFetch("/candidates/tutorial/seen", token, { method: "PATCH", body: JSON.stringify({}) });
      const stored = getUser();
      if (stored) setUser({ ...stored, hasSeenTutorial: true });
    } catch { /* silently fail — non-critical */ }
    localStorage.removeItem(STORAGE_KEY);
  }, [token]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(async () => {
      await markSeen();
      onDone();
    }, 260);
  }, [markSeen, onDone]);

  const handleFinish = useCallback(async () => {
    setClosing(true);
    setTimeout(async () => {
      await markSeen();
      onDone();
    }, 260);
  }, [markSeen, onDone]);

  const pt = (ptStr: string, enStr: string) => (isPt ? ptStr : enStr);

  return (
    <>
      {/* Backdrop — blocks interaction with underlying page */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          closing ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-body"
        ref={modalRef}
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
          closing ? "opacity-0 scale-95" : "opacity-100 scale-100"
        }`}
      >
        <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">
          {/* Red accent bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-red-500 to-red-700" />

          {/* Progress bar */}
          <div className="h-1 w-full bg-slate-100">
            <div
              className="h-full bg-red-600 transition-all duration-500"
              style={{ width: `${(step / STEPS.length) * 100}%` }}
            />
          </div>

          {/* Skip button */}
          <button
            type="button"
            onClick={handleClose}
            aria-label={pt("Fechar tutorial", "Close tutorial")}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>

          {/* Step counter */}
          <div className="absolute left-5 top-5 flex items-center gap-1">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                aria-label={pt(`Ir para passo ${s.id}`, `Go to step ${s.id}`)}
                aria-current={s.id === step ? "step" : undefined}
                className={`h-2 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-red-400 ${
                  s.id === step
                    ? "w-6 bg-red-600"
                    : s.id < step
                    ? "w-2 bg-red-300"
                    : "w-2 bg-slate-200"
                }`}
              />
            ))}
          </div>

          {/* Illustration */}
          <div className="mt-8 px-8">
            <div className="mx-auto h-32 w-full max-w-xs overflow-hidden rounded-2xl">
              {STEP_ILLUSTRATIONS[step]}
            </div>
          </div>

          {/* Content */}
          <div className="px-8 pb-4 pt-6">
            {/* Icon + title */}
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${current.colorClass} text-white shadow`}>
                {current.icon}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-red-500">
                  {pt(`Passo ${step} de ${STEPS.length}`, `Step ${step} of ${STEPS.length}`)}
                </p>
                <h2
                  id="tutorial-title"
                  className="mt-0.5 text-xl font-extrabold leading-tight text-slate-900"
                >
                  {pt(current.title, current.titleEn)}
                </h2>
              </div>
            </div>

            {/* Body */}
            <p id="tutorial-body" className="mt-4 text-sm leading-relaxed text-slate-600">
              {pt(current.body, current.bodyEn)}
            </p>

            {/* Tip */}
            {(current.tip || current.tipEn) && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-red-50 px-4 py-3">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <CheckIcon className="h-3 w-3 text-red-600" />
                </div>
                <p className="text-xs leading-relaxed text-red-700">
                  {pt(current.tip || "", current.tipEn || "")}
                </p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between border-t border-slate-100 px-8 py-4">
            {/* Skip */}
            <button
              type="button"
              onClick={handleClose}
              className="text-xs font-semibold text-slate-500 transition hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-red-300 rounded"
            >
              {pt("Saltar tutorial", "Skip tutorial")}
            </button>

            <div className="flex items-center gap-2">
              {/* Previous */}
              {!isFirst && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-red-400"
                  aria-label={pt("Passo anterior", "Previous step")}
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                </button>
              )}

              {/* Next / Finish */}
              {isLast ? (
                <button
                  ref={nextBtnRef}
                  type="button"
                  onClick={handleFinish}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
                >
                  <CheckIcon className="h-4 w-4" />
                  {pt("Começar a usar", "Get started")}
                </button>
              ) : (
                <button
                  ref={nextBtnRef}
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
                >
                  {pt("Seguinte", "Next")}
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
