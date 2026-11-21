import { CareRequestDetail } from "@/components/care/CareRequests";

export const metadata = { title: "Care request — The Wheeler Dealers", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CareRequestDetail id={id} />;
}
