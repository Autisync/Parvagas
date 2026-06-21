"use client";

import type { ReactNode } from "react";
import AnimatedCounter from "./AnimatedCounter";

type Props = {
  label: string;
  value: number;
  icon?: ReactNode;
  /** Percent change vs. previous period; sign drives the trend pill. */
  trendPct?: number | null;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** Accent tone for the icon chip. */
  tone?: "brand" | "success" | "info" | "warning";
  className?: string;
};

const TONES: Record<NonNullable<Props["tone"]>, { bg: string; fg: string }> = {
  brand: { bg: "var(--brand-50)", fg: "var(--brand-600)" },
  success: { bg: "var(--success-50)", fg: "var(--success-600)" },
  info: { bg: "var(--info-50)", fg: "var(--info-600)" },
  warning: { bg: "var(--warning-50)", fg: "var(--warning-600)" },
};

/**
 * A single KPI tile for dashboards/reporting: animated value, optional icon
 * chip, and a directional trend pill. Replaces the flat "big number" cliché
 * with a calmer, scannable layout.
 */
export default function StatCard({
  label,
  value,
  icon,
  trendPct = null,
  prefix = "",
  suffix = "",
  decimals = 0,
  tone = "brand",
  className = "",
}: Props) {
  const t = TONES[tone];
  const hasTrend = typeof trendPct === "number" && Number.isFinite(trendPct);
  const up = (trendPct ?? 0) >= 0;

  return (
    <div className={`app-card p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[var(--text-muted)]">{label}</p>
        {icon && (
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: t.bg, color: t.fg }}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-3xl font-bold tracking-tight text-[var(--text-strong)]">
          <AnimatedCounter value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
        </span>
      </div>
      {hasTrend && (
        <div className="mt-2">
          <span className={`app-badge ${up ? "app-badge-success" : "app-badge-danger"}`}>
            <span aria-hidden>{up ? "▲" : "▼"}</span>
            {Math.abs(trendPct as number).toFixed(1)}%
            <span className="font-normal text-[var(--text-subtle)]">vs. período anterior</span>
          </span>
        </div>
      )}
    </div>
  );
}
