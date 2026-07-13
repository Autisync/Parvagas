// Single source of truth for the success/error/warning/info color language
// used by both the inline FeedbackAlert (form/page-level notices) and the
// floating ToastError (transient pills) — previously duplicated with
// slightly different shades in each file, so the two surfaces could drift
// out of sync. Amber is intentionally reserved for genuinely mild,
// non-blocking notices (see FeedbackAlert/ToastError usage) — app-wide
// connection/session/permission issues use AppErrorBanner instead, which
// has its own dedicated, more serious treatment.
export type FeedbackTone = "success" | "error" | "warning" | "info";

export type ToneStyle = {
  container: string;
  title: string;
  message: string;
  button: string;
  icon: string;
};

export const toneStyles: Record<FeedbackTone, ToneStyle> = {
  error: {
    container: "border-rose-200 bg-rose-50",
    title: "text-rose-800",
    message: "text-rose-700",
    button: "border-rose-200 bg-white text-rose-800 hover:bg-rose-100",
    icon: "text-rose-500",
  },
  success: {
    container: "border-emerald-200 bg-emerald-50",
    title: "text-emerald-800",
    message: "text-emerald-700",
    button: "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100",
    icon: "text-emerald-500",
  },
  // Deeper amber-600/900 (not the brighter amber-500) plus a left accent
  // bar so this reads as a deliberate, considered notice rather than
  // caution-tape yellow next to the app's saturated brand-red surfaces.
  warning: {
    container: "border-amber-200 border-l-4 border-l-amber-600 bg-amber-50",
    title: "text-amber-900",
    message: "text-amber-800",
    button: "border-amber-300 bg-white text-amber-900 hover:bg-amber-100",
    icon: "text-amber-600",
  },
  info: {
    container: "border-slate-200 bg-slate-50",
    title: "text-slate-800",
    message: "text-slate-700",
    button: "border-slate-200 bg-white text-slate-800 hover:bg-slate-100",
    icon: "text-slate-500",
  },
};
