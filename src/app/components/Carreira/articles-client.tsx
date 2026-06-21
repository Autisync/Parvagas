"use client";

import { useState } from "react";
import Link from "next/link";
import CarreiraCategoryStrip from "./category-strip";
import { useClientLocale } from "@/lib/i18n/client";

// Category key → display label mapping used for filtering article.category
const CAT_MAP: Record<string, string> = {
  catCv: "CV",
  catInterview: "Entrevista",
  catCareer: "Carreira",
  catRemote: "Remoto",
};

type CareerPost = {
  _id: string;
  slug: string;
  title: string;
  category?: string;
  excerpt?: string;
  readTime?: string;
  publishedAt?: string;
};

interface Props {
  posts: CareerPost[];
}

export default function CarreiraArticlesClient({ posts }: Props) {
  const { dict } = useClientLocale();
  const cl = dict.careerList;
  const [activeCat, setActiveCat] = useState("catAll");

  const filtered =
    activeCat === "catAll"
      ? posts
      : posts.filter((p) => {
          const cat = (p.category ?? "").toLowerCase();
          const mapped = (CAT_MAP[activeCat] ?? "").toLowerCase();
          return cat.includes(mapped);
        });

  return (
    <section id="artigos" className="bg-gray-50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <h2 className="mb-8 text-2xl font-bold text-gray-900">{cl.articlesTitle}</h2>
      </div>

      {/* Category photo cards + pill filters */}
      <div className="mb-10">
        <CarreiraCategoryStrip active={activeCat} onSelect={setActiveCat} />
      </div>

      {/* Articles grid */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-gray-500">{cl.empty}</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((post) => (
              <Link
                key={post._id}
                href={`/Dicas-de-Carreira/${post.slug}`}
                className="group flex flex-col rounded-2xl border border-red-100 bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                {post.category && (
                  <span className="self-start rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                    {post.category}
                  </span>
                )}
                <h3 className="mt-3 text-base font-bold leading-snug text-gray-900 group-hover:text-red-700 transition-colors line-clamp-2">
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="mt-2 flex-1 text-sm text-gray-500 line-clamp-3">{post.excerpt}</p>
                )}
                <div className="mt-4 flex items-center gap-3 text-xs text-gray-500">
                  {post.readTime && <span>⏱ {post.readTime}</span>}
                  {post.publishedAt && (
                    <span>
                      {new Date(post.publishedAt).toLocaleDateString("pt-AO", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </div>
                <span className="mt-4 inline-block text-sm font-semibold text-red-700 group-hover:underline">
                  {cl.readArticle} →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
