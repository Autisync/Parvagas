"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

/** Self-hosted animation files live in public/lottie/<name>.json. */
export type LottieAnimationName = "empty-state" | "success-check" | "milestone-celebration";

type Props = {
  /** Which self-hosted animation to load (public/lottie/<name>.json). */
  name: LottieAnimationName;
  /** Loop forever (empty states) vs play once (success/milestone moments). */
  loop?: boolean;
  /** Optional caption rendered below the animation. */
  caption?: string;
  /** Square size in px for the animation canvas. */
  size?: number;
  className?: string;
  captionClassName?: string;
  /** Fires once a non-looping animation finishes playing. */
  onComplete?: () => void;
};

/**
 * Shared wrapper around lottie-react for the small set of self-hosted
 * animations in public/lottie/. Lazy-loaded client-side only (no SSR),
 * honours prefers-reduced-motion by not looping, and optionally renders a
 * caption underneath. Keep usage to empty states, success moments and the
 * profile-completion milestone — not a general-purpose loader replacement.
 */
export default function LottieBlock({
  name,
  loop = false,
  caption,
  size = 160,
  className = "",
  captionClassName = "",
  onComplete,
}: Props) {
  const [animationData, setAnimationData] = useState<Record<string, unknown> | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/lottie/${name}.json`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        /* Animation is decorative — fail silently and just skip rendering it. */
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  // Looping animations pause on a static frame under reduced motion; one-shot
  // confirmation animations (success/milestone) still play briefly once.
  const shouldAutoplay = loop ? !reducedMotion : true;
  const shouldLoop = loop && !reducedMotion;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div style={{ width: size, height: size }} aria-hidden="true">
        {animationData && (
          <Lottie
            animationData={animationData}
            loop={shouldLoop}
            autoplay={shouldAutoplay}
            onComplete={onComplete}
            style={{ width: "100%", height: "100%" }}
          />
        )}
      </div>
      {caption && <p className={`mt-3 text-center text-sm text-slate-500 ${captionClassName}`}>{caption}</p>}
    </div>
  );
}
