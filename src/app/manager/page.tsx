import type { Metadata } from "next";
import ManagerPortal from "@/components/ManagerPortal";

export const metadata: Metadata = {
  title: "Account Manager | The Wheeler Dealers",
  robots: { index: false, follow: false },
};

export default function ManagerPage() {
  return <ManagerPortal />;
}
