"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiFetchRaw } from "@/lib/api";

type ResendResponse = {
  success?: boolean;
  message?: string;
  detail?: string;
  error?: {
    message?: string;
  };
};

export default function ResendVerificationPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Indique o seu e-mail.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetchRaw("/auth/resend-verification-email", {
        method: "POST",
        suppressGlobalErrors: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as ResendResponse;
      if (!res.ok) {
        throw new Error(body?.error?.message || body?.message || body?.detail || "Não foi possível reenviar o email de verificação.");
      }
      setMessage(body?.message || "Se existir uma conta com este email, foi enviado um novo link de verificação.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível reenviar o email de verificação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-20">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Reenviar email de verificação</h1>
        <p className="mt-2 text-sm text-slate-600">Indique o email da sua conta e enviamos um novo link de verificação.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="voce@exemplo.com"
            />
          </label>

          {message ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? "A enviar..." : "Reenviar email"}
          </button>
        </form>

        <div className="mt-6">
          <Link href="/Login?role=candidate" className="text-sm font-semibold text-red-600 hover:text-red-700">
            Voltar ao login
          </Link>
        </div>
      </div>
    </main>
  );
}
