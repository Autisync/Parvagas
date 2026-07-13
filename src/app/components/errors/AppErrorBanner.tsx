import { ArrowPathIcon, ShieldExclamationIcon, XMarkIcon } from "@heroicons/react/24/solid";

type AppErrorBannerProps = {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
};

// System-status bar for blocking, app-wide conditions (connection lost,
// session expired, no permission) — deliberately NOT the amber "warning"
// card used for mild inline notices. These states stop the user from doing
// what they came to do, so the treatment reads as serious and branded
// (dark surface, brand-red accent) rather than a soft caution tip.
export default function AppErrorBanner({
  title = "Ligação indisponível",
  message = "Não conseguimos contactar o servidor neste momento.",
  actionLabel = "Tentar novamente",
  onAction,
  onDismiss,
}: AppErrorBannerProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      // Not position:sticky — this renders as a sibling immediately before
      // the page's own sticky Header (see AppNotifier.tsx), and two
      // independently-stickied top:0 elements in sequence overlap each
      // other on scroll rather than stacking. Staying in normal flow keeps
      // both visible and correctly ordered; it's simply the first thing on
      // the page while it's shown.
      className="relative z-[var(--z-sticky)] w-full border-b border-white/10 bg-slate-900 text-white shadow-[0_4px_16px_-4px_rgba(0,0,0,0.35)]"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-600)]">
            <ShieldExclamationIcon className="h-4 w-4 text-white" aria-hidden="true" />
          </span>
          <p className="min-w-0 text-sm leading-5">
            <span className="font-semibold text-white">{title}.</span>{" "}
            <span className="text-slate-300">{message}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onAction && actionLabel ? (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {actionLabel}
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Fechar aviso"
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <XMarkIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
