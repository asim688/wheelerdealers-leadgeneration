import type { Metadata } from "next";
import CompanyPortal from "@/components/CompanyPortal";

export const metadata: Metadata = {
  title: "Inspection Company Portal | The Wheeler Dealers",
  robots: { index: false, follow: false },
};

export default function CompanyPage() {
  return <CompanyPortal />;
}
