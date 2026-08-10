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

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
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
