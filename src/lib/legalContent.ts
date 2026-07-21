import { serverGetJson } from "@/lib/dataClient";

export type LegalDocumentSummary = {
  slug: string;
  title: string;
  category: string;
  audience: "public" | "employer" | "internal";
  requiresAcceptance: boolean;
  versionLabel: string;
  effectiveDate: string | null;
};

export type LegalDocumentFull = LegalDocumentSummary & {
  versionId: string;
  bodyMarkdown: string;
};

/** Every published public/employer legal document — the data behind the
 * /legal hub. Revalidated every 10 minutes; a document only changes when
 * an admin explicitly publishes a new version, so this doesn't need to be
 * fresher than that. */
export async function getLegalDocuments(): Promise<LegalDocumentSummary[]> {
  const data = await serverGetJson<{ documents?: LegalDocumentSummary[] }>("/legal/documents", {
    revalidateSeconds: 600,
  });
  return data?.documents ?? [];
}

/** Full content of one published document, or null if it doesn't exist,
 * isn't public/employer audience, or has no published version yet. */
export async function getLegalDocument(slug: string): Promise<LegalDocumentFull | null> {
  return serverGetJson<LegalDocumentFull>(`/legal/documents/${encodeURIComponent(slug)}`, {
    revalidateSeconds: 600,
  });
}

export function formatEffectiveDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}
