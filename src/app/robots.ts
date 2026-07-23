import { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://parvagas.pt";

// Bulk scraping/crawling without written authorization is prohibited under
// the Termos e Condições de Utilização (/termos) and Política de Utilização
// Aceitável (/utilizacao-aceitavel) — this file is the technical signal;
// see those documents for the binding terms. Named crawlers below are
// blocked outright (mostly AI-training bots with no SEO benefit to us);
// everyone else gets the same allow/disallow shape as real browsers and
// search engines, backed by per-IP rate limits on the API itself.
const _BLOCKED_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "CCBot",
  "Google-Extended",
  "Bytespider",
  "PetalBot",
  "Amazonbot",
  "Applebot-Extended",
  "anthropic-ai",
  "ClaudeBot",
  "Claude-Web",
  "cohere-ai",
  "Diffbot",
  "MJ12bot",
  "DotBot",
  "SemrushBot",
  "AhrefsBot",
  "DataForSeoBot",
  "FirecrawlAgent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/Portal/",
          "/Dashboard/",
          "/Admin/",
          "/Aplicar/",
          "/Login",
          "/Signup",
          "/Acesso/Login",
          "/verify-email",
          "/resend-verification",
          "/Submission/",
          "/api/",
        ],
      },
      ..._BLOCKED_BOTS.map((userAgent) => ({ userAgent, disallow: "/" })),
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
