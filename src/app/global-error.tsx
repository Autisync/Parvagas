"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="pt" suppressHydrationWarning>
      <body className="bg-slate-100 p-6" suppressHydrationWarning>
        <main className="mx-auto mt-20 max-w-3xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">Falha crítica</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Não foi possível renderizar a aplicação</h1>
          <p className="mt-3 text-sm text-slate-700">
            Detectámos uma falha crítica inesperada. Pode tentar recarregar agora ou voltar para uma área segura do site.
          </p>
          {error?.digest && (
            <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
              Código de suporte: {error.digest}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Recarregar aplicação
            </button>
            <Link href="/" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Voltar ao início
            </Link>
            <a href="mailto:suporte@parvagas.co.ao" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Contactar o suporte
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
