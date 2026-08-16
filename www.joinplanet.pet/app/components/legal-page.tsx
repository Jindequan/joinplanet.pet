import Link from "next/link";
import type { ReactNode } from "react";

// Shared shell for the policy pages (terms / privacy / refund). Same paper
// and sage palette as the landing page, one narrow reading column.
export function LegalPage({
  title,
  updated,
  summary,
  children,
}: {
  title: string;
  updated: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="legal-main">
      <nav className="legal-nav">
        <Link className="narrative-brand" href="/" aria-label="PLANET home"><span className="narrative-orbit" aria-hidden="true"><i /></span>PLANET</Link>
        <span>Questions? <a href="mailto:support@joinplanet.pet">support@joinplanet.pet</a></span>
      </nav>
      <article className="legal-article">
        <header className="legal-header">
          <p className="narrative-eyebrow">{updated}</p>
          <h1>{title}</h1>
          {summary ? <p className="legal-summary">{summary}</p> : null}
        </header>
        <div className="legal-body">{children}</div>
        <footer className="legal-footer">
          <Link href="/">Back to PLANET</Link>
          <span>PLANET · joinplanet.pet</span>
        </footer>
      </article>
    </main>
  );
}
