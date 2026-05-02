type MetricItem = {
  label: string;
  value: string | number;
};

type DecisionDashboardProps = {
  title: string;
  subtitle: string;
  badge?: string;
  metrics: MetricItem[];
  reportLines: string[];
  actionLines: string[];
  className?: string;
};

export default function DecisionDashboard({
  title,
  subtitle,
  badge,
  metrics,
  reportLines,
  actionLines,
  className = "",
}: DecisionDashboardProps) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
        {badge && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {badge}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{metric.value}</p>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-100 p-3">
          <p className="text-sm font-semibold text-slate-800">Relatorio rapido</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {reportLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-100 p-3">
          <p className="text-sm font-semibold text-slate-800">Acoes recomendadas</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {actionLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
