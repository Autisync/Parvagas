"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, getErrorMessage } from "@/lib/api";
import Header from "@/app/components/Header";
import Footer from "@/app/components/Footer";

/**
 * One-click unsubscribe landing page — the link every newsletter issue
 * email carries. Deliberately a page the human lands on and this component
 * does the POST (not a raw GET-with-side-effects link), so email-client
 * link-prescanners can't trigger an unsubscribe just by following the link
 * to check it's safe.
 */
function UnsubscribeInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Link inválido — falta o token de cancelamento.");
      return;
    }
    apiFetch<{ message: string }>("/newsletter/unsubscribe", {
      method: "POST",
      suppressGlobalErrors: true,
      body: JSON.stringify({ token }),
    })
      .then(() => {
        setStatus("done");
        setMessage("A sua subscrição foi cancelada. Já não vai receber a nossa newsletter.");
      })
      .catch((err: unknown) => {
        setStatus("error");
        setMessage(getErrorMessage(err, "Não foi possível cancelar a subscrição. O link pode ter expirado ou já ter sido usado."));
      });
  }, [token]);

  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      {status === "loading" && <p className="text-sm text-slate-500">A processar…</p>}
      {status !== "loading" && (
        <div
          className={`rounded-2xl border p-6 text-sm ${
            status === "done" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}
      <Link href="/" className="mt-6 inline-block text-sm font-semibold text-red-600 hover:text-red-700">
        Voltar à página inicial
      </Link>
    </div>
  );
}

export default function NewsletterUnsubscribePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <Suspense fallback={<div className="mx-auto max-w-lg px-6 py-20 text-center text-sm text-slate-500">A carregar…</div>}>
        <UnsubscribeInner />
      </Suspense>
      <Footer />
    </div>
  );
}
