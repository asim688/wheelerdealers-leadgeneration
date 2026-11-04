import type { Metadata } from "next";
import InspectionReportView from "@/components/InspectionReportView";

export const metadata: Metadata = {
  title: "Report preview | The Wheeler Dealers",
  robots: { index: false, follow: false },
};

/** Reviewer preview of a report (account manager / super admin session required). */
export default async function ReviewPreviewPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <InspectionReportView previewJobId={jobId} />;
}
