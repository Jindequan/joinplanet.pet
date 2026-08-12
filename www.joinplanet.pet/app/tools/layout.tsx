import type { Metadata } from "next";
import { FeedbackBubble } from "./feedback-bubble";

export const metadata: Metadata = {
  title: "Free Pet Tools — PLANET",
  description:
    "Free, fast pet tools — no account needed. Make a beautiful pet card, check common symptoms, and share a vaccine care schedule with your family.",
  openGraph: {
    title: "Free Pet Tools — PLANET",
    description:
      "Make a pet card, check symptoms, share a care calendar. Free, no sign-up, made by a pet parent.",
    url: "https://www.joinplanet.pet/tools",
    siteName: "PLANET",
    type: "website",
  },
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FeedbackBubble />
    </>
  );
}
