import Header from "../components/Header";
import Footer from "../components/Footer";
import CarreiraHero from "../components/Carreira/hero";
import CarreiraArticlesClient from "../components/Carreira/articles-client";
import { getServerDictionary } from "@/lib/i18n/server";
import { serverGetJson } from "@/lib/dataClient";
import type { Metadata } from "next";

type CareerPost = {
  _id: string;
  slug: string;
  title: string;
  category?: string;
  excerpt?: string;
  readTime?: string;
  publishedAt?: string;
  featuredOnHome?: boolean;
};

async function getPosts(): Promise<CareerPost[]> {
  const data = await serverGetJson<{ posts?: CareerPost[] }>("/public/career/posts?limit=20", {
    revalidateSeconds: 600,
  });
  return data?.posts ?? [];
}

export const metadata: Metadata = {
  title: "Dicas de Carreira | Parvagas",
  description:
    "Conteúdo editorial para melhorar candidatura, entrevistas e posicionamento profissional no mercado angolano.",
};

export default async function DicasCarreiraPage() {
  const posts = await getPosts();

  return (
    <div className="bg-white min-h-screen">
      <Header />
      <main>
        <CarreiraHero />
        <CarreiraArticlesClient posts={posts} />
      </main>
      <Footer />
    </div>
  );
}
