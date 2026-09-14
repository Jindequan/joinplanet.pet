"use client";

import { useState } from "react";

export function PrintSummaryButton() {
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="share-button share-print-button"
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        try {
          window.print();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Preparing PDF…" : "Print / save PDF"} <span>↗</span>
    </button>
  );
}
