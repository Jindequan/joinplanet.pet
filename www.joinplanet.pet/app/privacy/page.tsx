import type { Metadata } from "next";
import { LegalPage } from "../components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — PLANET",
  description: "What PLANET collects, why, and how to have it deleted. Short and readable, like it should be.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="Last updated: August 16, 2026"
      summary={
        <>
          We collect the minimum needed to build PLANET with you: your email, what you type into
          our forms, and anonymous usage stats. We never sell it. One person (the builder) has
          access. You can have everything deleted with one email.
        </>
      }
    >
      <section>
        <h2>1. Who is behind this</h2>
        <p>
          PLANET (joinplanet.pet) is built and run by one person. That person is the only human
          with access to the data described below. For anything privacy-related, write to{" "}
          <a href="mailto:support@joinplanet.pet">support@joinplanet.pet</a>.
        </p>
      </section>

      <section>
        <h2>2. What we collect</h2>
        <ul>
          <li>
            <strong>Your email</strong>, when you join the pilot or waitlist, send us a message,
            or buy a founding seat.
          </li>
          <li>
            <strong>What you type into our forms</strong> — for example your pet&apos;s name, the
            care routine or wish you describe, or what you tell us after buying a founding seat.
          </li>
          <li>
            <strong>Order information</strong> for founding seats: the order identifier and the
            email you used, so we can recognize your seat. Payments run through Lemon Squeezy as
            merchant of record; card details never reach PLANET.
          </li>
          <li>
            <strong>Anonymous usage analytics</strong> via Google Analytics 4 with IP
            anonymization — which pages are viewed and which buttons are clicked, so we know what
            to build next.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Why we collect it</h2>
        <ul>
          <li>To invite you to the pilot and send the occasional honest update you asked for;</li>
          <li>To understand what pet families actually need, and shape the product around it;</li>
          <li>To recognize founding members and deliver what their seat includes;</li>
          <li>To keep the Site working and improve it.</li>
        </ul>
        <p>We do not run ads on your data, and we do not sell or rent it to anyone.</p>
      </section>

      <section>
        <h2>4. Who processes it</h2>
        <p>
          Only a short list of service providers touch this data, each for one job: Lemon Squeezy
          (payments and receipts), Google Analytics (anonymous usage stats), and the email and
          hosting providers that keep the Site and our mailbox running (including Cloudflare email
          routing, which forwards mail addressed to PLANET to the builder&apos;s personal inbox).
          Data is stored in a private database with access limited to the builder.
        </p>
      </section>

      <section>
        <h2>5. How long we keep it</h2>
        <p>
          Until you ask us to delete it, or until the project ends — except where we must keep a
          record (for example, of a payment or refund) for accounting reasons.
        </p>
      </section>

      <section>
        <h2>6. Your rights</h2>
        <p>
          Email <a href="mailto:support@joinplanet.pet">support@joinplanet.pet</a> at any time to:
        </p>
        <ul>
          <li>See what we hold about you;</li>
          <li>Correct it;</li>
          <li>Export it;</li>
          <li>Delete it (we will confirm when it is done).</li>
        </ul>
        <p>
          You can also unsubscribe from any email with one click, and unsubscribing never affects
          a founding seat or pilot place you have already been given.
        </p>
      </section>

      <section>
        <h2>7. Children</h2>
        <p>
          PLANET is not directed at children under 13, and we do not knowingly collect their
          data. If a child has submitted information, write to us and we will delete it.
        </p>
      </section>

      <section>
        <h2>8. Changes</h2>
        <p>
          If this policy changes in a way that matters, we will update the date at the top and,
          where relevant, notify pilot families and founding members by email.
        </p>
      </section>
    </LegalPage>
  );
}
