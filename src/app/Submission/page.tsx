// "use client";
// import { useState } from "react";
import Image from "next/image";
import CVForm from "../components/Apply/CVForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  openGraph: {
    title: "ParVaga | CV",
    description:"emos uma base de dados para ajudar transformar o seu futuro profissional hoje!",
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
  // const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="">
      <CVForm />
    </div>
  );
}
