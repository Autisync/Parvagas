"use client";

import { useEffect, useRef, useState } from "react";

export const SIDEBAR_COLLAPSED_WIDTH = 76;
export const SIDEBAR_EXPANDED_WIDTH = 260;

/**
 * Shared shell for the desktop portal sidebars (candidate/company/admin):
 * owns collapse state (persisted per-portal via `storageKey`) AND the
 * sticky top bar's live bottom offset, so the `<aside>` can dock `fixed`
 * to the true viewport edge without drifting out of sync with content.
 *
 * `forceCollapsed` lets a route (e.g. the CV builder) override the user's
 * manual choice without touching localStorage — hover-to-reveal still
 * works identically regardless of which source collapsed it.
 */
export function useCollapsibleSidebarShell(storageKey: string, forceCollapsed = false) {
  const [manualCollapsed, setManualCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [topOffset, setTopOffset] = useState(0);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "1") setManualCollapsed(true);
    setHydrated(true);

    const header = document.querySelector("header");
    if (!header) return;
    const update = () => setTopOffset(header.getBoundingClientRect().bottom);
    update();

    // Scroll fires far faster than paint on some devices (mobile momentum
    // scroll can be dozens/sec) — getBoundingClientRect() forces a
    // synchronous layout read, so coalesce to at most one per animation
    // frame instead of running it uncapped on every scroll event. This
    // listener is present on every page of the authenticated portal, so any
    // per-event cost here is maximally multiplied across traffic.
    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    };

    // Header's own size changing (e.g. wraps to a taller row).
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(header);
    // A connectivity/session error banner can mount as a direct child of
    // <body>, shifting the header down without resizing the header itself
    // — a ResizeObserver on the header alone never sees that. A
    // MutationObserver on body's direct children catches it being
    // inserted/removed.
    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(document.body, { childList: true });
    // The banner-vs-stuck-header transition unfolds over the first ~50px
    // of scroll — re-measure live rather than only on mount.
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [storageKey]);

  const collapsed = forceCollapsed || (hydrated && manualCollapsed);
  // Hover always reveals a collapsed rail in full, regardless of whether the
  // collapse was forced by the route or toggled manually.
  const showExpanded = !collapsed || hovering;

  const toggleManualCollapsed = () => {
    // The toggle button lives inside the aside, so the mouse is still
    // physically resting over it when clicked — without this, `hovering`
    // would stay true and the aside would keep rendering expanded while
    // the content offset (which tracks `collapsed`, not `hovering`) shifts
    // underneath it.
    setHovering(false);
    setManualCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  };

  const labelClass = (extra = "") =>
    [
      "overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out",
      showExpanded ? "max-w-[180px] opacity-100 delay-100" : "max-w-0 opacity-0 delay-0",
      extra,
    ].join(" ");

  return {
    asideRef,
    manualCollapsed,
    collapsed,
    showExpanded,
    hovering,
    setHovering,
    topOffset,
    toggleManualCollapsed,
    labelClass,
  };
}
