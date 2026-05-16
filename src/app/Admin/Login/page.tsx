"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const Logo = "/icon2.png";
import Reset from "@/app/components/RestorePass";
import { apiFetchRaw, setToken, setUser } from "@/lib/api";
import FormFieldError from "@/app/components/errors/FormFieldError";
import FeedbackAlert, { type FeedbackVariant } from "@/app/components/errors/FeedbackAlert";

type LoginResponse = {
  token: string;
  user: {
    id?: string;
    _id?: string;
    email: string;
    role: string;
    fullName?: string;
    adminLevel?: "super-admin" | "moderator";
  };
};

type FirstLoginResetChallenge = {
  requiresPasswordReset: boolean;
  resetToken: string;
};

type FormFeedback = {
  variant: FeedbackVariant;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

function validatePasswordStrength(password: string): string {
  if (password.length < 8) return "A nova password deve ter pelo menos 8 caracteres.";
  if (!/[A-Z]/.test(password)) return "A nova password deve incluir pelo menos 1 letra maiúscula.";
  if (!/[a-z]/.test(password)) return "A nova password deve incluir pelo menos 1 letra minúscula.";
  if (!/[0-9]/.test(password)) return "A nova password deve incluir pelo menos 1 número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "A nova password deve incluir pelo menos 1 símbolo.";
  return "";
}

function isConnectionError(message: string) {
  const m = message.toLowerCase();
  return m.includes("servidor") || m.includes("ligacao") || m.includes("internet") || m.includes("network");
}

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryResetToken = useMemo(() => searchParams.get("resetToken") || "", [searchParams]);
  const queryFirstLoginToken = useMemo(() => searchParams.get("firstLoginToken") || "", [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstLoginResetToken, setFirstLoginResetToken] = useState("");
  const [passwordResetToken, setPasswordResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [formFeedback, setFormFeedback] = useState<FormFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const feedbackHashRef = useRef("");
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (queryFirstLoginToken) {
      setFirstLoginResetToken(queryFirstLoginToken);
      setPasswordResetToken("");
      setFormFeedback({ variant: "info", message: "Defina uma nova password para ativar a sua conta administrativa." });
      return;
    }

    if (queryResetToken) {
      setPasswordResetToken(queryResetToken);
      setFirstLoginResetToken("");
      setFormFeedback({ variant: "info", message: "Defina uma nova password para concluir a recuperação de conta." });
    }
  }, [queryFirstLoginToken, queryResetToken]);

  const showFeedback = (next: FormFeedback | null) => {
    if (!next) {
      feedbackHashRef.current = "";
      setFormFeedback(null);
      return;
    }

    const hash = `${next.variant}:${next.title || ""}:${next.message}`.toLowerCase();
    if (feedbackHashRef.current === hash) return;
    feedbackHashRef.current = hash;
    setFormFeedback(next);
  };

  const modeReset = Boolean(firstLoginResetToken || passwordResetToken);
  const fieldErrors = {
    email: !modeReset && !email.trim() ? "Introduza o seu email." : "",
    password: !modeReset && !password.trim() ? "Introduza a sua palavra-passe." : "",
    newPassword: modeReset && !newPassword.trim() ? "Preencha a nova password." : "",
    confirmNewPassword:
      modeReset && newPassword !== confirmNewPassword
        ? "As novas palavras-passe não coincidem."
        : "",
  };

  const shouldShowFieldError = (fieldName: string) => submitted || touched[fieldName];

  const markTouched = (fieldName: string) => {
    setTouched((current) => ({ ...current, [fieldName]: true }));
  };

  const goToAdminPortal = () => {
    // Full navigation avoids stale runtime chunk mismatches during route transitions.
    window.location.assign("/Portal/Admin");
  };

  const persistAdmin = (data: LoginResponse) => {
    setToken(data.token);
    const userId = String(data.user.id || data.user._id || "").trim();
    setUser({
      id: userId,
      email: data.user.email,
      role: data.user.role,
      adminLevel: data.user.adminLevel,
      name: data.user.fullName,
    });
    goToAdminPortal();
  };

  const beginSubmit = () => {
    if (submitInFlightRef.current) {
      return false;
    }
    submitInFlightRef.current = true;
    setLoading(true);
    return true;
  };

  const endSubmit = () => {
    submitInFlightRef.current = false;
    setLoading(false);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    showFeedback(null);
    setSubmitted(true);

    if (submitInFlightRef.current) {
      return;
    }

    if (!email.trim() || !password.trim()) {
      return;
    }

    if (!beginSubmit()) {
      return;
    }
    try {
      const res = await apiFetchRaw("/auth/login", {
        method: "POST",
        suppressGlobalErrors: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, roleHint: "admin" }),
      });

      if (res.status === 428) {
        const challenge = (await res.json()) as FirstLoginResetChallenge;
        if (challenge.requiresPasswordReset && challenge.resetToken) {
          setFirstLoginResetToken(challenge.resetToken);
          showFeedback({ variant: "info", message: "Primeiro acesso: defina uma nova password para continuar." });
          return;
        }
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Email ou palavra-passe incorretos.");
        }
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Não foi possível iniciar sessão.");
      }

      const data = (await res.json()) as LoginResponse;
      if (data.user.role !== "admin") {
        showFeedback({ variant: "warning", message: "Este acesso é exclusivo para administradores." });
        return;
      }
      showFeedback({ variant: "success", message: "Sessão iniciada com sucesso." });
      persistAdmin(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Não foi possível iniciar sessão.";
      if (isConnectionError(message)) {
        showFeedback({
          variant: "warning",
          title: "Ligação indisponível",
          message: "Não conseguimos contactar o servidor neste momento. Verifique a ligação e tente novamente.",
          actionLabel: "Tentar novamente",
          onAction: () => showFeedback(null),
        });
      } else if (message.toLowerCase().includes("incorret") || message.toLowerCase().includes("credencia")) {
        showFeedback({ variant: "error", message: "Email ou palavra-passe incorretos." });
      } else {
        showFeedback({ variant: "error", message });
      }
    } finally {
      endSubmit();
    }
  }

  async function handleFirstLoginReset(e: React.FormEvent) {
    e.preventDefault();
    showFeedback(null);
    setSubmitted(true);

    if (submitInFlightRef.current) {
      return;
    }

    if (!newPassword.trim() || !confirmNewPassword.trim()) {
      showFeedback({ variant: "error", message: "Preencha e confirme a nova password." });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showFeedback({ variant: "error", message: "As novas palavras-passe não coincidem." });
      return;
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      showFeedback({ variant: "error", message: passwordError });
      return;
    }

    if (!beginSubmit()) {
      return;
    }
    try {
      const res = await apiFetchRaw("/auth/first-login-reset", {
        method: "POST",
        suppressGlobalErrors: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken: firstLoginResetToken, newPassword }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Não foi possível redefinir password.");
      }

      const data = (await res.json()) as LoginResponse;
      if (data.user.role !== "admin") {
        showFeedback({ variant: "warning", message: "Este acesso é exclusivo para administradores." });
        return;
      }
      showFeedback({ variant: "success", message: "Sessão iniciada com sucesso." });
      persistAdmin(data);
    } catch (err: unknown) {
      showFeedback({ variant: "error", message: err instanceof Error ? err.message : "Não foi possível redefinir password." });
    } finally {
      endSubmit();
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    showFeedback(null);
    setSubmitted(true);

    if (submitInFlightRef.current) {
      return;
    }

    if (!newPassword.trim() || !confirmNewPassword.trim()) {
      showFeedback({ variant: "error", message: "Preencha e confirme a nova password." });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showFeedback({ variant: "error", message: "As novas palavras-passe não coincidem." });
      return;
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      showFeedback({ variant: "error", message: passwordError });
      return;
    }

    if (!beginSubmit()) {
      return;
    }
    try {
      const res = await apiFetchRaw("/auth/reset-password", {
        method: "POST",
        suppressGlobalErrors: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken: passwordResetToken, newPassword }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Não foi possível redefinir password.");
      }

      setPasswordResetToken("");
      setNewPassword("");
      setConfirmNewPassword("");
      showFeedback({ variant: "success", message: "Password redefinida com sucesso. Faça login com a nova credencial." });
      router.replace("/Admin/Login");
    } catch (err: unknown) {
      showFeedback({ variant: "error", message: err instanceof Error ? err.message : "Não foi possível redefinir password." });
    } finally {
      endSubmit();
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl lg:grid-cols-[0.9fr,1.1fr]">
        <section className="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <Image width={180} height={180} className="h-14 w-auto" src={Logo} alt="Parvagas" />
            <div className="mt-16">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
                Admin seguro
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-tight text-white">
                Acesso administrativo separado do fluxo público.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
                Use apenas contas criadas por super-admin. Novos acessos exigem troca de password no primeiro login.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Sem signup público para Admin/Moderador.
          </div>
        </section>

        <section className="flex items-center justify-center bg-white p-6 text-slate-900 sm:p-10">
          <div className="w-full max-w-md">
            <div className="lg:hidden">
              <Image width={160} height={160} className="h-14 w-auto" src={Logo} alt="Parvagas" />
            </div>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-red-600 lg:mt-0">Admin / Moderador</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Entrar na consola</h2>
            <p className="mt-2 text-sm text-slate-600">Acesso reservado para contas administrativas criadas por super-admin.</p>

            {!isMounted ? (
              <div className="mt-6 space-y-4" aria-live="polite" aria-busy="true">
                <div className="h-10 animate-pulse rounded-xl bg-slate-200" />
                <div className="h-10 animate-pulse rounded-xl bg-slate-200" />
                <div className="h-11 animate-pulse rounded-xl bg-slate-300" />
              </div>
            ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={passwordResetToken ? handlePasswordReset : firstLoginResetToken ? handleFirstLoginReset : handleSubmit}
              noValidate
            >
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-800">Email administrativo</label>
                <input
                  id="email"
                  type="email"
                  required
                  disabled={Boolean(firstLoginResetToken || passwordResetToken)}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                  aria-invalid={Boolean(shouldShowFieldError("email") && fieldErrors.email)}
                  aria-describedby="admin-email-error"
                  className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100 disabled:bg-slate-100"
                />
                <FormFieldError id="admin-email-error" message={shouldShowFieldError("email") ? fieldErrors.email : ""} />
              </div>

              <div suppressHydrationWarning>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-semibold text-slate-800">
                    {firstLoginResetToken || passwordResetToken ? "Nova password" : "Palavra-passe"}
                  </label>
                  {!firstLoginResetToken && !passwordResetToken && <div className="text-sm"><Reset /></div>}
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  suppressHydrationWarning
                  value={firstLoginResetToken || passwordResetToken ? newPassword : password}
                  onChange={(e) => (firstLoginResetToken || passwordResetToken ? setNewPassword(e.target.value) : setPassword(e.target.value))}
                  onBlur={() => markTouched(firstLoginResetToken || passwordResetToken ? "newPassword" : "password")}
                  aria-invalid={Boolean(
                    firstLoginResetToken || passwordResetToken
                      ? shouldShowFieldError("newPassword") && fieldErrors.newPassword
                      : shouldShowFieldError("password") && fieldErrors.password,
                  )}
                  aria-describedby="admin-password-error"
                  className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                />
                <FormFieldError
                  id="admin-password-error"
                  message={
                    firstLoginResetToken || passwordResetToken
                      ? shouldShowFieldError("newPassword")
                        ? fieldErrors.newPassword
                        : ""
                      : shouldShowFieldError("password")
                        ? fieldErrors.password
                        : ""
                  }
                />
              </div>

              {(firstLoginResetToken || passwordResetToken) && (
                <div>
                  <label htmlFor="confirmNewPassword" className="block text-sm font-semibold text-slate-800">Confirmar nova password</label>
                  <input
                    id="confirmNewPassword"
                    type="password"
                    required
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    onBlur={() => markTouched("confirmNewPassword")}
                    aria-invalid={Boolean(shouldShowFieldError("confirmNewPassword") && fieldErrors.confirmNewPassword)}
                    aria-describedby="admin-confirm-password-error"
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                  />
                  <FormFieldError id="admin-confirm-password-error" message={shouldShowFieldError("confirmNewPassword") ? fieldErrors.confirmNewPassword : ""} />
                </div>
              )}

              {formFeedback ? (
                <FeedbackAlert
                  variant={formFeedback.variant}
                  title={formFeedback.title}
                  message={formFeedback.message}
                  actionLabel={formFeedback.actionLabel}
                  onAction={formFeedback.onAction}
                />
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "A processar..." : passwordResetToken ? "Redefinir password" : firstLoginResetToken ? "Redefinir e entrar" : "Entrar na consola"}
              </button>

              <div className="flex items-center justify-between text-sm">
                <Link href="/Login?role=candidate" className="font-semibold text-slate-600 hover:text-red-700">Login público</Link>
                <Link href="/" className="font-semibold text-red-600 hover:text-red-700">Voltar ao site</Link>
              </div>
            </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950"><div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" /></div>}>
      <AdminLoginContent />
    </Suspense>
  );
}
