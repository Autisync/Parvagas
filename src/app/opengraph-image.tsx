import { ImageResponse } from "next/og";

// Sitewide default Open Graph / social-share image. Next renders this to a
// real 1200×630 PNG at build time and auto-injects the og:image + twitter:image
// tags, so WhatsApp/Facebook/LinkedIn shares get a branded preview.
export const alt = "Parvagas — Emprego em Angola";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
        <div style={{ fontSize: 110, fontWeight: 800, color: "white", letterSpacing: "-0.03em" }}>
          Parvagas
        </div>
        <div style={{ fontSize: 46, color: "rgba(255,255,255,0.92)", marginTop: 12, fontWeight: 600 }}>
          Emprego em Angola
        </div>
        <div style={{ fontSize: 30, color: "rgba(255,255,255,0.78)", marginTop: 28, maxWidth: 820 }}>
          Encontre vagas, candidate-se e recrute os melhores talentos.
        </div>
      </div>
    ),
    size
  );
}
