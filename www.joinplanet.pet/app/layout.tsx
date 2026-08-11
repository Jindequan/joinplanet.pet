import type { Metadata } from "next";
import { AnalyticsEvents } from "./components/analytics-events";
import "./globals.css";

export const metadata: Metadata = {
  title: "PLANET — Their whole world. One place.",
  description:
    "Shared pet care, health timelines, and vet-ready handoffs for the people who care for them.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

// GA4 measurement ID — hardcoded so production needs no env config.
const GA_ID = "G-Z4M278ZGW3";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Caveat: a warm handwriting font used by the Pet Card Polaroid
            template. We load it from Google Fonts so it renders consistently
            across macOS/Windows/Linux/Android — the old fallback chain
            (Bradley Hand → Comic Sans) looked broken on non-Apple devices. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&display=swap" rel="stylesheet" />
        {GA_ID ? (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}', { anonymize_ip: true });`,
              }}
            />
          </>
        ) : null}
      </head>
      <body>
        {GA_ID ? <AnalyticsEvents /> : null}
        {children}
      </body>
    </html>
  );
}
