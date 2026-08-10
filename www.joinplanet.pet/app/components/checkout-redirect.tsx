"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_BASE, apiUrl } from "../lib/api-base";

type Props = {
  variant: string;
};

export function CheckoutRedirect({ variant }: Props) {
  const [state, setState] = useState<"loading" | "error" | "soldout">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function resolve() {
      // No backend configured — can't resolve checkout. Show a clear message
      // instead of looping on the same-origin /checkout route.
      if (!API_BASE) {
        if (!active) return;
        setState("error");
        setMessage("Checkout is not configured yet. Set NEXT_PUBLIC_API_BASE to the PLANET backend.");
        return;
      }

      try {
        // Follow the 303 redirect to Lemon Squeezy automatically.
        const response = await fetch(apiUrl(`/checkout?variant=${encodeURIComponent(variant)}`), {
          redirect: "follow",
          mode: "cors",
          credentials: "omit",
        });

        if (!active) return;

        // A successful redirect lands us on Lemon's checkout URL.
        if (response.ok && response.url && !response.url.includes(apiUrl("/checkout"))) {
          window.location.replace(response.url);
          return;
        }

        if (response.status === 410) {
          setState("soldout");
          setMessage("The founding 100 lifetime places are sold out. New members will subscribe soon.");
          return;
        }

        const data = await response.json().catch(() => null) as { error?: string } | null;
        setState("error");
        setMessage(data?.error ?? "We couldn't open checkout. Please try again in a moment.");
      } catch {
        if (!active) return;
        setState("error");
        setMessage("We couldn't reach the checkout service. Please try again shortly.");
      }
    }

    resolve();
    return () => {
      active = false;
    };
  }, [variant]);

  return (
    <div className="checkout-state">
      {state === "loading" ? <div className="checkout-spinner" aria-hidden="true" /> : null}
      <p className="section-label">PLANET · Checkout</p>
      {state === "loading" ? (
        <>
          <h1>Preparing your founding seat…</h1>
          <p>Connecting you to secure checkout. This only takes a moment.</p>
        </>
      ) : state === "soldout" ? (
        <>
          <h1>Sold out</h1>
          <p>{message}</p>
        </>
      ) : (
        <>
          <h1>Something went wrong</h1>
          <p>{message}</p>
        </>
      )}
      {state !== "loading" ? (
        <Link className="button button-primary" href="/">Back to PLANET <span className="icon icon-arrow-right" aria-hidden="true" /></Link>
      ) : null}
    </div>
  );
}
