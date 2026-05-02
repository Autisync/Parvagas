import { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  illustration?: string;
};

export default function EmptyState({ icon, title, description, action, illustration }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 py-16 px-6">
      {illustration ? (
        <div className="mb-4 text-center text-6xl">{illustration}</div>
      ) : icon ? (
        <div className="mb-4 text-slate-300">{icon}</div>
      ) : null}
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-2 max-w-md text-center text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
