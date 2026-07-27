import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ||
    requestHeaders.get("host") ||
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const image = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title: {
      default: "Freigabeportal | Führungsmandat",
      template: "%s | Führungsmandat",
    },
    description:
      "Sicheres Freigabeportal der Führungsmandat Redaktion für kanalgebundene Veröffentlichungsentscheidungen.",
    robots: { index: false, follow: false, noarchive: true },
    openGraph: {
      title: "Führungsmandat Freigabeportal",
      description:
        "Versionierte Freigaben für Website, Facebook, Instagram und LinkedIn.",
      type: "website",
      locale: "de_DE",
      images: [
        {
          url: image,
          width: 1536,
          height: 1024,
          alt: "Führungsmandat Freigabeportal",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Führungsmandat Freigabeportal",
      description:
        "Versionierte Freigaben für Website, Facebook, Instagram und LinkedIn.",
      images: [image],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${inter.variable} ${cormorant.variable}`}>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="Führungsmandat Freigabeportal">
            <span className="brand-mark">F</span>
            <span>
              Führungsmandat
              <small>Freigabeportal</small>
            </span>
          </Link>
          <span className="header-status">
            <i aria-hidden="true" />
            Geschützter Redaktionsprozess
          </span>
        </header>
        {children}
        <footer className="site-footer">
          <span>Mandat &amp; Wirkung · Führungsmandat Redaktion</span>
          <span>Vertraulich. Versionsgebunden. Nachvollziehbar.</span>
        </footer>
      </body>
    </html>
  );
}
