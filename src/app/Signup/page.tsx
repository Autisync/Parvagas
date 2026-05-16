"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const Logo = "/icon2.png";
import { apiFetch } from "@/lib/api";
import { useAppNotifier } from "@/app/components/AppNotifier";
import { useClientLocale } from "@/lib/i18n/client";
import FormFieldError from "@/app/components/errors/FormFieldError";
import AppErrorBanner from "@/app/components/errors/AppErrorBanner";

type AuthRole = "candidate" | "company";

function normalizeRole(value: string | null): AuthRole {
  if (value === "company") return "company";
  return "candidate";
}

function normalizeCompanyIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type RegisterResponse = {
  user: { id: string; email: string; role: string };
  message: string;
};

function inputClass() {
  return "mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100";
}

function isConnectionError(message: string) {
  const m = message.toLowerCase();
  return m.includes("servidor") || m.includes("ligacao") || m.includes("internet") || m.includes("network");
}

function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedRole = useMemo(() => normalizeRole(searchParams.get("role")), [searchParams]);
  const inviteToken = searchParams.get("inviteToken") || "";

  useEffect(() => {
    if (searchParams.get("role") === "admin") {
      router.replace("/Admin/Login");
    }
  }, [searchParams, router]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyIdentifier, setCompanyIdentifier] = useState("");
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [acceptConsent, setAcceptConsent] = useState(false);
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const { notify } = useAppNotifier();
  const { dict, locale } = useClientLocale();
  const roleTabs: Array<{ id: AuthRole; label: string; hint: string }> = [
    { id: "candidate", label: dict.auth.signup.roleCandidate, hint: dict.auth.signup.roleCandidateHint },
    { id: "company", label: dict.auth.signup.roleCompany, hint: dict.auth.signup.roleCompanyHint },
  ];

  useEffect(() => {
    if (!success) return;
    notify(success, "success");
    setSuccess("");
  }, [success, notify]);

  const normalizedIdentifier = normalizeCompanyIdentifier(companyIdentifier);
  const fieldErrors = {
    fullName: !fullName.trim() ? dict.auth.signup.errorFillRequired : "",
    email: !email.trim() ? dict.auth.signup.errorFillRequired : "",
    password: !password.trim() ? dict.auth.signup.errorFillRequired : "",
    confirmPassword: password !== confirmPassword ? dict.auth.signup.errorPasswordsMismatch : "",
    companyName:
      selectedRole === "company" && !inviteToken && !companyName.trim()
        ? dict.auth.signup.errorCompanyNameRequired
        : "",
    companyIdentifier:
      selectedRole === "company" && !inviteToken
        ? !normalizedIdentifier
          ? dict.auth.signup.errorIdentifierRequired
          : !/^[A-Z0-9]{6,20}$/.test(normalizedIdentifier)
            ? dict.auth.signup.errorIdentifierInvalid
            : ""
        : "",
    acceptConsent: !acceptConsent ? "É obrigatório aceitar os Termos de Uso e a Política de Privacidade." : "",
  };

  const shouldShowFieldError = (fieldName: string) => submitted || touched[fieldName];

  const markTouched = (fieldName: string) => {
    setTouched((current) => ({ ...current, [fieldName]: true }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitted(true);

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError(dict.auth.signup.errorFillRequired);
      return;
    }

    if (password !== confirmPassword) {
      setError(dict.auth.signup.errorPasswordsMismatch);
      return;
    }

    if (selectedRole === "company" && !inviteToken) {
      if (!companyName.trim()) {
        setError(dict.auth.signup.errorCompanyNameRequired);
        return;
      }

      const normalizedIdentifier = normalizeCompanyIdentifier(companyIdentifier);
      if (!normalizedIdentifier) {
        setError(dict.auth.signup.errorIdentifierRequired);
        return;
      }

      if (!/^[A-Z0-9]{6,20}$/.test(normalizedIdentifier)) {
        setError(dict.auth.signup.errorIdentifierInvalid);
        return;
      }
    }

    if (!acceptConsent) {
      setError("É obrigatório aceitar os Termos de Uso e a Política de Privacidade para continuar.");
      return;
    }

    setLoading(true);
    try {
      if (selectedRole === "company" && inviteToken) {
        await apiFetch<{ message: string }>("/auth/company-invite/accept", {
          method: "POST",
          suppressGlobalErrors: true,
          body: JSON.stringify({
            inviteToken,
            fullName: fullName.trim(),
            password,
            acceptTerms: acceptConsent,
            acceptPrivacy: acceptConsent,
            newsletterOptIn,
            termsVersion: "2026-05-05",
            privacyVersion: "2026-05-05",
          }),
        });
      } else {
        await apiFetch<RegisterResponse>("/auth/register", {
          method: "POST",
          suppressGlobalErrors: true,
          body: JSON.stringify({
            fullName: fullName.trim(),
            email: email.trim(),
            password,
            role: selectedRole,
            acceptTerms: acceptConsent,
            acceptPrivacy: acceptConsent,
            newsletterOptIn,
            termsVersion: "2026-05-05",
            privacyVersion: "2026-05-05",
            ...(selectedRole === "company" && !inviteToken
              ? {
                  companyName: companyName.trim(),
                  nif: normalizeCompanyIdentifier(companyIdentifier),
                  companyLegalName: companyLegalName.trim(),
                }
              : {}),
          }),
        });
      }

      setSuccess(
        selectedRole === "company" && inviteToken
          ? dict.auth.signup.successInviteAccepted
          : dict.auth.signup.successAccountCreated,
      );
      const encodedEmail = encodeURIComponent(email.trim());
      setTimeout(() => router.push(`/Signup/success?role=${selectedRole}&email=${encodedEmail}`), 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (locale === "en" ? "Could not create account." : "Não foi possível criar a conta."));
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">{dict.auth.signup.sideEyebrow}</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight">{dict.auth.signup.sideTitle}</h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
                {dict.auth.signup.sideDescription}
              </p>
            </div>
          </div>
          <div className="grid gap-3 text-sm text-slate-300">
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4">{dict.auth.signup.sideBadge1}</p>
            <Link href="/" className="font-semibold text-red-200 hover:text-white">{dict.auth.signup.sideLinkHome}</Link>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="lg:hidden">
              <Image width={160} height={160} className="h-14 w-auto" src={Logo} alt="Parvagas" />
            </div>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-red-600 lg:mt-0">{dict.auth.signup.pageEyebrow}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{dict.auth.signup.pageTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{dict.auth.signup.pageSubtitle}</p>

            <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {roleTabs.map((role) => {
                const active = role.id === selectedRole;
                return (
                  <Link
                    key={role.id}
                    href={`/Signup?role=${role.id}${inviteToken ? `&inviteToken=${encodeURIComponent(inviteToken)}` : ""}`}
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

            {selectedRole === "company" && inviteToken && (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {dict.auth.signup.inviteDetected}
              </div>
            )}

            <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="fullName" className="block text-sm font-semibold text-slate-800">{dict.auth.signup.fullName}</label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={() => markTouched("fullName")}
                  aria-invalid={Boolean(shouldShowFieldError("fullName") && fieldErrors.fullName)}
                  aria-describedby="fullName-error"
                  className={inputClass()}
                />
                <FormFieldError id="fullName-error" message={shouldShowFieldError("fullName") ? fieldErrors.fullName : ""} />
              </div>

              {selectedRole === "company" && !inviteToken && (
                <>
                  <div>
                    <label htmlFor="companyName" className="block text-sm font-semibold text-slate-800">{dict.auth.signup.companyName}</label>
                    <input
                      id="companyName"
                      name="companyName"
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      onBlur={() => markTouched("companyName")}
                      aria-invalid={Boolean(shouldShowFieldError("companyName") && fieldErrors.companyName)}
                      aria-describedby="companyName-error"
                      className={inputClass()}
                    />
                    <FormFieldError id="companyName-error" message={shouldShowFieldError("companyName") ? fieldErrors.companyName : ""} />
                  </div>

                  <div>
                    <label htmlFor="companyLegalName" className="block text-sm font-semibold text-slate-800">{dict.auth.signup.legalName}</label>
                    <input
                      id="companyLegalName"
                      name="companyLegalName"
                      type="text"
                      value={companyLegalName}
                      onChange={(e) => setCompanyLegalName(e.target.value)}
                      className={inputClass()}
                      placeholder={dict.auth.signup.legalNameOptional}
                    />
                  </div>

                  <div>
                    <label htmlFor="companyIdentifier" className="block text-sm font-semibold text-slate-800">{dict.auth.signup.companyIdentifier}</label>
                    <input
                      id="companyIdentifier"
                      name="companyIdentifier"
                      type="text"
                      required
                      value={companyIdentifier}
                      onChange={(e) => setCompanyIdentifier(e.target.value)}
                      onBlur={() => markTouched("companyIdentifier")}
                      aria-invalid={Boolean(shouldShowFieldError("companyIdentifier") && fieldErrors.companyIdentifier)}
                      aria-describedby="companyIdentifier-error"
                      className={inputClass()}
                    />
                    <p className="mt-1.5 text-xs text-slate-500">{dict.auth.signup.companyIdentifierHelp}</p>
                    <FormFieldError id="companyIdentifier-error" message={shouldShowFieldError("companyIdentifier") ? fieldErrors.companyIdentifier : ""} />
                  </div>
                </>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-800">{dict.auth.signup.email}</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                  aria-invalid={Boolean(shouldShowFieldError("email") && fieldErrors.email)}
                  aria-describedby="email-error"
                  className={inputClass()}
                />
                <FormFieldError id="email-error" message={shouldShowFieldError("email") ? fieldErrors.email : ""} />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-800">{dict.auth.signup.password}</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => markTouched("password")}
                  aria-invalid={Boolean(shouldShowFieldError("password") && fieldErrors.password)}
                  aria-describedby="password-error"
                  className={inputClass()}
                />
                <FormFieldError id="password-error" message={shouldShowFieldError("password") ? fieldErrors.password : ""} />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-800">{dict.auth.signup.confirmPassword}</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => markTouched("confirmPassword")}
                  aria-invalid={Boolean(shouldShowFieldError("confirmPassword") && fieldErrors.confirmPassword)}
                  aria-describedby="confirmPassword-error"
                  className={inputClass()}
                />
                <FormFieldError id="confirmPassword-error" message={shouldShowFieldError("confirmPassword") ? fieldErrors.confirmPassword : ""} />
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {/* Required: T&C + Privacy combined */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptConsent}
                    onChange={(e) => setAcceptConsent(e.target.checked)}
                    onBlur={() => markTouched("acceptConsent")}
                    aria-required="true"
                    aria-describedby="acceptConsent-error"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-red-600 focus:ring-2 focus:ring-red-400"
                  />
                  <span className="text-sm leading-snug text-slate-700">
                    Declaro que li e aceito integralmente os{" "}
                    <Link
                      href="/termos"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-red-600 underline-offset-2 hover:text-red-700 hover:underline"
                    >
                      Termos de Uso
                    </Link>{" "}
                    e a{" "}
                    <Link
                      href="/privacidade"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-red-600 underline-offset-2 hover:text-red-700 hover:underline"
                    >
                      Política de Privacidade
                    </Link>{" "}
                    da Parvagas.
                  </span>
                </label>
                <FormFieldError id="acceptConsent-error" message={shouldShowFieldError("acceptConsent") ? fieldErrors.acceptConsent : ""} />

                {/* Optional: newsletter opt-in */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newsletterOptIn}
                    onChange={(e) => setNewsletterOptIn(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-red-600 focus:ring-2 focus:ring-red-400"
                  />
                  <span className="text-sm leading-snug text-slate-500">
                    Desejo receber e-mails com notícias, vagas e ofertas da Parvagas. <span className="text-slate-400">(opcional)</span>
                  </span>
                </label>
              </div>

              {error && (
                isConnectionError(error) ? (
                  <AppErrorBanner
                    title="Ligação indisponível"
                    message="Não conseguimos contactar o servidor neste momento."
                    actionLabel="Tentar novamente"
                  />
                ) : (
                  <p role="alert" className="text-sm font-medium text-rose-600">{error}</p>
                )
              )}

              <button
                type="submit"
                disabled={loading || !acceptConsent}
                className="flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? dict.auth.signup.creatingAccount : dict.auth.signup.createAccount}
              </button>

              <p className="text-center text-sm text-slate-600">
                {dict.auth.signup.hasAccount}{" "}
                <Link href={`/Login?role=${selectedRole}`} className="font-semibold text-red-600 hover:text-red-700">
                  {dict.auth.signup.signIn}
                </Link>
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-white"><div className="h-8 w-8 animate-spin rounded-full border-4 border-red-600 border-t-transparent" /></div>}>
      <SignUpContent />
    </Suspense>
  );
}
