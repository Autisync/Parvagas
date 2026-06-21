"use client";

import { useEffect } from "react";
import { track, type FunnelEvent } from "@/lib/analytics";

/** Fires a funnel event once on mount (for server-rendered pages). */
export default function TrackOnMount({ event }: { event: FunnelEvent }) {
  useEffect(() => {
    track(event);
  }, [event]);
  return null;
}
