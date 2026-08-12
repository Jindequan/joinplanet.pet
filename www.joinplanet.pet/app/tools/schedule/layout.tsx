import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pet Care Schedule — Shared Vaccine & Deworming Calendar | PLANET",
  description:
    "Never miss the next vaccine, deworming, or flea treatment. Build a shared care calendar, send one link to your family, everyone stays in sync. Free, no account needed.",
  openGraph: {
    title: "Pet Care Schedule — Free Shared Calendar | PLANET",
    description:
      "Vaccines, deworming, flea — when is the next one due? Build a shared calendar, send one link to your family. Free.",
    url: "https://www.joinplanet.pet/tools/schedule",
    siteName: "PLANET",
    type: "website",
  },
};

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
