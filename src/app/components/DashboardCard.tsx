import Link from "next/link";
import { ReactNode } from "react";

type DashboardCardProps = {
  href?: string;
  icon?: ReactNode;
  title: string;
  description?: string;
  badge?: string | number;
  badgeColor?: "blue" | "red" | "green" | "amber" | "purple";
  action?: ReactNode;
  loading?: boolean;
  onClick?: () => void;
};

const badgeColors = {
  blue: "bg-blue-100 text-blue-700",
  red: "bg-red-100 text-red-700",
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
};

export default function DashboardCard({
  href,
  icon,
  title,
  description,
  badge,
  badgeColor = "blue",
  action,
  loading = false,
  onClick,
}: DashboardCardProps) {
  const content = (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        {icon && <div className="mt-1 text-slate-400">{icon}</div>}
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {badge !== undefined && (
        <div className={`rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap ${badgeColors[badgeColor]}`}>{badge}</div>
      )}
    </div>
  );

  const cardClass =
    "block rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-slate-300";

  if (loading) {
    return <div className={cardClass + " opacity-50"}>{content}</div>;
  }

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {content}
        {action}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cardClass + " w-full text-left"}>
      {content}
      {action}
    </button>
  );
}
