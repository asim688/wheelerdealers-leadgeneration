import AdminCompanyPage from "@/components/AdminCompanyPage";

export const metadata = {
  title: "Company — Super Admin | The Wheeler Dealers",
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminCompanyPage companyId={id} />;
}
