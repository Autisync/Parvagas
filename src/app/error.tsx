"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="mx-auto mt-16 max-w-2xl rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">Erro de aplicação</p>
      <h2 className="mt-2 text-2xl font-bold text-rose-900">Ocorreu um problema inesperado</h2>
      <p className="mt-2 text-sm text-rose-800">
        {error?.message || "Não foi possível concluir esta operação."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800"
      >
        Tentar novamente
      </button>
    </div>
  );
}
