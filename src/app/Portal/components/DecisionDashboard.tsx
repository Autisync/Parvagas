type MetricItem = {
  label: string;
  value: string | number;
};

type StatSummaryProps = {
  /** The one number worth leading with — a rate, a total, whatever this
   * page's single most useful figure is. Rendered as plain text next to
   * the metric row, not a separate "dashboard" header. */
  headline: string;
  metrics: MetricItem[];
  /** Short breakdown figures (e.g. "Rejeitadas: 3"), shown inline as a
   * caption — not a boxed "quick report" section. */
  notes?: string[];
  className?: string;
};

/** A compact row of real, page-computed numbers. Deliberately does not try
 * to be a "dashboard" (no canned advice, no restated heading) — every field
 * here comes straight from the page's own data, nothing generated. */
export default function StatSummary({
  headline,
  metrics,
  notes,
  className = "",
}: StatSummaryProps) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`.trim()}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-slate-900">{headline}</p>
        {notes && notes.length > 0 && (
          <p className="text-xs text-slate-500">{notes.join(" · ")}</p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((metric, index) => (
          <article
            key={metric.label}
            className={
              index === 0
                ? "rounded-xl border border-red-100 bg-red-50/60 p-3"
                : "rounded-xl border border-slate-100 p-3"
            }
          >
            <p className="text-xs font-medium text-slate-500">{metric.label}</p>
            <p className={`mt-1 text-xl font-bold ${index === 0 ? "text-red-700" : "text-slate-900"}`}>
              {metric.value}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
