import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pet Card Maker — Free | PLANET",
  description:
    "Make a beautiful card for your pet in 30 seconds. Six hand-crafted design styles, photo zoom and drag, save as image, share with anyone. No account, no watermark, free.",
  openGraph: {
    title: "Pet Card Maker — Free | PLANET",
    description:
      "A beautiful card for your pet. Six styles, photo, personality. Save it, share it. Free, no sign-up.",
    url: "https://www.joinplanet.pet/tools/pet-card",
    siteName: "PLANET",
    type: "website",
  },
};

export default function PetCardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
