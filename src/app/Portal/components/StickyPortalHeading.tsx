import { ReactNode } from "react";

type StickyPortalHeadingProps = {
  title: string;
  subtitle: string;
  meta?: string;
  action?: ReactNode;
  topClassName?: string;
};

export default function StickyPortalHeading({
  title,
  subtitle,
  meta,
  action,
  topClassName: _topClassName,
}: StickyPortalHeadingProps) {
  return (
    <section className="mb-6 rounded-2xl border border-rose-100 bg-gradient-to-r from-white via-rose-50 to-amber-50 px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          {meta && <p className="mt-1 text-xs font-semibold text-slate-500">{meta}</p>}
        </div>
        {action}
      </div>
    </section>
  );
}
