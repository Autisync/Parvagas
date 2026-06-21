"use client";

import type { ReactNode } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";

type Point = { label: string; value: number };

type Props = {
  jobsPosted: Point[];
  userSignups: Point[];
  applications: Point[];
  revenue: Point[];
  applicationStatus: Point[];
  jobsByStatus: Point[];
  revenueEnabled: boolean;
};

// Cohesive, brand-forward palette (red primary + harmonized accents).
const SERIES = {
  brand: "#dc2626",
  ink: "#0f172a",
  sky: "#2563eb",
  emerald: "#059669",
  amber: "#d97706",
};
const DONUT = ["#dc2626", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#64748b"];

const AXIS = { stroke: "#94a3b8", fontSize: 12 };
const GRID = "#eef2f7";

function PremiumTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      {label != null && <p className="mb-1 text-xs font-medium text-[var(--text-subtle)]">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2 text-sm font-semibold text-[var(--text-strong)]">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          {p.name}: {Number(p.value).toLocaleString("pt-PT")}
        </p>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={`app-card p-5 ${className}`}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-bold text-[var(--text-strong)]">{title}</h3>
      </div>
      {subtitle && <p className="mb-3 text-xs text-[var(--text-muted)]">{subtitle}</p>}
      {children}
    </article>
  );
}

export default function AdminAnalyticsCharts({
  jobsPosted,
  userSignups,
  applications,
  revenue,
  applicationStatus,
  jobsByStatus,
  revenueEnabled,
}: Props) {
  const trend = jobsPosted.map((item, idx) => ({
    label: item.label,
    vagas: item.value,
    inscricoes: userSignups[idx]?.value || 0,
  }));
  const totalApps = applicationStatus.reduce((s, p) => s + p.value, 0);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* Trend — area (jobs) + line (signups) with gradient fill */}
      <ChartCard title="Vagas publicadas vs inscrições" subtitle="Evolução nos últimos períodos">
        <div className="h-72" role="img" aria-label="Evolução de vagas e inscrições">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gradVagas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES.brand} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={SERIES.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
              <Tooltip content={<PremiumTooltip />} cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }} />
              <Area type="monotone" dataKey="vagas" name="Vagas" stroke={SERIES.brand} strokeWidth={2.5} fill="url(#gradVagas)" />
              <Line type="monotone" dataKey="inscricoes" name="Inscrições" stroke={SERIES.sky} strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Applications per period — rounded gradient bars */}
      <ChartCard title="Submissões de candidaturas" subtitle="Volume por período">
        <div className="h-72" role="img" aria-label="Submissões de candidaturas por período">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={applications} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gradApps" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES.sky} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={SERIES.sky} stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
              <Tooltip content={<PremiumTooltip />} cursor={{ fill: "rgba(37,99,235,0.06)" }} />
              <Bar dataKey="value" name="Candidaturas" fill="url(#gradApps)" radius={[6, 6, 0, 0]} maxBarSize={42} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Application status — donut with centered total + custom legend */}
      <ChartCard title="Distribuição por estado" subtitle="Candidaturas por fase do funil">
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative h-56 w-full sm:h-64 sm:w-1/2" role="img" aria-label="Distribuição de candidaturas por estado">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={applicationStatus} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none">
                  {applicationStatus.map((entry, idx) => (
                    <Cell key={`${entry.label}-${idx}`} fill={DONUT[idx % DONUT.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PremiumTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-[var(--text-strong)]">{totalApps.toLocaleString("pt-PT")}</span>
              <span className="text-xs text-[var(--text-muted)]">total</span>
            </div>
          </div>
          <ul className="w-full flex-1 space-y-2">
            {applicationStatus.map((entry, idx) => (
              <li key={entry.label} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-[var(--text-muted)]">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DONUT[idx % DONUT.length] }} />
                  {entry.label}
                </span>
                <span className="font-semibold text-[var(--text-strong)]">{entry.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </ChartCard>

      {/* Jobs by workflow status — horizontal rounded bars */}
      <ChartCard title="Vagas por estado de workflow" subtitle="Saúde da fila de moderação">
        <div className="h-64" role="img" aria-label="Vagas por estado de workflow">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={jobsByStatus} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={120} />
              <Tooltip content={<PremiumTooltip />} cursor={{ fill: "rgba(220,38,38,0.06)" }} />
              <Bar dataKey="value" name="Vagas" radius={[0, 6, 6, 0]} maxBarSize={26}>
                {jobsByStatus.map((entry, idx) => (
                  <Cell key={entry.label} fill={DONUT[idx % DONUT.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {revenueEnabled && (
        <ChartCard title="Receita de campanhas" subtitle="Monetização por período" className="xl:col-span-2">
          <div className="h-72" role="img" aria-label="Receita de campanhas por período">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenue} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES.emerald} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={SERIES.emerald} stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
                <YAxis tick={AXIS} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<PremiumTooltip />} cursor={{ fill: "rgba(5,150,105,0.06)" }} />
                <Bar dataKey="value" name="Receita" fill="url(#gradRev)" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
