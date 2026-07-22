"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { SuccessCheck } from "@/app/components/motion";

export default function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus("loading");
    try {
      const token = await getRecaptchaToken("newsletter_subscribe");
      await apiFetch<{ message: string }>("/newsletter/subscribe", {
        method: "POST",
        suppressGlobalErrors: true,
        headers: token ? { "x-captcha-token": token } : undefined,
        body: JSON.stringify({ email: trimmed, source: "footer" }),
      });
      setStatus("done");
      setMessage("Subscrição confirmada. Obrigado!");
      setEmail("");
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Não foi possível subscrever. Tente novamente.");
    }
  }

  return (
    <div className="border-b border-gray-100 py-8">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {status === "done" ? (
          <div className="pv-animate-pop flex justify-center md:justify-start">
            <SuccessCheck size={64} tone="brand" label={message} />
          </div>
        ) : (
          <>
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">Receba novas vagas por e-mail</p>
                <p className="mt-0.5 text-xs text-gray-500">Novidades sobre vagas e da plataforma, sem spam.</p>
              </div>
              <form onSubmit={handleSubmit} className="flex w-full max-w-md gap-2 md:w-auto">
                <label htmlFor="newsletter-email" className="sr-only">E-mail</label>
                <input
                  id="newsletter-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="o.seu@email.com"
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="shrink-0 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {status === "loading" ? "A subscrever..." : "Subscrever"}
                </button>
              </form>
            </div>
            {message ? (
              <p className={`mt-2 text-xs ${status === "error" ? "text-red-600" : "text-emerald-600"}`}>{message}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
