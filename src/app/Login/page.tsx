"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const Logo = "/icon2.png";
import Reset from "../components/RestorePass";
import { apiFetchRaw, setToken, setUser } from "@/lib/api";
import { useClientLocale } from "@/lib/i18n/client";
import FormFieldError from "@/app/components/errors/FormFieldError";
import FeedbackAlert, { type FeedbackVariant } from "@/app/components/errors/FeedbackAlert";
import { EyeIcon, EyeSlashIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";

type LoginResponse = {
  token: string;
  user: {
    id?: string;
    _id?: string;
    email: string;
    role: string;
    fullName?: string;
    adminLevel?: "super-admin" | "moderator";
    companyTeamRole?: "owner" | "manager" | "recruiter" | "viewer";
    hasCompletedOnboarding?: boolean;
    hasSeenTutorial?: boolean;
    hasSeenEmpresaTutorial?: boolean;
    companyStatus?: "inactive" | "pending_verification" | "active" | "rejected";
  };
};

type FirstLoginResetChallenge = {
  requiresPasswordReset: boolean;
  resetToken: string;
};

type ResendVerificationResponse = {
  success?: boolean;
  message?: string;
};

type AuthRole = "candidate" | "company";

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

function normalizeRole(value: string | null): AuthRole {
  if (value === "company") return "company";
  return "candidate";
}

function portalRoute(role: string): string {
  if (role === "company") return "/Portal/Empresa/Perfil";
  return "/Portal/Candidato";
}

function isConnectionError(message: string) {
  const m = message.toLowerCase();
  return m.includes("servidor") || m.includes("ligacao") || m.includes("internet") || m.includes("network");
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRole = searchParams.get("role");
  const queryResetToken = useMemo(() => searchParams.get("resetToken") || "", [searchParams]);
  const queryFirstLoginToken = useMemo(() => searchParams.get("firstLoginToken") || "", [searchParams]);
  const selectedRole = useMemo(() => normalizeRole(rawRole), [rawRole]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstLoginResetToken, setFirstLoginResetToken] = useState("");
  const [passwordResetToken, setPasswordResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [formFeedback, setFormFeedback] = useState<FormFeedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const feedbackHashRef = useRef("");
  const { dict } = useClientLocale();
  const roleTabs: Array<{ id: AuthRole; label: string; hint: string }> = [
    { id: "candidate", label: dict.auth.login.roleCandidate, hint: dict.auth.login.roleCandidateHint },
    { id: "company", label: dict.auth.login.roleCompany, hint: dict.auth.login.roleCompanyHint },
  ];

  useEffect(() => {
    if (rawRole === "admin") router.replace("/Admin/Login");
  }, [rawRole, router]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (queryFirstLoginToken) {
      setFirstLoginResetToken(queryFirstLoginToken);
      setPasswordResetToken("");
      return;
    }

    if (queryResetToken) {
      setPasswordResetToken(queryResetToken);
      setFirstLoginResetToken("");
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

  const passwordRequirements = modeReset ? [
    { met: newPassword.length >= 8, label: "8+ caracteres" },
    { met: /[A-Z]/.test(newPassword), label: "Maiúscula" },
    { met: /[a-z]/.test(newPassword), label: "Minúscula" },
    { met: /[0-9]/.test(newPassword), label: "Número" },
    { met: /[^A-Za-z0-9]/.test(newPassword), label: "Símbolo" },
  ] : [];

  const markTouched = (fieldName: string) => {
    setTouched((current) => ({ ...current, [fieldName]: true }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    showFeedback(null);
    setSubmitted(true);

    if (!email.trim() || !password.trim()) {
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetchRaw("/auth/login", {
        method: "POST",
        suppressGlobalErrors: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, roleHint: selectedRole }),
      });

      if (res.status === 428) {
        const challenge = (await res.json()) as FirstLoginResetChallenge;
        if (challenge.requiresPasswordReset && challenge.resetToken) {
          setFirstLoginResetToken(challenge.resetToken);
          showFeedback({
            variant: "info",
            message: "Primeiro acesso: defina uma nova password para continuar.",
          });
          return;
        }
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const apiCode = String((body as { code?: string }).code || "").trim();

        if (res.status === 403 && apiCode === "EMAIL_NOT_VERIFIED") {
          showFeedback({
            variant: "warning",
            message: "Please verify your email before signing in.",
            actionLabel: resendingVerification ? "A reenviar..." : "Reenviar verificação",
            onAction: () => {
              if (!email.trim()) return;
              setResendingVerification(true);
              void apiFetchRaw("/auth/resend-verification-email", {
                method: "POST",
                suppressGlobalErrors: true,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
              })
                .then(async (response) => {
                  const resendBody = (await response.json().catch(() => ({}))) as ResendVerificationResponse;
                  if (!response.ok) {
                    throw new Error(resendBody.message || "Não foi possível reenviar o email de verificação.");
                  }
                  showFeedback({
                    variant: "success",
                    message: resendBody.message || "Email de verificação reenviado.",
                  });
                })
                .catch((err: unknown) => {
                  showFeedback({
                    variant: "error",
                    message: err instanceof Error ? err.message : "Não foi possível reenviar o email de verificação.",
                  });
                })
                .finally(() => setResendingVerification(false));
            },
          });
          return;
        }

        if (res.status === 401 || res.status === 403) {
          throw new Error("Email ou palavra-passe incorretos.");
        }
        throw new Error((body as { error?: string }).error || "Não foi possível iniciar sessão.");
      }

      const data = (await res.json()) as LoginResponse;
        if (data.user.role === "admin") {
          showFeedback({
            variant: "warning",
            message: "Use o acesso administrativo para contas de administrador.",
          });
          router.replace("/Admin/Login");
          return;
        }
      if (selectedRole !== data.user.role) {
        showFeedback({
          variant: "warning",
          message: selectedRole === "company"
            ? "Esta conta não pertence a Empresa. Troque para o acesso de Candidato."
            : "Esta conta não pertence a Candidato. Troque para o acesso de Empresa.",
        });
        return;
      }

      setToken(data.token);
      const userId = String(data.user.id || data.user._id || "").trim();
      setUser({
        id: userId,
        email: data.user.email,
        role: data.user.role,
        adminLevel: data.user.adminLevel,
        companyTeamRole: data.user.companyTeamRole,
        name: data.user.fullName,
        hasCompletedOnboarding: data.user.hasCompletedOnboarding ?? true,
        hasSeenTutorial: data.user.hasSeenTutorial ?? false,
        hasSeenEmpresaTutorial: data.user.hasSeenEmpresaTutorial ?? false,
        companyStatus: data.user.companyStatus,
      });
      showFeedback({ variant: "success", message: "Sessão iniciada com sucesso." });
      window.setTimeout(() => {
        router.push(portalRoute(data.user.role));
      }, 250);
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
      setLoading(false);
    }
  }

  async function handleFirstLoginReset(e: React.FormEvent) {
    e.preventDefault();
    showFeedback(null);
    setSubmitted(true);

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

    setLoading(true);
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
      if (data.user.role === "admin") {
        showFeedback({ variant: "warning", message: "Use o acesso administrativo para contas de administrador." });
        router.replace("/Admin/Login");
        return;
      }
      setToken(data.token);
      const userId = String(data.user.id || data.user._id || "").trim();
      setUser({
        id: userId,
        email: data.user.email,
        role: data.user.role,
        companyTeamRole: data.user.companyTeamRole,
        name: data.user.fullName,
        hasCompletedOnboarding: data.user.hasCompletedOnboarding ?? true,
        hasSeenTutorial: data.user.hasSeenTutorial ?? false,
        hasSeenEmpresaTutorial: data.user.hasSeenEmpresaTutorial ?? false,
        companyStatus: data.user.companyStatus,
      });
      showFeedback({ variant: "success", message: "Sessão iniciada com sucesso." });
      window.setTimeout(() => {
        router.push(portalRoute(data.user.role));
      }, 250);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Não foi possível redefinir password.";
      showFeedback({ variant: "error", message });
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    showFeedback(null);
    setSubmitted(true);

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

    setLoading(true);
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
      router.replace(`/Login?role=${selectedRole}`);
    } catch (err: unknown) {
      showFeedback({ variant: "error", message: err instanceof Error ? err.message : "Não foi possível redefinir password." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[0.95fr,1.05fr]">
        <section className="hidden border-r border-slate-200 bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <Image width={180} height={180} className="h-14 w-auto" src={Logo} alt="Parvagas" />
            <div className="mt-16">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">{dict.auth.login.sideEyebrow}</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight text-white">{dict.auth.login.sideTitle}</h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
                {dict.auth.login.sideDescription}
              </p>
            </div>
          </div>
          <div className="grid gap-3 text-sm text-slate-300">
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4">{dict.auth.login.sideBadge1}</p>
            <Link href="/" className="font-semibold text-red-200 hover:text-white">{dict.auth.login.sideLinkHome}</Link>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="lg:hidden">
              <Image width={160} height={160} className="h-14 w-auto" src={Logo} alt="Parvagas" />
            </div>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-red-600 lg:mt-0">{dict.auth.login.pageEyebrow}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{dict.auth.login.pageTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{dict.auth.login.pageSubtitle}</p>

            <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {roleTabs.map((role) => {
                const active = role.id === selectedRole;
                return (
                  <Link
                    key={role.id}
                    href={`/Login?role=${role.id}`}
                    className={[
                      "rounded-xl px-3 py-3 text-sm transition",
                      active ? "bg-white text-red-700 shadow-sm ring-1 ring-red-100" : "text-slate-600 hover:text-slate-950",
                    ].join(" ")}
                  >
                    <span className="block font-semibold">{role.label}</span>
                    <span className="mt-0.5 block text-xs opacity-75">{role.hint}</span>
                  </Link>
                );
              })}
            </div>

            <form
              className="mt-6 space-y-4"
              onSubmit={passwordResetToken ? handlePasswordReset : firstLoginResetToken ? handleFirstLoginReset : handleSubmit}
              noValidate
            >
              {modeReset && (
                <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5">
                  <ShieldCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900">
                      {firstLoginResetToken ? "Primeiro acesso — defina a sua password" : "Recuperação de conta"}
                    </p>
                    <p className="mt-0.5 text-xs text-blue-700">
                      {firstLoginResetToken
                        ? "Crie uma password segura para ativar a sua conta."
                        : "Escolha uma nova password para retomar o acesso."}
                    </p>
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-800">{dict.auth.login.email}</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={Boolean(firstLoginResetToken || passwordResetToken)}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                  aria-invalid={Boolean(shouldShowFieldError("email") && fieldErrors.email)}
                  aria-describedby="login-email-error"
                  className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100 disabled:bg-slate-100"
                />
                <FormFieldError id="login-email-error" message={shouldShowFieldError("email") ? fieldErrors.email : ""} />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-semibold text-slate-800">
                    {firstLoginResetToken || passwordResetToken ? dict.auth.login.newPassword : dict.auth.login.password}
                  </label>
                  {!firstLoginResetToken && !passwordResetToken && <div className="text-sm"><Reset /></div>}
                </div>
                {!isHydrated ? (
                  <div className="mt-2 h-[42px] w-full rounded-xl border border-slate-200 bg-slate-100" aria-hidden="true" />
                ) : (
                  <div className="relative mt-2">
                    <input
                      id="password"
                      name="password"
                      type={modeReset && showNewPass ? "text" : "password"}
                      autoComplete={firstLoginResetToken || passwordResetToken ? "new-password" : "current-password"}
                      required
                      value={firstLoginResetToken || passwordResetToken ? newPassword : password}
                      onChange={(e) => (firstLoginResetToken || passwordResetToken ? setNewPassword(e.target.value) : setPassword(e.target.value))}
                      onBlur={() => markTouched(firstLoginResetToken || passwordResetToken ? "newPassword" : "password")}
                      aria-invalid={Boolean(
                        firstLoginResetToken || passwordResetToken
                          ? shouldShowFieldError("newPassword") && fieldErrors.newPassword
                          : shouldShowFieldError("password") && fieldErrors.password,
                      )}
                      aria-describedby="login-password-error"
                      className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                    />
                    {modeReset && (
                      <button
                        type="button"
                        onClick={() => setShowNewPass((v) => !v)}
                        className="absolute inset-y-0 right-3 flex items-center text-slate-400 transition hover:text-slate-600"
                        aria-label={showNewPass ? "Ocultar password" : "Mostrar password"}
                      >
                        {showNewPass ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                )}
                <FormFieldError
                  id="login-password-error"
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
                {modeReset && newPassword.length > 0 && (
                  <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    {passwordRequirements.map((req) => (
                      <li key={req.label} className={`flex items-center gap-1.5 text-xs ${req.met ? "text-emerald-600" : "text-slate-400"}`}>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${req.met ? "bg-emerald-500" : "bg-slate-300"}`} />
                        {req.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(firstLoginResetToken || passwordResetToken) && (
                <div>
                  <label htmlFor="confirmNewPassword" className="block text-sm font-semibold text-slate-800">{dict.auth.login.confirmNewPassword}</label>
                  {!isHydrated ? (
                    <div className="mt-2 h-[42px] w-full rounded-xl border border-slate-200 bg-slate-100" aria-hidden="true" />
                  ) : (
                    <div className="relative mt-2">
                      <input
                        id="confirmNewPassword"
                        name="confirmNewPassword"
                        type={showConfirmPass ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        onBlur={() => markTouched("confirmNewPassword")}
                        aria-invalid={Boolean(shouldShowFieldError("confirmNewPassword") && fieldErrors.confirmNewPassword)}
                        aria-describedby="confirm-new-password-error"
                        className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass((v) => !v)}
                        className="absolute inset-y-0 right-3 flex items-center text-slate-400 transition hover:text-slate-600"
                        aria-label={showConfirmPass ? "Ocultar confirmação" : "Mostrar confirmação"}
                      >
                        {showConfirmPass ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                  {confirmNewPassword.length > 0 && (
                    <p className={`mt-1.5 flex items-center gap-1.5 text-xs ${newPassword === confirmNewPassword ? "text-emerald-600" : "text-rose-500"}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${newPassword === confirmNewPassword ? "bg-emerald-500" : "bg-rose-400"}`} />
                      {newPassword === confirmNewPassword ? "As passwords coincidem" : "As passwords não coincidem"}
                    </p>
                  )}
                  <FormFieldError
                    id="confirm-new-password-error"
                    message={shouldShowFieldError("confirmNewPassword") ? fieldErrors.confirmNewPassword : ""}
                  />
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
                {loading ? dict.auth.login.processing : passwordResetToken ? dict.auth.login.resetPassword : firstLoginResetToken ? dict.auth.login.resetAndSignIn : dict.auth.login.signIn}
              </button>

              <p className="text-center text-sm text-slate-600">
                {dict.auth.login.noAccount}{" "}
                <Link href={`/Signup?role=${selectedRole}`} className="font-semibold text-red-600 hover:text-red-700">
                  {dict.auth.login.createAccount}
                </Link>
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LogIn() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white"><div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" /></div>}>
      <LoginContent />
    </Suspense>
  );
}
