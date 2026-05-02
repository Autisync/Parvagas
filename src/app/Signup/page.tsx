"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "/public/icon2.png";
import { apiFetch } from "@/lib/api";
import { useAppNotifier } from "@/app/components/AppNotifier";

type AuthRole = "candidate" | "company";

const roleTabs: Array<{ id: AuthRole; label: string; hint: string }> = [
  { id: "candidate", label: "Candidato", hint: "Perfil, recomendações e candidaturas" },
  { id: "company", label: "Empresa", hint: "Publicar vagas e gerir candidaturas" },
];

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
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const { notify } = useAppNotifier();

  useEffect(() => {
    if (!error) return;
    notify(error, "error");
    setError("");
  }, [error, notify]);

  useEffect(() => {
    if (!success) return;
    notify(success, "success");
    setSuccess("");
  }, [success, notify]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError("Preencha nome, email e palavra-passe.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As palavras-passe não coincidem.");
      return;
    }

    if (selectedRole === "company" && !inviteToken) {
      if (!companyName.trim()) {
        setError("Informe o nome da empresa.");
        return;
      }

      const normalizedIdentifier = normalizeCompanyIdentifier(companyIdentifier);
      if (!normalizedIdentifier) {
        setError("Informe o NIF/identificador da empresa.");
        return;
      }

      if (!/^[A-Z0-9]{6,20}$/.test(normalizedIdentifier)) {
        setError("NIF inválido. Use 6-20 caracteres alfanuméricos.");
        return;
      }
    }

    setLoading(true);
    try {
      if (selectedRole === "company" && inviteToken) {
        await apiFetch<{ message: string }>("/auth/company-invite/accept", {
          method: "POST",
          body: JSON.stringify({
            inviteToken,
            fullName: fullName.trim(),
            password,
          }),
        });
      } else {
        await apiFetch<RegisterResponse>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            fullName: fullName.trim(),
            email: email.trim(),
            password,
            role: selectedRole,
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
          ? "Convite aceite. Faça login com o email convidado e altere a password no primeiro acesso."
          : "Conta criada com sucesso. Pode iniciar sessão agora.",
      );
      setTimeout(() => router.push(`/Login?role=${selectedRole}`), 800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a conta.");
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">Criar conta</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight">Um início simples para cada tipo de utilizador.</h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
                Candidatos e empresas entram por fluxos públicos separados. A criação de administradores fica reservada ao super-admin.
              </p>
            </div>
          </div>
          <div className="grid gap-3 text-sm text-slate-300">
            <p className="rounded-2xl border border-white/10 bg-white/5 p-4">Empresas passam por validação de NIF e nome normalizado para evitar duplicados.</p>
            <Link href="/" className="font-semibold text-red-200 hover:text-white">Voltar ao site público</Link>
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="lg:hidden">
              <Image width={160} height={160} className="h-14 w-auto" src={Logo} alt="Parvagas" />
            </div>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-red-600 lg:mt-0">Signup</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Criar conta</h2>
            <p className="mt-2 text-sm text-slate-600">Escolha o perfil correto para configurar o acesso inicial.</p>

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
                Convite de equipa detectado. O email deve corresponder ao convite para associar à empresa.
              </div>
            )}

            <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="fullName" className="block text-sm font-semibold text-slate-800">Nome completo</label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass()}
                />
              </div>

              {selectedRole === "company" && !inviteToken && (
                <>
                  <div>
                    <label htmlFor="companyName" className="block text-sm font-semibold text-slate-800">Nome da empresa</label>
                    <input
                      id="companyName"
                      name="companyName"
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className={inputClass()}
                    />
                  </div>

                  <div>
                    <label htmlFor="companyLegalName" className="block text-sm font-semibold text-slate-800">Razão social</label>
                    <input
                      id="companyLegalName"
                      name="companyLegalName"
                      type="text"
                      value={companyLegalName}
                      onChange={(e) => setCompanyLegalName(e.target.value)}
                      className={inputClass()}
                      placeholder="Opcional"
                    />
                  </div>

                  <div>
                    <label htmlFor="companyIdentifier" className="block text-sm font-semibold text-slate-800">NIF / Identificador único</label>
                    <input
                      id="companyIdentifier"
                      name="companyIdentifier"
                      type="text"
                      required
                      value={companyIdentifier}
                      onChange={(e) => setCompanyIdentifier(e.target.value)}
                      className={inputClass()}
                    />
                    <p className="mt-1.5 text-xs text-slate-500">Use 6-20 caracteres alfanuméricos, sem espaços especiais.</p>
                  </div>
                </>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-800">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass()}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-800">Palavra-passe</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass()}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-800">Confirmar palavra-passe</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass()}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "A criar conta..." : "Criar conta"}
              </button>

              <p className="text-center text-sm text-slate-600">
                Já tem conta?{" "}
                <Link href={`/Login?role=${selectedRole}`} className="font-semibold text-red-600 hover:text-red-700">
                  Entrar
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
