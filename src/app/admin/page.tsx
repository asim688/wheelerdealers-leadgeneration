import AdminDashboard from "@/components/AdminDashboard";

export const metadata = {
  title: "Admin — The Wheeler Dealers",
  description: "Platform operator dashboard: leads, auctions and winning bids.",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminDashboard />;
}
