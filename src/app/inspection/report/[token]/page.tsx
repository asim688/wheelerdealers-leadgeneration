import type { Metadata } from "next";
import InspectionReportView from "@/components/InspectionReportView";

export const metadata: Metadata = {
  title: "Inspection Report | The Wheeler Dealers",
  description: "Private vehicle inspection report.",
  robots: { index: false, follow: false },
};

export default async function InspectionReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InspectionReportView token={token} />;
}
