import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://parvagas.pt";
  const staticRoutes = [
    "",
    "/Vagas-Disponiveis/",
    "/Empresa/",
    "/Dicas-de-Carreira/",
    "/Portal/",
    "/privacidade/",
    "/termos/",
    "/politica-retencao/",
    "/termos-empregador/",
  ];

  return staticRoutes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
  }));
}
