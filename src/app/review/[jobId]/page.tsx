import type { Metadata } from "next";
import InspectionReportView from "@/components/InspectionReportView";

export const metadata: Metadata = {
  title: "Report preview | The Wheeler Dealers",
  robots: { index: false, follow: false },
};

/** Reviewer preview of a report (account manager / super admin session required). */
export default async function ReviewPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { jobId } = await params;
  const { as } = await searchParams;
  return <InspectionReportView previewJobId={jobId} previewAs={as === "manager" ? "manager" : as === "admin" ? "admin" : undefined} />;
}
