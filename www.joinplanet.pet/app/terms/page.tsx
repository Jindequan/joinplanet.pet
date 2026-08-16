import type { Metadata } from "next";
import { LegalPage } from "../components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — PLANET",
  description: "The terms that cover the PLANET pilot, founding seats, tools and website.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="Last updated: August 16, 2026"
      summary={
        <>
          PLANET is an unfinished product being built in public by one person. These terms cover
          the free tools, the free pilot, and the refundable founding seats — in plain language,
          with no fine print beyond what is written here.
        </>
      }
    >
      <section>
        <h2>1. What these terms cover</h2>
        <p>
          These terms govern your use of joinplanet.pet (the &quot;Site&quot;), including the free
          tools, the interactive demos, the pilot programme, and founding seats. By using the Site
          or buying a founding seat, you agree to these terms. If you do not agree, please do not
          use the Site — and if you have already paid, see the{" "}
          <a href="/refund">Refund Policy</a>: every founding seat is refundable before the first
          public version ships.
        </p>
      </section>

      <section>
        <h2>2. What PLANET is today — and is not</h2>
        <p>
          PLANET is in active, early development. Today the Site offers free tools, an interactive
          prototype, and the chance to join a pilot. Much of what the Site describes is a
          direction, not a finished product. We say this openly: <strong>you are not buying an
          existing app.</strong> A founding seat is support for the build, described in section 4.
        </p>
        <p>
          PLANET organizes what families record about their pets. It is not a medical device and
          does not diagnose, treat, or replace veterinary care. If something is wrong with your
          pet, contact a veterinarian.
        </p>
      </section>

      <section>
        <h2>3. The pilot and the free tools</h2>
        <p>
          The pilot and the tools are free. Joining the pilot costs nothing and requires no
          payment details. In exchange, we ask pilot families to use the early versions honestly
          and tell us what does and does not work. We may change, pause, or end the pilot
          programme at any time; ending it will never obligate you to pay anything.
        </p>
      </section>

      <section>
        <h2>4. Founding seats</h2>
        <p>
          A founding seat is a one-time payment that supports the build. It is not a subscription,
          not equity, and carries no financial return. What it includes:
        </p>
        <ul>
          <li>Early access to working versions as they ship, before public release;</li>
          <li>A direct line to the builder and a real seat in feedback and decisions;</li>
          <li>A permanent place in the making of PLANET.</li>
        </ul>
        <p>
          Seats are offered in tiers as shown live on the Site (the first tier is S$29.99 for the
          first 10 seats; the price rises as each tier fills). The exact price and terms are shown
          at checkout before you pay. Seats are limited to 100 in total.
        </p>
        <p>
          Because PLANET is unfinished, founding seats are <strong>fully refundable any time
          before the first public version ships</strong> — see the <a href="/refund">Refund Policy</a>.
        </p>
      </section>

      <section>
        <h2>5. Payments</h2>
        <p>
          Payments are processed by Lemon Squeezy, acting as the merchant of record. PLANET never
          sees or stores your card details. Prices are shown in Singapore dollars; applicable
          taxes are calculated and handled by the payment processor at checkout.
        </p>
      </section>

      <section>
        <h2>6. Your content</h2>
        <p>
          Anything you submit through forms on the Site — your email, your pet&apos;s name, notes,
          and wishes — stays yours. We store it to build and improve PLANET, to contact you about
          the pilot, and for no other purpose. We will not sell it. We may quote anonymized
          feedback (&quot;a pilot family said…&quot;) when sharing progress in public. You can ask
          us to show or delete everything we hold about you at any time (see the{" "}
          <a href="/privacy">Privacy Policy</a>).
        </p>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>
          Do not use the Site to submit unlawful content, to abuse or overload the service, to
          probe or attack it, or to impersonate others. Keep anything you share about people
          (sitters, family members, vets) respectful and consensual — they have a right to know
          what is shared about them.
        </p>
      </section>

      <section>
        <h2>8. Liability</h2>
        <p>
          The Site is provided &quot;as is&quot;, without warranties of any kind. PLANET is an
          early-stage project by a single builder; things may break, change, or be delayed. To the
          fullest extent permitted by law, our total liability to you is limited to the amount you
          actually paid us. We are not liable for indirect or consequential damages, or for
          decisions made about an animal&apos;s health based on content on the Site.
        </p>
      </section>

      <section>
        <h2>9. Changes</h2>
        <p>
          These terms may change as PLANET grows. The date at the top always reflects the current
          version; material changes affecting founding members will be announced to them by email
          before they take effect.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          One person reads every message: <a href="mailto:support@joinplanet.pet">support@joinplanet.pet</a>.
        </p>
      </section>
    </LegalPage>
  );
}
