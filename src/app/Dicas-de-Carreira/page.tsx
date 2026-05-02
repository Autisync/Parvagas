import Header from "../components/Header";
import Footer from "../components/Footer";
import Link from "next/link";
import { getServerDictionary } from "@/lib/i18n/server";

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
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  try {
    const res = await fetch(`${apiUrl}/public/career/posts?limit=20`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.posts ?? data;
  } catch {
    return [];
  }
}

export default async function DicasCarreiraPage() {
  const posts = await getPosts();
  const dict = getServerDictionary();

  return (
    <div className="bg-white min-h-screen">
      <Header />
      <main className="px-6 py-8 mx-auto max-w-5xl">
        <h1 className="text-4xl font-bold">{dict.careerList.title}</h1>
        <p className="mt-3 text-gray-600 max-w-2xl">
          {dict.careerList.subtitle}
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {posts.length === 0 ? (
            <p className="text-gray-500 col-span-2 py-12 text-center">{dict.careerList.empty}</p>
          ) : (
            posts.map((post) => (
              <Link
                key={post._id}
                href={`/Dicas-de-Carreira/${post.slug}`}
                className="block rounded-2xl border border-red-100 p-5 hover:shadow-md transition-shadow group"
              >
                {post.category && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700">
                    {post.category}
                  </span>
                )}
                <h2 className="text-lg font-bold mt-2 leading-snug group-hover:text-red-700 transition-colors">
                  {post.title}
                </h2>
                {post.excerpt && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{post.excerpt}</p>
                )}
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                  {post.readTime && <span>⏱ {post.readTime}</span>}
                  {post.publishedAt && (
                    <span>{new Date(post.publishedAt).toLocaleDateString("pt-AO", { year: "numeric", month: "short", day: "numeric" })}</span>
                  )}
                </div>
                <span className="inline-block mt-3 text-sm text-red-700 font-semibold group-hover:underline">
                  {dict.careerList.readArticle} →
                </span>
              </Link>
            ))
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
