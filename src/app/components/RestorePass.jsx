"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircleIcon, EnvelopeIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { useClientLocale } from "@/lib/i18n/client";
import FormFieldError from "@/app/components/errors/FormFieldError";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RestorePass() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState("idle"); // "idle" | "loading" | "sent"
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { dict } = useClientLocale();
  const emailRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setEmail("");
    setStep("idle");
    setError("");
    setSubmitted(false);
    setTouched(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (step === "sent") closeRef.current?.focus();
      else emailRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [open, step]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitted(true);
    const trimmed = email.trim();
    if (!trimmed) { setError(dict.auth.resetDialog.errorEmailRequired); return; }
    if (!emailRegex.test(trimmed)) { setError(dict.auth.resetDialog.errorEmailInvalid); return; }

    setStep("loading");
    try {
      const captchaToken = await getRecaptchaToken("forgot_password");
      await apiFetch("/auth/forgot-password", {
        method: "POST",
        suppressGlobalErrors: true,
        headers: captchaToken ? { "x-captcha-token": captchaToken } : {},
        body: JSON.stringify({ email: trimmed }),
      });
      setStep("sent");
    } catch {
      setStep("idle");
      setError("Não foi possível enviar o pedido. Tente novamente.");
    }
  };

  const modal = open && isMounted
    ? createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          onClick={close}
          aria-hidden="true"
        />

        <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
          <button
            type="button"
            onClick={close}
            className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>

          {step !== "sent" ? (
            <form onSubmit={handleSubmit} noValidate className="p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50">
                <EnvelopeIcon className="h-5 w-5 text-red-600" />
              </div>
              <h2 id="restore-title" className="text-lg font-bold text-slate-900">
                {dict.auth.resetDialog.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                {dict.auth.resetDialog.helper}
              </p>

              <div className="mt-5">
                <label htmlFor="restore-email" className="block text-sm font-semibold text-slate-700">
                  {dict.auth.resetDialog.emailLabel}
                </label>
                <input
                  ref={emailRef}
                  id="restore-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
                  onBlur={() => setTouched(true)}
                  aria-invalid={Boolean((submitted || touched) && error)}
                  aria-describedby="restore-email-error"
                  placeholder="email@exemplo.com"
                  className={[
                    "mt-1.5 block w-full rounded-xl border px-3 py-2.5 text-sm text-slate-900 outline-none transition",
                    (submitted || touched) && error
                      ? "border-rose-400 bg-rose-50 focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                      : "border-slate-300 bg-white focus:border-red-300 focus:ring-4 focus:ring-red-100",
                  ].join(" ")}
                />
                <FormFieldError id="restore-email-error" message={(submitted || touched) ? error : ""} />
              </div>

              <button
                type="submit"
                disabled={step === "loading"}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {step === "loading" ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                    {dict.auth.resetDialog.sending}
                  </>
                ) : dict.auth.resetDialog.submit}
              </button>
            </form>
          ) : (
            <div className="flex flex-col items-center px-6 py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
                <CheckCircleIcon className="h-7 w-7 text-emerald-500" />
              </div>
              <h2 id="restore-title" className="mt-4 text-lg font-bold text-slate-900">
                Verifique o seu email
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Se existir uma conta com{" "}
                <span className="font-semibold text-slate-700">{email}</span>,{" "}
                receberá um link de recuperação em breve.
              </p>
              <p className="mt-1 text-xs text-slate-400">Verifique também a pasta de spam.</p>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-300"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => { setStep("idle"); setSubmitted(false); setTouched(false); setError(""); }}
                className="mt-2.5 text-xs text-slate-400 transition hover:text-red-500"
              >
                Tentar com outro email
              </button>
            </div>
          )}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <button
        type="button"
        className="text-sm font-normal text-red-500 transition-colors hover:text-red-400"
        onClick={() => setOpen(true)}
      >
        {dict.auth.resetDialog.trigger}
      </button>
      {modal}
    </>
  );
}
