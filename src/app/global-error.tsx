"use client";

import { useEffect } from "react";

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
    <html lang="pt">
      <body className="bg-slate-100 p-6">
        <main className="mx-auto mt-20 max-w-2xl rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">Falha crítica</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Não foi possível renderizar a aplicação</h1>
          <p className="mt-2 text-sm text-slate-600">{error?.message || "Erro inesperado."}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Recarregar aplicação
          </button>
        </main>
      </body>
    </html>
  );
}
