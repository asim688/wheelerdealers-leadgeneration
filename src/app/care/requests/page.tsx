import { CareRequestsList } from "@/components/care/CareRequests";

export const metadata = { title: "My Care requests — The Wheeler Dealers", robots: { index: false, follow: false } };

export default function Page() {
  return <CareRequestsList />;
}
