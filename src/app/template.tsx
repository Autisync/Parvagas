"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Page-transition wrapper. Next re-mounts template.tsx on every navigation, so
 * keying on the pathname re-triggers a soft fade on each route change. We use an
 * opacity-only animation (pv-animate-fade) on purpose: a transform-based
 * transition would create a containing block and break the sticky headers.
 * Respects prefers-reduced-motion via the global rule in globals.css.
 */
export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="pv-animate-fade">
      {children}
    </div>
  );
}
