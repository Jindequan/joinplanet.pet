import { CheckoutRedirect } from "../components/checkout-redirect";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const variant = typeof params.variant === "string" ? params.variant : "current";

  return (
    <main className="shell" style={{ minHeight: "70vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 0" }}>
      <CheckoutRedirect variant={variant} />
    </main>
  );
}
