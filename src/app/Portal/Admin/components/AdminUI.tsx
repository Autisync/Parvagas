import type { ReactNode } from "react";

export const adminFieldClass =
  "rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-300 focus:ring-4 focus:ring-red-100";

export const adminButtonClass =
  "rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60";

export const adminSecondaryButtonClass =
  "app-btn-secondary";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </section>
  );
}

export function AdminFilterBar({ children }: { children: ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-3">{children}</div>
    </section>
  );
}

export function AdminAlert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "warning";
  children: ReactNode;
}) {
  const classes = {
    error: "border-rose-200 bg-rose-50 text-rose-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  };

  return <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${classes[tone]}`}>{children}</div>;
}

export function AdminRestricted({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Acesso restrito</p>
      <h1 className="mt-2 text-2xl font-bold text-amber-950">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-amber-800">{children}</p>
    </div>
  );
}

export function AdminEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function AdminModal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-950">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path fillRule="evenodd" d="M4.22 4.22a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06L11.06 10l4.72 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 01-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="border-t border-slate-200 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
