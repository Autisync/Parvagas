"use client";

import { useEffect, useState } from "react";

type Props = {
  size?: number;
  /** Tone of the badge. */
  tone?: "success" | "brand";
  /** Optional label rendered below the mark. */
  label?: string;
  className?: string;
};

/**
 * Animated completion checkmark — an SVG circle + check that draw in, with a
 * soft pulsing ring. Used to confirm a completed action (apply, save, submit).
 * Falls back to a static mark under prefers-reduced-motion.
 */
export default function SuccessCheck({ size = 72, tone = "success", label, className = "" }: Props) {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const color = tone === "brand" ? "var(--brand-600)" : "var(--success-600)";
  const ring = tone === "brand" ? "var(--brand-200)" : "#a7f3d0";

  return (
    <div className={`relative inline-flex flex-col items-center gap-3 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        {!reduced && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              border: `2px solid ${ring}`,
              animation: "pv-ring-pulse 1100ms var(--ease-out-quint) 120ms 1",
            }}
          />
        )}
        <svg
          viewBox="0 0 52 52"
          width={size}
          height={size}
          role="img"
          aria-label={label || "Concluído"}
          style={{ display: "block" }}
        >
          <circle
            cx="26"
            cy="26"
            r="24"
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeDasharray="151"
            strokeDashoffset={reduced ? 0 : 151}
            style={
              reduced
                ? undefined
                : { animation: "pv-check-draw 520ms var(--ease-out-quint) forwards" }
            }
          />
          <path
            d="M15 27 l7 7 l15 -15"
            fill="none"
            stroke={color}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="40"
            strokeDashoffset={reduced ? 0 : 40}
            style={
              reduced
                ? undefined
                : { animation: "pv-check-draw 360ms var(--ease-out-quint) 420ms forwards" }
            }
          />
        </svg>
      </div>
      {label && <p className="text-sm font-semibold text-[var(--text-strong)]">{label}</p>}
    </div>
  );
}
