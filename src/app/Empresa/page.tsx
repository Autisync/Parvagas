import HeroEmpresa from "../components/Empresa/hero";
import EmpresaBenefits from "../components/Empresa/benefits";
import EmpresaSteps from "../components/Empresa/steps";
import EmpresaSocialProof from "../components/Empresa/social-proof";
import EmpresaFaq from "../components/Empresa/faq";
import { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";

export const metadata: Metadata = {
  openGraph: {
    title: "ParVaga | Empresas",
    description:
      "Uma plataforma útil para quem procura talento Profissional para seus Projetos em Angola.",
    url: "https://parvagas.pt/Empresa",
    siteName: "Parvagas",
    // Nested routes that declare their own `openGraph` do NOT inherit the root's
    // file-based opengraph-image, so point at it explicitly. The relative path
    // resolves to an absolute URL via `metadataBase` (the branded 1200×630 PNG
    // from src/app/opengraph-image.tsx). Never hardcode a remote image URL.
    images: ["/opengraph-image"],
    locale: "pt_AO",
    type: "website",
  },
};

export default function Empresa() {
  return (
    <div>
      <Header />
      <HeroEmpresa />
      <EmpresaBenefits />
      <EmpresaSteps />
      <EmpresaSocialProof />
      <EmpresaFaq />
      <Footer />
    </div>
  );
}
