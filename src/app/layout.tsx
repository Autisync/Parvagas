import type { Metadata, Viewport } from "next";

// Mobile-first (≈85% of AO traffic is mobile): explicit, zoomable viewport.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#dc2626",
};
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";
import CTA from "./components/CTA";
import CookieConsent from "./components/CookieConsent";
import { Providers } from "./Providers";
// import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/react";
import ServiceWorkerRegister from "./components/ServiceWorkerRegister";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://parvagas.pt"),
  title: {
    default: "Parvagas",
    template: "%s | Parvagas",
  },
  description: "Plataforma de recrutamento Angola-first para candidatos e empresas.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Parvagas",
    description: "Plataforma de recrutamento Angola-first para candidatos e empresas.",
    url: "https://parvagas.pt",
    siteName: "Parvagas",
    locale: "pt_AO",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon2.ico" sizes="any" />
        <link
          rel="icon"
          href="/icon2.svg"
          type="image/svg"
          sizes="<generated>"
        />
        {/* <link
          rel="apple-touch-icon"
          href="/icon2.png"
          type="image/png"
          sizes="57x57"
        /> */}
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ? (
          <script
            defer
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src={`${process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io"}/js/script.tagged-events.js`}
          />
        ) : null}
        {/* Always load: uses env var when set, falls back to the hardcoded production site key. */}
        <script
          async
          defer
          src={`https://www.google.com/recaptcha/enterprise.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "6Lf4CistAAAAAIq1r40uoJLlTspXn_05-0pz9zJc"}`}
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>
          {/* <Header /> */}
          {children}
          <CTA />
          <CookieConsent />
          {/* <Footer /> */}
        </Providers>
        <Analytics />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
