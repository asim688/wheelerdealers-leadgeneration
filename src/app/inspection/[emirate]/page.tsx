import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EMIRATES, getEmirate } from "@/lib/locations";
import {
  absoluteUrl,
  inspectionServiceJsonLd,
  faqJsonLd,
  breadcrumbJsonLd,
  INSPECTION_FAQS,
} from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import InspectionLocation from "@/components/InspectionLocation";

/** Only the known emirates render; any other slug 404s. */
export const dynamicParams = false;

export function generateStaticParams() {
  return EMIRATES.map((e) => ({ emirate: e.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ emirate: string }>;
}): Promise<Metadata> {
  const { emirate } = await params;
  const e = getEmirate(emirate);
  if (!e) return {};

  const title = `Car Inspection in ${e.name} — Mobile 300+ Point Vehicle Inspection`;
  const description = `Book a professional mobile car inspection in ${e.name}. 300+ point pre-purchase check, 40+ photos and a same-day digital report — our inspector comes to you.`;

  return {
    title,
    description,
    keywords: [
      `car inspection ${e.name}`,
      `pre-purchase car inspection ${e.name}`,
      `vehicle inspection ${e.name}`,
      `mobile car inspection ${e.name}`,
      `used car inspection ${e.name}`,
    ],
    alternates: { canonical: `/inspection/${e.slug}` },
    openGraph: {
      title,
      description,
      url: absoluteUrl(`/inspection/${e.slug}`),
      type: "website",
    },
  };
}

export default async function InspectionEmiratePage({
  params,
}: {
  params: Promise<{ emirate: string }>;
}) {
  const { emirate } = await params;
  const e = getEmirate(emirate);
  if (!e) notFound();

  return (
    <>
      <JsonLd
        data={[
          inspectionServiceJsonLd({ area: e.name, path: `/inspection/${e.slug}` }),
          faqJsonLd(INSPECTION_FAQS),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Inspection", path: "/inspection" },
            { name: e.name, path: `/inspection/${e.slug}` },
          ]),
        ]}
      />
      <InspectionLocation emirate={e} />
    </>
  );
}
