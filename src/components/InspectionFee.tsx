"use client";

import { useInspectionFee } from "./useInspectionFee";

/** Live inspection fee text for otherwise static pages. */
export default function InspectionFee() {
  return <>{useInspectionFee()}</>;
}
