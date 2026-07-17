"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchRaw, setToken, setUser } from "@/lib/api";
import { getRecaptchaToken } from "@/lib/recaptcha";
import FeedbackAlert from "@/app/components/errors/FeedbackAlert";

type OtpRequestResponse = { sent?: boolean; devCode?: string };

type OtpVerifyResponse = {
  access_token?: string;
  refresh_token?: string;
  user: {
    id?: string;
    _id?: string;
    email: string;
    role: string;
    full_name?: string;
    fullName?: string;
    has_completed_onboarding?: boolean;
    hasCompletedOnboarding?: boolean;
  };
};

function portalRoute(role: string): string {
  if (role === "company") return "/Portal/Empresa/Perfil";
  return "/Portal/Candidato";
}

/** Phone/OTP login tab — the backend flow is complete (rate-limited,
 * captcha-gated, dev-mode code exposure for local testing, creates a
 * candidate account on first verify) but ships gated off; this component
 * itself is only rendered when NEXT_PUBLIC_OTP_LOGIN_ENABLED is set, and
 * the backend re-checks the OTP_LOGIN_ENABLED flag independently. */
export default function PhoneLoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [feedback, setFeedback] = useState<{ variant: "error" | "info"; message: string } | null>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      const captchaToken = await getRecaptchaToken("otp_request");
      const res = await apiFetchRaw("/auth/otp/request", {
        method: "POST",
        suppressGlobalErrors: true,
        headers: {
          "Content-Type": "application/json",
          ...(captchaToken ? { "x-captcha-token": captchaToken } : {}),
        },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (body as { detail?: string; error?: string }).detail || (body as { error?: string }).error;
        throw new Error(detail || "Não foi possível enviar o código.");
      }
      const data = body as OtpRequestResponse;
      if (data.devCode) setDevCode(data.devCode);
      setStep("code");
      setFeedback({ variant: "info", message: "Enviámos um código de 6 dígitos para o seu telemóvel." });
    } catch (err: unknown) {
      setFeedback({ variant: "error", message: err instanceof Error ? err.message : "Não foi possível enviar o código." });
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      const captchaToken = await getRecaptchaToken("otp_verify");
      const res = await apiFetchRaw("/auth/otp/verify", {
        method: "POST",
        suppressGlobalErrors: true,
        headers: {
          "Content-Type": "application/json",
          ...(captchaToken ? { "x-captcha-token": captchaToken } : {}),
        },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (body as { detail?: string; error?: string }).detail || (body as { error?: string }).error;
        throw new Error(detail || "Código inválido ou expirado.");
      }
      const data = body as OtpVerifyResponse;
      const token = String(data.access_token || "").trim();
      if (!token) throw new Error("Resposta de autenticação inválida.");
      setToken(token, data.refresh_token);
      setUser({
        id: String(data.user.id || data.user._id || ""),
        email: data.user.email,
        role: data.user.role,
        name: data.user.fullName || data.user.full_name,
        hasCompletedOnboarding: data.user.hasCompletedOnboarding ?? data.user.has_completed_onboarding ?? false,
      });
      router.replace(portalRoute(data.user.role));
    } catch (err: unknown) {
      setFeedback({ variant: "error", message: err instanceof Error ? err.message : "Código inválido ou expirado." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {feedback ? (
        <FeedbackAlert variant={feedback.variant} message={feedback.message} onDismiss={() => setFeedback(null)} />
      ) : null}

      {step === "phone" ? (
        <form className="space-y-4" onSubmit={requestCode} noValidate>
          <div>
            <label htmlFor="otp-phone" className="block text-sm font-semibold text-slate-800">Número de telemóvel</label>
            <input
              id="otp-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              placeholder="+351 912 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "A enviar..." : "Enviar código"}
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={verifyCode} noValidate>
          <div>
            <label htmlFor="otp-code" className="block text-sm font-semibold text-slate-800">Código de 6 dígitos</label>
            <input
              id="otp-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-center text-lg tracking-[0.5em] text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
            />
            {devCode ? <p className="mt-1 text-xs text-slate-400">Ambiente de testes — código: {devCode}</p> : null}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "A verificar..." : "Confirmar código"}
          </button>
          <button
            type="button"
            onClick={() => { setStep("phone"); setCode(""); setFeedback(null); }}
            className="w-full text-center text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            Usar outro número
          </button>
        </form>
      )}
    </div>
  );
}
