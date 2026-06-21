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
    url: "https://parvagas.pt",
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
      <EmpresaBenefits />
      <EmpresaSteps />
      <EmpresaSocialProof />
      <EmpresaFaq />
      <Footer />
    </div>
  );
}
