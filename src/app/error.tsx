"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <main className="mx-auto mt-16 max-w-3xl rounded-3xl border border-red-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">Erro 500</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900">Tivemos uma falha ao carregar esta página</h1>
      <p className="mt-3 text-sm text-slate-700">
        Não foi possível concluir a operação agora. Verifique se a ligação à internet está activa e tente novamente.
      </p>
      {error?.digest && (
        <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
          Código de suporte: {error.digest}
        </p>
      )}

      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const term = query.trim();
          if (!term) return;
          router.push(`/Vagas-Disponiveis?keyword=${encodeURIComponent(term)}`);
        }}
      >
        <label htmlFor="error-search" className="sr-only">Pesquisar vagas</label>
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            id="error-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pesquisar vagas por palavra-chave"
            className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-red-300 focus:ring-4 focus:ring-red-100"
          />
        </div>
        <button type="submit" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Pesquisar
        </button>
      </form>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-800"
        >
          Tentar novamente
        </button>
        <Link href="/" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Voltar ao início
        </Link>
        <Link href="/Vagas-Disponiveis" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Ver vagas disponíveis
        </Link>
      </div>
    </main>
  );
}
