import Image from "next/image";
import Hero from "./components/Mainpage/hero";
import Section2 from "./components/Mainpage/Section2";
import { Metadata } from "next";
import Processo from './components/Mainpage/processo';
import Dicas from './components/Mainpage/dicas'

export const metadata: Metadata = {
  openGraph: {
    title: "ParVaga | Início",
    description:"ParVagas é um site de recrutamento em Angola que recolhe CV's para Partilhar com Empresas procurando Talentos Profissionais.",
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

export default function Home() {
  return (
    <div>
      <Hero/>
      <Section2/>
      {/* <Processo/> */}
      <Dicas/>
    </div>
  );
}
