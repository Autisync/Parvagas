import Image from "next/image";
import Nav from "../components/DashboardContent/Nav";
import { Metadata } from "next";

export const metadata: Metadata = {
  openGraph: {
    title: "ParVaga | Dasboard",
    description: "Plataforma útil para agerir talento Profissional submetido.",
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

export default function Dashboard() {
  return (
    <div>
      <Nav />
    </div>
  );
}
