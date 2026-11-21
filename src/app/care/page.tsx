import type { Metadata } from "next";
import CarePage from "@/components/care/CarePage";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Car Care UAE — Roadside Assistance, Towing, Batteries & Oil | The Wheeler Dealers",
  description:
    "Your Car. Our Care. Battery jump start, emergency towing and fuel delivery, scheduled towing quotes from approved partners, plus car batteries, oil and accessories with VAT-inclusive prices.",
  alternates: { canonical: "/care" },
  openGraph: { title: "Your Car. Our Care. — The Wheeler Dealers", url: absoluteUrl("/care"), type: "website" },
};

export default async function CareRoute({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <CarePage initialQuery={q ?? ""} />;
}
