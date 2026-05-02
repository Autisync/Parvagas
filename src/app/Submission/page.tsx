import CVForm from "../components/Apply/CVForm";
import { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";

export const metadata: Metadata = {
  openGraph: {
    title: "ParVaga | CV",
    description:
      "Temos uma base de dados para ajudar transformar o seu futuro profissional hoje!",
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

export default function Form() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <CVForm />
      <Footer />
    </div>
  );
}
