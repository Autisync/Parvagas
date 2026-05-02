import Header from "../components/Header";
import Footer from "../components/Footer";
import Link from "next/link";

const sections = [
  { href: "/Portal/Candidato/Meu-Perfil/", label: "Meu Perfil" },
  { href: "/Portal/Candidato/Vagas-Recomendadas/", label: "Vagas Recomendadas" },
  { href: "/Portal/Candidato/Vagas-Disponiveis/", label: "Vagas Disponíveis" },
  { href: "/Portal/Candidato/Vagas-Guardadas/", label: "Vagas Guardadas" },
  { href: "/Portal/Candidato/Candidaturas/", label: "Candidaturas" },
  { href: "/Portal/Candidato/CV-e-Documentos/", label: "CV e Documentos" },
  { href: "/Portal/Candidato/Alertas/", label: "Alertas" },
  { href: "/Portal/Candidato/Definicoes/", label: "Definições" },
  { href: "/Portal/Empresa/", label: "Portal Empresa" },
  { href: "/Portal/Admin/", label: "Admin" },
];

export default function PortalPage() {
  return (
    <div className="bg-white min-h-screen">
      <Header />
      <main className="px-6 py-8 mx-auto max-w-5xl">
        <h1 className="text-4xl font-bold">Portal</h1>
        <p className="mt-3 text-gray-700">Acesso rápido aos módulos do candidato.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {sections.map((section) => (
            <Link key={section.href} href={section.href} className="rounded-2xl border border-red-100 p-5 font-semibold hover:bg-red-50">
              {section.label}
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
