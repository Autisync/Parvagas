import { notFound } from "next/navigation";
import LegalShell from "./LegalShell";
import LegalMarkdown from "./LegalMarkdown";
import { getLegalDocument, formatEffectiveDate } from "@/lib/legalContent";

/** Shared server-rendered body for every /legal/* page: fetch the
 * document's current published version from the DB-backed CMS and render
 * it through the same shell/typography every legal document uses. A
 * missing/unpublished/internal-audience slug renders the normal Next.js
 * 404, not a broken page. */
export default async function LegalDocPage({ slug, subtitle }: { slug: string; subtitle: string }) {
  const doc = await getLegalDocument(slug);
  if (!doc) notFound();

  return (
    <LegalShell
      title={doc.title}
      subtitle={subtitle}
      effectiveDate={formatEffectiveDate(doc.effectiveDate)}
      versionLabel={doc.versionLabel}
    >
      <LegalMarkdown markdown={doc.bodyMarkdown} />
    </LegalShell>
  );
}
