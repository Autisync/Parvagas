import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeExternalHref } from "@/lib/safeUrl";

const UL = "list-disc space-y-1.5 pl-5 marker:text-red-400";

/** Cross-reference / mailto / external link renderer for legal-document
 * markdown. Internal routes (starting with "/") go through Next's Link;
 * mailto: passes through as-is; anything else is scheme-validated via
 * safeExternalHref (same defense-in-depth guard used for scraped-content
 * links) and rendered as inert text if it fails, rather than a broken or
 * unsafe href. */
function LegalLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  if (!href) return <>{children}</>;
  if (href.startsWith("/")) {
    return (
      <Link href={href} className="font-semibold text-red-700 hover:underline">
        {children}
      </Link>
    );
  }
  if (href.startsWith("mailto:")) {
    return (
      <a href={href} className="font-semibold text-red-700 hover:underline">
        {children}
      </a>
    );
  }
  const safe = safeExternalHref(href);
  if (!safe) return <>{children}</>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className="font-semibold text-red-700 hover:underline">
      {children}
    </a>
  );
}

/** Shared renderer for legal-document body_markdown — maps the fixed
 * subset of Markdown these documents use (headings, bold, links, lists,
 * tables, blockquotes, rules) onto the visual language already
 * established by the hand-written legal pages (LegalShell/LegalSection). */
export default function LegalMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => <h2 className="text-xl font-bold text-slate-900 mt-10 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-lg font-bold text-slate-900 mt-6">{children}</h3>,
        p: ({ children }) => <p className="mt-3 text-[15px] leading-7 text-slate-700">{children}</p>,
        ul: ({ children }) => <ul className={`mt-3 ${UL}`}>{children}</ul>,
        li: ({ children }) => <li className="text-[15px] leading-7 text-slate-700">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
        a: LegalLink,
        hr: () => <hr className="my-8 border-slate-200" />,
        blockquote: ({ children }) => (
          <blockquote className="mt-3 rounded-r-lg border-l-4 border-amber-300 bg-amber-50 px-4 py-2 text-[14px] text-slate-700">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
        th: ({ children }) => (
          <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {children}
          </th>
        ),
        td: ({ children }) => <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">{children}</td>,
        code: ({ children }) => <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] text-slate-800">{children}</code>,
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
