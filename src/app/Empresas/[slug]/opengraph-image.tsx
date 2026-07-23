import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { serverGetJson } from "@/lib/dataClient";

// Per-company Open Graph image for /Empresas/[slug] — mirrors
// src/app/cv/[slug]/opengraph-image.tsx, swapping the candidate card for
// the company's own logo/industry/location so a shared link previews as
// *that employer's* branding card, not a generic gradient with text.
export const alt = "Empresa — Parvagas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const revalidate = 3600;

type PublicCompany = {
  name: string;
  industry?: string | null;
  location?: string | null;
  logo?: string | null;
};
type PublicCompanyResponse = { company: PublicCompany };

const logoDataUri = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "icon2.png")
).toString("base64")}`;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function CompanyOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await serverGetJson<PublicCompanyResponse>(`/public/companies/${encodeURIComponent(slug)}`, {
    revalidateSeconds: 60,
  });

  const name = data?.company.name?.trim() || "Empresa";
  const industry = data?.company.industry?.trim() || "";
  const location = data?.company.location?.trim() || "";
  const initials = getInitials(name);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: "linear-gradient(135deg, #dc2626 0%, #7f1d1d 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -140,
            bottom: -180,
            width: 560,
            height: 560,
            borderRadius: "9999px",
            border: "24px solid rgba(255,255,255,0.08)",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", padding: "52px 64px 0 64px" }}>
          <img src={logoDataUri} width={44} height={44} style={{ borderRadius: 8 }} />
          <div style={{ marginLeft: 16, fontSize: 26, fontWeight: 800, color: "white", letterSpacing: "0.04em" }}>
            PARVAGAS
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", padding: "0 64px" }}>
          <div
            style={{
              display: "flex",
              width: 152,
              height: 152,
              flexShrink: 0,
              borderRadius: "9999px",
              background: "rgba(255,255,255,0.16)",
              border: "3px solid rgba(255,255,255,0.55)",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 60,
              fontWeight: 800,
              color: "white",
            }}
          >
            {initials}
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginLeft: 44, maxWidth: 800 }}>
            <div style={{ display: "flex", fontSize: 62, fontWeight: 800, color: "white", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
              {name}
            </div>
            {industry && (
              <div style={{ display: "flex", fontSize: 32, color: "rgba(255,255,255,0.92)", marginTop: 14, fontWeight: 600 }}>
                {industry}
              </div>
            )}
            {location && (
              <div style={{ display: "flex", alignItems: "center", marginTop: 18 }}>
                <div style={{ display: "flex", width: 8, height: 8, borderRadius: "9999px", background: "rgba(255,255,255,0.7)" }} />
                <div style={{ display: "flex", marginLeft: 10, fontSize: 25, color: "rgba(255,255,255,0.78)" }}>{location}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 64px 48px 64px" }}>
          <div style={{ display: "flex", fontSize: 23, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Empresa verificada</div>
          <div style={{ display: "flex", fontSize: 23, color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>parvagas.pt</div>
        </div>
      </div>
    ),
    size
  );
}
