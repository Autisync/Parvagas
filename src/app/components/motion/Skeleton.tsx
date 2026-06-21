"use client";

type Props = {
  className?: string;
  /** Convenience for a rounded line of text. */
  rounded?: boolean;
  width?: string | number;
  height?: string | number;
};

/** Shimmer skeleton placeholder for loading states. */
export default function Skeleton({ className = "", rounded = false, width, height }: Props) {
  return (
    <span
      aria-hidden
      className={`app-skeleton block ${rounded ? "rounded-full" : ""} ${className}`}
      style={{ width, height }}
    />
  );
}

/** A common stacked-text skeleton used in lists and cards. */
export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}
