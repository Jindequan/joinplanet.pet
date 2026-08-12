import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pet Symptom Checker — Free | PLANET",
  description:
    "Something seems off with your pet? Look up 20 common dog and cat symptoms — what each might mean, what to watch for, and when to call the vet. Clear, calm, free. Not a diagnosis.",
  openGraph: {
    title: "Pet Symptom Checker — Free | PLANET",
    description:
      "Look up common pet symptoms calmly. What it might mean, what to watch for, when to call the vet. Free, no sign-up.",
    url: "https://www.joinplanet.pet/tools/symptoms",
    siteName: "PLANET",
    type: "website",
  },
};

export default function SymptomsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
