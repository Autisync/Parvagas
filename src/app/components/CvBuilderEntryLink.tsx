"use client";

import { MouseEvent, ReactNode, useState } from "react";
import { authFetch, getToken, getUser } from "@/lib/api";
import { RESUME_BUILDER_URL } from "@/lib/resumeBuilder";

type CvBuilderLaunchResponse = {
  launch_url: string;
  expires_in_seconds: number;
};

function shouldOpenInNewTab(event: MouseEvent<HTMLAnchorElement>, openInNewTab: boolean) {
  return openInNewTab || event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
}

export default function CvBuilderEntryLink({
  children,
  className,
  openInNewTab = false,
}: {
  children: ReactNode;
  className?: string;
  openInNewTab?: boolean;
}) {
  const [launching, setLaunching] = useState(false);

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    const token = getToken();
    const user = getUser() as { role?: string } | null;

    if (!token || user?.role !== "candidate") {
      return;
    }

    event.preventDefault();
    if (launching) return;
    setLaunching(true);

    try {
      const returnUrl = `${window.location.origin}/Portal/Candidato/CV-e-Documentos`;
      const response = await authFetch<CvBuilderLaunchResponse>("/cv-builder/session", token, {
        method: "POST",
        body: JSON.stringify({ return_url: returnUrl }),
        suppressGlobalErrors: true,
      });

      if (!response.launch_url) {
        throw new Error("launch url missing");
      }

      if (shouldOpenInNewTab(event, openInNewTab)) {
        const popup = window.open(response.launch_url, "_blank", "noopener,noreferrer");
        if (!popup) window.location.assign(response.launch_url);
      } else {
        window.location.assign(response.launch_url);
      }
    } catch {
      if (shouldOpenInNewTab(event, openInNewTab)) {
        window.open(RESUME_BUILDER_URL, "_blank", "noopener,noreferrer");
      } else {
        window.location.assign(RESUME_BUILDER_URL);
      }
    } finally {
      setLaunching(false);
    }
  };

  return (
    <a
      href={RESUME_BUILDER_URL}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noopener noreferrer" : undefined}
      onClick={handleClick}
      className={className}
      aria-busy={launching || undefined}
    >
      {children}
    </a>
  );
}
