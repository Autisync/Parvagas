import CVForm from "../components/Apply/CVForm";
import CVBuilderAuthCTA from "../components/Apply/CVBuilderAuthCTA";
import SubmissionPathChooser from "../components/Apply/SubmissionPathChooser";
import { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";

export const metadata: Metadata = {
  openGraph: {
    title: "Parvagas | Criar CV",
    description:
      "Crie o seu currículo e candidate-se a vagas em Angola em poucos minutos.",
    url: "https://parvagas.pt/Submission",
    siteName: "Parvagas",
    // Explicit ref to the branded generated OG image (nested routes with their
    // own openGraph don't inherit the root file-based one). Resolves to an
    // absolute URL via metadataBase. Never hardcode a remote image URL.
    images: ["/opengraph-image"],
    locale: "pt_AO",
    type: "website",
  },
};

export default function Form() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <SubmissionPathChooser />
      <CVBuilderAuthCTA />
      <CVForm />
      <Footer />
    </div>
  );
}
