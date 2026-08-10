import { IntakeForm } from "../components/intake-form";

export const dynamic = "force-dynamic";

// Lemon Squeezy appends order/checkout identifiers to the redirect URL.
// We pass whichever is present through to the intake form so a need can be
// linked back to the order that brought the buyer here.
function readOrderId(params: URLSearchParams): string | undefined {
  return (
    params.get("order_id") ??
    params.get("checkout_id") ??
    params.get("order") ??
    params.get("checkout") ??
    undefined
  );
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
  }
  const orderId = readOrderId(params);

  return (
    <main className="shell" style={{ minHeight: "70vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 0" }}>
      <div className="success-intro">
        <p className="kicker"><span className="pulse" /> Founding 100 · Payment received</p>
        <h1>You&apos;re in.<br /><em>Welcome to PLANET.</em></h1>
        <p className="hero-lead">Your lifetime seat is locked in. One last thing — tell us what matters most so the first version is built around you, not a guess.</p>
      </div>
      <IntakeForm orderId={orderId} />
    </main>
  );
}
