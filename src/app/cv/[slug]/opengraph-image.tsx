import { ImageResponse } from "next/og";
import { serverGetJson } from "@/lib/dataClient";
import type { PreviewData } from "@/app/Portal/Candidato/Construtor-CV/preview/AtsClassic";

// Per-resume Open Graph image for /cv/[slug] — mirrors the sitewide
// src/app/opengraph-image.tsx branding but swaps in the candidate's own
// name/role so a shared CV link previews as *their* CV, not a generic card.
export const alt = "CV — Parvagas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type PublicResume = { data: PreviewData };

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

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.72)", letterSpacing: "0.08em" }}>
          CURRÍCULO
        </div>
        <div style={{ fontSize: 84, fontWeight: 800, color: "white", letterSpacing: "-0.02em", marginTop: 18, maxWidth: 1000 }}>
          {fullName}
        </div>
        {role && (
          <div style={{ fontSize: 40, color: "rgba(255,255,255,0.92)", marginTop: 14, fontWeight: 600, maxWidth: 1000 }}>
            {role}
          </div>
        )}
        <div style={{ fontSize: 28, color: "rgba(255,255,255,0.78)", marginTop: 40, fontWeight: 700, letterSpacing: "-0.01em" }}>
          Parvagas — Emprego em Angola
        </div>
      </div>
    ),
    size
  );
}
