import { DocumentArrowUpIcon, PencilSquareIcon } from "@heroicons/react/24/outline";

/**
 * Entry point for /Submission: lets a visitor self-select between the two
 * very different flows on this page (build a CV from scratch vs. upload an
 * existing one) instead of landing directly on a 20-field form with no
 * framing. Both cards jump to their section via anchor — #criar-cv is also
 * the direct link Header's "Construtor de CV" CTA sends anonymous visitors
 * to, so that path is listed first.
 */
export default function SubmissionPathChooser() {
  return (
    <section className="bg-slate-50 px-4 pb-4 pt-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">Criar CV</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Como quer começar?
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Escolha a opção que se aplica a si — leva menos de um minuto a decidir.
        </p>

        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          <a
            href="#criar-cv"
            className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-red-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 transition group-hover:bg-red-100">
              <PencilSquareIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-bold text-slate-950">Ainda não tenho CV</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              Crie uma conta gratuita e construa um currículo do zero, directamente na plataforma.
            </p>
            <span className="mt-4 text-sm font-semibold text-red-600 group-hover:text-red-700">
              Criar CV do Zero →
            </span>
          </a>

          <a
            href="#submeter-cv"
            className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-red-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-slate-200">
              <DocumentArrowUpIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-bold text-slate-950">Já tenho um CV</h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              Submeta o seu CV existente (PDF ou DOCX) junto com os seus dados profissionais.
            </p>
            <span className="mt-4 text-sm font-semibold text-slate-700 group-hover:text-slate-900">
              Submeter CV →
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
