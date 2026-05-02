import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="mx-auto mt-16 max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">Erro 404</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900">A página que procura não foi encontrada</h1>
      <p className="mt-3 text-sm text-slate-700">
        O endereço pode estar desatualizado ou a página pode ter sido movida. Pode continuar a navegação a partir das opções abaixo.
      </p>

      <form action="/Vagas-Disponiveis" method="get" className="mt-6 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="keyword" className="sr-only">Pesquisar vagas</label>
        <input
          id="keyword"
          name="keyword"
          type="text"
          placeholder="Pesquisar vagas por palavra-chave"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-red-300 focus:ring-4 focus:ring-red-100"
        />
        <button type="submit" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Pesquisar
        </button>
      </form>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/" className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
          Voltar ao início
        </Link>
        <Link href="/Vagas-Disponiveis" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Ver vagas disponíveis
        </Link>
        <Link href="/Acesso" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Ir para o portal de acesso
        </Link>
      </div>
    </main>
  );
}
