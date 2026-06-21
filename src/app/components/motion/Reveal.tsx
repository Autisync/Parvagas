"use client";

import { useEffect, useRef, useState, type ReactNode, type ElementType } from "react";

type Props = {
  children: ReactNode;
  /** Entrance style. */
  variant?: "up" | "fade" | "scale";
  /** Delay in ms before the entrance plays. */
  delay?: number;
  /** Wrapper element. */
  as?: ElementType;
  className?: string;
};

const VARIANT_KEYFRAMES: Record<NonNullable<Props["variant"]>, string> = {
  up: "pv-fade-in-up",
  fade: "pv-fade-in",
  scale: "pv-scale-in",
};

/**
 * Scroll-reveal wrapper. Content is rendered immediately (no visibility gating,
 * so SSR/headless renders are never blank); the entrance plays once when the
 * element enters the viewport. Under prefers-reduced-motion it renders plainly.
 */
export default function Reveal({
  children,
  variant = "up",
  delay = 0,
  as: Tag = "div",
  className = "",
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [play, setPlay] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPlay(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style =
    play && !reduced
      ? {
          animation: `${VARIANT_KEYFRAMES[variant]} var(--dur-slow) var(--ease-out-quint) ${delay}ms both`,
        }
      : undefined;

  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  );
}
