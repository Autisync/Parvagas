"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  /** Animation duration in ms. */
  duration?: number;
  /** Decimal places to render. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Locale for number grouping (defaults to pt-PT). */
  locale?: string;
};

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Count-up number for stats and reporting. Animates once when scrolled into
 * view; jumps straight to the value under prefers-reduced-motion.
 */
export default function AnimatedCounter({
  value,
  duration = 1100,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
  locale = "pt-PT",
}: Props) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Scoped to this effect run (not a ref) so a later `value` update — e.g.
    // a placeholder stat replaced by the real fetched number — gets its own
    // fresh animate-or-jump decision instead of being silently dropped by a
    // "already started" guard left over from the previous value.
    let started = false;
    let rafId: number | null = null;

    const run = () => {
      if (started) return;
      started = true;
      if (reduced) {
        setDisplay(value);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        setDisplay(value * easeOutExpo(t));
        if (t < 1) rafId = requestAnimationFrame(step);
        else setDisplay(value);
      };
      rafId = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [value, duration]);

  const formatted = display.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
