import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://parvagas.pt";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/Portal/", "/Dashboard/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
