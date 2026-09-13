import type { Metadata } from "next";
import { AnalyticsEvents } from "./components/analytics-events";
import "./globals.css";
import "./ui-refresh.css";

export const metadata: Metadata = {
  title: "PLANET — Pet care reminders your whole family can trust",
  description:
    "PLANET watches your pet's care schedule so you don't have to: medicine and deworming reminders, confirmation that care actually got done, and one shared view for everyone who loves them. For dogs and cats. Pilot families joining now.",
  metadataBase: new URL("https://www.joinplanet.pet"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "PLANET",
    title: "PLANET — watches the schedule so you don't have to",
    description:
      "Medicines, monthly preventives, vet dates: reminded on time, confirmed done, shared with the whole family. A thousand small acts become a life together.",
  },
  twitter: {
    card: "summary",
    title: "PLANET — watches the schedule so you don't have to",
    description:
      "Medicines, monthly preventives, vet dates: reminded on time, confirmed done, shared with the whole family. A thousand small acts become a life together.",
  },
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
