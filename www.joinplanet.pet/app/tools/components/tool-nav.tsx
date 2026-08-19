import Link from "next/link";

export function ToolNav({ action = "" }: { action?: string }) {
  return (
    <nav className="nav shell tool-nav" aria-label="Main navigation">
      <Link className="brand" href="/" aria-label="PLANET home"><span className="brand-mark" aria-hidden="true" />PLANET</Link>
      <div className="nav-links">
        {action ? <Link href={action === "Make your own" ? "/tools" : "/tools"}>{action}</Link> : null}
        <Link href="/tools">All tools</Link>
        <Link href="/">PLANET home</Link>
      </div>
      <details className="tool-mobile-menu">
        <summary aria-label="Open navigation menu"><span aria-hidden="true">☰</span><span className="sr-only">Menu</span></summary>
        <div className="tool-mobile-menu-panel">
          {action ? <Link href="/tools">{action}</Link> : null}
          <Link href="/tools">All tools</Link>
          <Link href="/">PLANET home</Link>
        </div>
      </details>
    </nav>
  );
}
