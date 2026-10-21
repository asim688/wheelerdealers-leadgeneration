"use client";

import { useEffect, useState } from "react";

/** Live inspection fee label (e.g. "AED 10"); "…" until loaded so a stale price is never shown. */
export function useInspectionFee(): string {
  const [fee, setFee] = useState("…");
  useEffect(() => {
    let alive = true;
    fetch("/api/inspection/price", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { price: number; currency: string } | null) => {
        if (alive && d) setFee(`${d.currency} ${d.price.toLocaleString()}`);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return fee;
}
