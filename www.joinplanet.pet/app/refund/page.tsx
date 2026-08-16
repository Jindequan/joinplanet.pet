import type { Metadata } from "next";
import { LegalPage } from "../components/legal-page";

export const metadata: Metadata = {
  title: "Refund Policy — PLANET",
  description: "Every PLANET founding seat is fully refundable before the first public version ships. No forms, no questions.",
  alternates: { canonical: "/refund" },
};

export default function RefundPage() {
  return (
    <LegalPage
      title="Refund Policy"
      updated="Last updated: August 16, 2026"
      summary={
        <>
          Founding seats exist to fund the build, not to trap anyone. If you ever want your money
          back before the first public version ships, you get all of it — any reason, or no
          reason. One email is enough.
        </>
      }
    >
      <section>
        <h2>Founding seats: fully refundable before launch</h2>
        <p>
          Any founding seat can be refunded <strong>in full, any time before the first public
          version of PLANET ships</strong>. You do not need a reason. &quot;I changed my
          mind&quot; is a perfect reason.
        </p>
      </section>

      <section>
        <h2>After the first version ships</h2>
        <p>
          Once a first public version has shipped, this open-ended promise closes for new
          situations — but you are never fighting a faceless company. One person reads every
          email: if a release has shipped and you are unhappy with what you got, write to{" "}
          <a href="mailto:support@joinplanet.pet">support@joinplanet.pet</a> within 14 days of
          that release and we will refund you in full.
        </p>
      </section>

      <section>
        <h2>How to ask</h2>
        <ul>
          <li>
            Email <a href="mailto:support@joinplanet.pet">support@joinplanet.pet</a> from the
            address you used at checkout.
          </li>
          <li>Include your order ID — it is in your Lemon Squeezy receipt email.</li>
          <li>Say the word. &quot;Please refund my founding seat&quot; is enough.</li>
        </ul>
      </section>

      <section>
        <h2>What happens next</h2>
        <ul>
          <li>The refund goes back to your original payment method through Lemon Squeezy.</li>
          <li>It usually arrives within 5–10 business days, depending on your bank.</li>
          <li>
            Your founding seat is released (the live seat count drops accordingly) and access
            tied to the seat ends. Nothing else changes — you can still join the free pilot.
          </li>
        </ul>
      </section>

      <section>
        <h2>The pilot and the tools</h2>
        <p>
          The pilot and the tools are free, so there is nothing to refund. If you ever paid by
          mistake or see a charge you do not recognize, that email address above still works —
          and it gets read.
        </p>
      </section>
    </LegalPage>
  );
}
