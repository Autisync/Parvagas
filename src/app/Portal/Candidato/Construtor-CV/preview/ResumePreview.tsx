"use client";

/**
 * Template dispatcher: renders Resume.data through the client-side mirror
 * of whichever backend template slug is selected. Unknown/missing slugs
 * fall back to ats-classic, matching resume_render_service.render_html()'s
 * behavior exactly.
 */

import AtsClassic, { type PreviewData } from "./AtsClassic";
import Executivo from "./Executivo";
import Moderno from "./Moderno";

export const TEMPLATE_SLUGS = ["ats-classic", "moderno", "executivo"] as const;
export type TemplateSlug = (typeof TEMPLATE_SLUGS)[number];

export default function ResumePreview({ data, templateSlug }: { data: PreviewData; templateSlug?: string | null }) {
  switch (templateSlug) {
    case "moderno":
      return <Moderno data={data} />;
    case "executivo":
      return <Executivo data={data} />;
    default:
      return <AtsClassic data={data} />;
  }
}
