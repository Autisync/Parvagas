"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "/public/icon2.png";
import Reset from "@/app/components/RestorePass";
import { apiUrl, setToken, setUser } from "@/lib/api";
import { useAppNotifier } from "@/app/components/AppNotifier";

type LoginResponse = {
  token: string;
  user: {
    id: string;
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

function validatePasswordStrength(password: string): string {
  if (password.length < 8) return "A nova password deve ter pelo menos 8 caracteres.";
  if (!/[A-Z]/.test(password)) return "A nova password deve incluir pelo menos 1 letra maiúscula.";
  if (!/[a-z]/.test(password)) return "A nova password deve incluir pelo menos 1 letra minúscula.";
  if (!/[0-9]/.test(password)) return "A nova password deve incluir pelo menos 1 número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "A nova password deve incluir pelo menos 1 símbolo.";
  return "";
}

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryResetToken = useMemo(() => searchParams.get("resetToken") || "", [searchParams]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstLoginResetToken, setFirstLoginResetToken] = useState("");
  const [passwordResetToken, setPasswordResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const { notify } = useAppNotifier();

  useEffect(() => {
    if (queryResetToken) {
      setPasswordResetToken(queryResetToken);
      setFirstLoginResetToken("");
      setError("Defina uma nova password para concluir a recuperação de conta.");
    }
  }, [queryResetToken]);

  useEffect(() => {
    if (!error) return;
    notify(error, "error");
    setError("");
  }, [error, notify]);

  useEffect(() => {
    if (!notice) return;
    notify(notice, "success");
    setNotice("");
  }, [notice, notify]);

  const goToAdminPortal = () => {
    // Full navigation avoids stale runtime chunk mismatches during route transitions.
    window.location.assign("/Portal/Admin");
  };

  const persistAdmin = (data: LoginResponse) => {
    setToken(data.token);
    setUser({
      id: data.user.id,
      email: data.user.email,
      role: data.user.role,
      adminLevel: data.user.adminLevel,
      name: data.user.fullName,
    });
    goToAdminPortal();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!email.trim() || !password.trim()) {
      setError("Preencha o email e a palavra-passe.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res.status === 428) {
        const challenge = (await res.json()) as FirstLoginResetChallenge;
        if (challenge.requiresPasswordReset && challenge.resetToken) {
          setFirstLoginResetToken(challenge.resetToken);
          setError("Primeiro acesso: defina uma nova password para continuar.");
          return;
        }
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as LoginResponse;
      if (data.user.role !== "admin") {
        setError("Este acesso é exclusivo para administradores.");
        return;
      }
      persistAdmin(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Credenciais inválidas.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFirstLoginReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!newPassword.trim() || !confirmNewPassword.trim()) {
      setError("Preencha e confirme a nova password.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("As novas palavras-passe não coincidem.");
      return;
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/auth/first-login-reset"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken: firstLoginResetToken, newPassword }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as LoginResponse;
      if (data.user.role !== "admin") {
        setError("Este acesso é exclusivo para administradores.");
        return;
      }
      persistAdmin(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível redefinir password.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!newPassword.trim() || !confirmNewPassword.trim()) {
      setError("Preencha e confirme a nova password.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("As novas palavras-passe não coincidem.");
      return;
    }

    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken: passwordResetToken, newPassword }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }

      setPasswordResetToken("");
      setNewPassword("");
      setConfirmNewPassword("");
      setNotice("Password redefinida com sucesso. Faça login com a nova credencial.");
      router.replace("/Admin/Login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível redefinir password.");
    } finally {
      setLoading(false);
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
                  className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100 disabled:bg-slate-100"
                />
              </div>

              <div>
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
                  value={firstLoginResetToken || passwordResetToken ? newPassword : password}
                  onChange={(e) => (firstLoginResetToken || passwordResetToken ? setNewPassword(e.target.value) : setPassword(e.target.value))}
                  className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
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
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
                  />
                </div>
              )}

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
