import type { Metadata } from "next";
import InspectionPayPage from "@/components/InspectionPayPage";

export const metadata: Metadata = {
  title: "Complete your payment — The Wheeler Dealers",
  robots: { index: false, follow: false },
};

/** Payment step after booking: choose card (Stripe) or instalments (Tamara). */
export default async function InspectionPayRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InspectionPayPage jobId={id} />;
}
