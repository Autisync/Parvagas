import { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://parvagas.pt";

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
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
