import { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  badge?: string;
};

export default function PageHeader({ title, description, action, badge }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        {badge && <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-2">{badge}</p>}
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        {description && <p className="mt-2 text-slate-600">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
