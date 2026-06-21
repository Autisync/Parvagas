"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Toggle to true to fire a burst. Re-fires whenever the value transitions to true. */
  show: boolean;
  /** Confetti particle count (scaled down on reduced motion). */
  count?: number;
  /** Called once the burst finishes. */
  onDone?: () => void;
};

type Particle = {
  x: number; y: number; vx: number; vy: number;
  rot: number; vr: number; size: number; color: string; shape: number;
};

// Brand-led palette so celebrations feel on-brand, not generic party confetti.
const COLORS = ["#dc2626", "#f87171", "#fca5a5", "#f59e0b", "#10b981", "#3b82f6"];

/**
 * Self-contained canvas confetti for milestone moments (profile complete,
 * first job posted, application accepted). Zero dependencies; fixed full-screen
 * canvas that cleans itself up. Honors prefers-reduced-motion with a brief,
 * calm fade instead of a particle storm.
 */
export default function MilestoneCelebration({ show, count = 140, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!show) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.scale(dpr, dpr);

    const n = reduced ? 0 : count;
    const particles: Particle[] = [];
    // Two origins (bottom-left & bottom-right) firing upward and inward.
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      const originX = left ? W * 0.15 : W * 0.85;
      const angle = (left ? -1 : 1) * (Math.PI / 4) + (Math.random() - 0.5) * 0.7;
      const speed = 9 + Math.random() * 9;
      particles.push({
        x: originX,
        y: H * 0.85,
        vx: Math.sin(angle) * speed * (left ? 1 : -1),
        vy: -Math.abs(Math.cos(angle) * speed) - 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        size: 6 + Math.random() * 6,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        shape: (Math.random() * 3) | 0,
      });
    }

    const gravity = 0.28;
    const drag = 0.992;
    let frame = 0;
    const maxFrames = reduced ? 18 : 200;

    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of particles) {
        p.vy += gravity;
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y < H + 40) alive = true;
        const fade = Math.max(0, 1 - frame / maxFrames);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        else if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -p.size / 2);
          ctx.lineTo(p.size / 2, p.size / 2);
          ctx.lineTo(-p.size / 2, p.size / 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      if (alive && frame < maxFrames) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, W, H);
        onDone?.();
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, W, H);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: "var(--z-celebration)" as unknown as number }}
    />
  );
}
