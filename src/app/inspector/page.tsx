import type { Metadata } from "next";
import InspectorPortal from "@/components/InspectorPortal";

export const metadata: Metadata = {
  title: "Inspector Portal | The Wheeler Dealers",
  robots: { index: false, follow: false },
};

export default function InspectorPage() {
  return <InspectorPortal />;
}
