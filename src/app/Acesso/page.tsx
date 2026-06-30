import type { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Link from "next/link";
import { getServerDictionary } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Aceder à Plataforma",
  description: "Entre ou crie a sua conta Parvagas — para candidatos e empresas em Angola.",
  alternates: { canonical: "/Acesso" },
};

export default async function AccessPortalPage() {
  const dict = await getServerDictionary();
  const accessCards = [
    {
      role: dict.access.candidateRole,
      description: dict.access.candidateDescription,
      loginHref: "/Login?role=candidate",
      signupHref: "/Signup?role=candidate",
    },
    {
      role: dict.access.companyRole,
      description: dict.access.companyDescription,
      loginHref: "/Login?role=company",
      signupHref: "/Signup?role=company",
    },
    {
      role: dict.access.adminRole,
      description: dict.access.adminDescription,
      loginHref: "/Admin/Login",
    },
  ];

  return (
    <div className="bg-white min-h-screen">
      <Header />
      <main className="px-6 py-8 mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold text-slate-900">{dict.access.title}</h1>
        <p className="mt-3 text-slate-600">{dict.access.subtitle}</p>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {accessCards.map((card) => (
            <article key={card.role} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">{card.role}</h2>
              <p className="mt-2 text-sm text-slate-600">{card.description}</p>
              <div className="mt-5 flex gap-2">
                <Link
                  href={card.loginHref}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  {dict.access.login}
                </Link>
                {"signupHref" in card && card.signupHref ? (
                  <Link
                    href={card.signupHref}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
                  >
                    {dict.access.signup}
                  </Link>
                ) : (
                  <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                    {dict.access.inviteOnly}
                  </span>
                )}
              </div>
            </article>
          ))}
        </section>
      </main>
      <Footer />
    </div>
  );
}
