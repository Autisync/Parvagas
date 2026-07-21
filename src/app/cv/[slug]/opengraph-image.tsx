import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { serverGetJson } from "@/lib/dataClient";
import type { PreviewData } from "@/app/Portal/Candidato/Construtor-CV/preview/AtsClassic";

// Per-resume Open Graph image for /cv/[slug] — mirrors the sitewide
// src/app/opengraph-image.tsx branding but swaps in the candidate's own
// name/role/location/skills so a shared CV link previews as *their* CV
// card, not a generic gradient with text.
export const alt = "CV — Parvagas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// next/og's ImageResponse defaults are fine on the Node.js runtime, which is
// what this route needs anyway to read the logo off disk below.
export const runtime = "nodejs";
// A single share draws several independent crawler fetches (Facebook,
// WhatsApp, LinkedIn, X, Slack, Discord, iMessage) — without this, each one
// re-pays the full satori render (text layout + font shaping + PNG encode)
// even within the backend fetch's own 60s cache window. Cache the rendered
// PNG itself per slug for an hour; a candidate editing their published CV
// sees a stale preview image for at most that long, which is an acceptable
// trade for not re-rendering on every crawler hit.
export const revalidate = 3600;

type PublicResume = { data: PreviewData };

// Read once per server instance (module scope) instead of per-request —
// the file never changes at runtime, and ImageResponse can't reference a
// public/ URL directly, so it needs to travel in as a base64 data URI.
const logoDataUri = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "icon2.png")
).toString("base64")}`;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default async function CvOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resume = await serverGetJson<PublicResume>(`/public/resumes/${encodeURIComponent(slug)}`, {
    revalidateSeconds: 60,
  });

  const fullName = resume?.data.fullName?.trim() || "Candidato";
  const role = (resume?.data.professionalTitle || resume?.data.jobTitle || "").trim();
  const location = resume?.data.location?.trim() || "";
  const skills = (resume?.data.hardSkills?.length ? resume.data.hardSkills : resume?.data.techniques || []).filter(Boolean).slice(0, 4);
  const initials = getInitials(fullName);

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
        {/* Decorative ring echoing the brand mark's outer arc — pure background texture */}
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
              {fullName}
            </div>
            {role && (
              <div style={{ display: "flex", fontSize: 32, color: "rgba(255,255,255,0.92)", marginTop: 14, fontWeight: 600 }}>
                {role}
              </div>
            )}
            {location && (
              <div style={{ display: "flex", alignItems: "center", marginTop: 18 }}>
                <div style={{ display: "flex", width: 8, height: 8, borderRadius: "9999px", background: "rgba(255,255,255,0.7)" }} />
                <div style={{ display: "flex", marginLeft: 10, fontSize: 25, color: "rgba(255,255,255,0.78)" }}>{location}</div>
              </div>
            )}
            {skills.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", marginTop: 26 }}>
                {skills.map((skill) => (
                  <div
                    key={skill}
                    style={{
                      display: "flex",
                      background: "rgba(255,255,255,0.14)",
                      border: "1px solid rgba(255,255,255,0.3)",
                      borderRadius: "9999px",
                      padding: "8px 20px",
                      marginRight: 12,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ display: "flex", fontSize: 21, color: "white", fontWeight: 600 }}>{skill}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 64px 48px 64px" }}>
          <div style={{ display: "flex", fontSize: 23, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Currículo verificado</div>
          <div style={{ display: "flex", fontSize: 23, color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>parvagas.pt</div>
        </div>
      </div>
    ),
    size
  );
}
