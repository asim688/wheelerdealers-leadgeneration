import type { Metadata } from "next";
import CustomerAccount from "@/components/CustomerAccount";

export const metadata: Metadata = {
  title: "My Bookings & Reports | The Wheeler Dealers",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <CustomerAccount />;
}
