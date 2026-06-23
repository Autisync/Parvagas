import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Parvagas — Emprego em Angola",
    short_name: "Parvagas",
    description: "Encontre vagas e talentos em Angola. Funciona em redes lentas.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#dc2626",
    lang: "pt",
    icons: [
      { src: "/icon2.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon2.ico", sizes: "48x48", type: "image/x-icon" },
    ],
  };
}
