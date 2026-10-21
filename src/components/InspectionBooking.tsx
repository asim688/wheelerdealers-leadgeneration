"use client";

import { useState } from "react";
import InspectionBookingChat from "./InspectionBookingChat";
import InspectionBookingWizard from "./InspectionBookingWizard";

/**
 * AI-first inspection booking with a manual-form fallback.
 *
 * Shows the conversational assistant by default. If the AI is unavailable or the
 * customer prefers to type into a form, we switch to the existing step-by-step
 * wizard. `initialMode` lets a caller (e.g. ?mode=form) open the form directly.
 */
export default function InspectionBooking({
  initialMode = "chat",
}: {
  initialMode?: "chat" | "form";
}) {
  const [mode, setMode] = useState<"chat" | "form">(initialMode);

  if (mode === "form") {
    return <InspectionBookingWizard onSwitchToChat={() => setMode("chat")} />;
  }
  return <InspectionBookingChat onFallback={() => setMode("form")} />;
}
