import Image from "next/image";
import HeroEmpresa from "../components/Empresa/hero";
import { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";

export const metadata: Metadata = {
  openGraph: {
    title: "ParVaga | Empresas",
    description:
      "Uma plataforma útil para quem procura talento Profissional para seus Projetos em Angola.",
    url: "https://parVagas.co.ao",
    siteName: "parVagas",
    images: [
      {
        url: "https://www.segucyber.ao/public/OG/homepage.png", // Must be an absolute URL
        width: 300,
        height: 300,
      },
      {
        url: "https://www.segucyber.ao/public/OG/homepage.png", // Must be an absolute URL
        width: 300,
        height: 300,
        alt: "Homepage",
      },
    ],
    locale: "pt",
    type: "website",
  },
};

export default function Empresa() {
  return (
    <div>
      <Header />
      <HeroEmpresa />
      <Footer />
    </div>
  );
}
