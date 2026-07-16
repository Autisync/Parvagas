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
    <section className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-slate-600">{subtitle}</p>
        {meta && <p className="mt-1 text-sm font-medium text-slate-500">{meta}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </section>
  );
}
