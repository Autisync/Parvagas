"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
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

const PIE_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#6366f1", "#14b8a6"];

export default function AdminAnalyticsCharts({
  jobsPosted,
  userSignups,
  applications,
  revenue,
  applicationStatus,
  jobsByStatus,
  revenueEnabled,
}: Props) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evolução mensal</p>
        <h3 className="mt-1 text-sm font-semibold text-slate-900">Vagas publicadas vs inscrições</h3>
        <div className="mt-3 h-72" role="img" aria-label="Gráfico de linhas com evolução mensal de vagas e inscrições">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={jobsPosted.map((item, idx) => ({ label: item.label, vagas: item.value, inscricoes: userSignups[idx]?.value || 0 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" stroke="#475569" />
              <YAxis stroke="#475569" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="vagas" name="Vagas" stroke="#dc2626" strokeWidth={2.4} dot={false} />
              <Line type="monotone" dataKey="inscricoes" name="Inscrições" stroke="#0369a1" strokeWidth={2.4} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fluxo de candidaturas</p>
        <h3 className="mt-1 text-sm font-semibold text-slate-900">Submissões por período</h3>
        <div className="mt-3 h-72" role="img" aria-label="Gráfico de barras com submissões de candidaturas por período">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={applications}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" stroke="#475569" />
              <YAxis stroke="#475569" />
              <Tooltip />
              <Bar dataKey="value" name="Candidaturas" fill="#0284c7" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Qualidade operacional</p>
        <h3 className="mt-1 text-sm font-semibold text-slate-900">Distribuição por estado da candidatura</h3>
        <div className="mt-3 h-72" role="img" aria-label="Gráfico de pizza com distribuição por estado da candidatura">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={applicationStatus} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={95} label>
                {applicationStatus.map((entry, idx) => (
                  <Cell key={`${entry.label}-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saúde da moderação</p>
        <h3 className="mt-1 text-sm font-semibold text-slate-900">Vagas por estado de workflow</h3>
        <div className="mt-3 h-72" role="img" aria-label="Gráfico de área com vagas por estado de workflow">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={jobsByStatus}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" stroke="#475569" />
              <YAxis stroke="#475569" />
              <Tooltip />
              <Area type="monotone" dataKey="value" name="Vagas" stroke="#dc2626" fill="#fecaca" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>

      {revenueEnabled && (
        <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Monetização</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">Receita de campanhas por período</h3>
          <div className="mt-3 h-72" role="img" aria-label="Gráfico de receita de campanhas por período">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#475569" />
                <YAxis stroke="#475569" />
                <Tooltip />
                <Bar dataKey="value" name="Receita" fill="#16a34a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      )}
    </div>
  );
}
