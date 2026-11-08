import type { Metadata } from "next";
import ManageInspectionsLogin from "@/components/ManageInspectionsLogin";

export const metadata: Metadata = {
  title: "Manage Inspections | The Wheeler Dealers",
  robots: { index: false, follow: false },
};

export default function ManageInspectionsPage() {
  return <ManageInspectionsLogin />;
}
