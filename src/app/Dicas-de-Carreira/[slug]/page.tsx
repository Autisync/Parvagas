import Header from "../../components/Header";
import Footer from "../../components/Footer";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerDictionary } from "@/lib/i18n/server";
import { serverGetJson } from "@/lib/dataClient";

type CareerPost = {
  _id: string;
  slug: string;
  title: string;
  category?: string;
  excerpt?: string;
  readTime?: string;
  publishedAt?: string;
  author?: string;
  coverImage?: string;
  body?: string[];
  takeaways?: string[];
};

async function getPost(slug: string): Promise<CareerPost | null> {
  const data = await serverGetJson<{ post?: CareerPost }>(`/public/career/posts/${slug}`, {
    revalidateSeconds: 600,
  });
  return data?.post ?? null;
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  const dict = getServerDictionary();
  return {
    title: post ? `${post.title} | Parvagas` : dict.careerPost.fallbackTitle,
    description: post?.excerpt ?? dict.careerPost.fallbackDescription,
  };
}

/** Render a paragraph — wrap **bold** spans */
function BodyParagraph({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return (
    <p className="mt-4 text-gray-700 leading-relaxed">
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export default async function CareerPostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();
  const dict = getServerDictionary();

  return (
    <div className="bg-white min-h-screen">
      <Header />
      <main className="py-10 pb-20 px-6 mx-auto max-w-3xl">
        <Link href="/Dicas-de-Carreira/" className="text-sm text-red-700 font-semibold hover:underline">
          ← {dict.careerPost.backToCareer}
        </Link>

        {post.category && (
          <span className="inline-block mt-4 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700">
            {post.category}
          </span>
        )}

        <h1 className="mt-3 text-3xl sm:text-4xl font-bold leading-tight">{post.title}</h1>

        <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-400">
          {post.author && <span>{dict.careerPost.by(post.author)}</span>}
          {post.readTime && <span>⏱ {post.readTime}</span>}
          {post.publishedAt && (
            <span>
              {new Date(post.publishedAt).toLocaleDateString("pt-AO", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
        </div>

        {post.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImage}
            alt={post.title}
            className="mt-6 w-full rounded-2xl object-cover max-h-64"
          />
        )}

        {post.excerpt && (
          <p className="mt-6 text-lg text-gray-600 border-l-4 border-red-200 pl-4 italic">{post.excerpt}</p>
        )}

        <article className="mt-6">
          {post.body?.map((paragraph, i) => (
            <BodyParagraph key={i} text={paragraph} />
          ))}
        </article>

        {post.takeaways && post.takeaways.length > 0 && (
          <aside className="mt-10 rounded-2xl bg-red-50 border border-red-100 p-6">
            <h2 className="font-bold text-lg text-red-700">{dict.careerPost.keyPoints}</h2>
            <ul className="mt-3 space-y-2">
              {post.takeaways.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-0.5 text-red-500">✓</span>
                  {point}
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div className="mt-12 pt-8 border-t border-red-100">
          <Link href="/Dicas-de-Carreira/" className="text-sm text-red-700 font-semibold hover:underline">
            ← {dict.careerPost.viewAll}
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}