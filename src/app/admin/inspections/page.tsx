import AdminInspectionsPage, { type Section } from "@/components/AdminInspectionsPage";

export const metadata = {
  title: "Inspections — Super Admin | The Wheeler Dealers",
  robots: { index: false, follow: false },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
  const initial: Section = section === "companies" || section === "managers" ? section : "jobs";
  return <AdminInspectionsPage initialSection={initial} />;
}
