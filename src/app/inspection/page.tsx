import type { Metadata } from "next";
import InspectionLanding from "@/components/InspectionLanding";
import JsonLd from "@/components/JsonLd";
import {
  absoluteUrl,
  inspectionServiceJsonLd,
  faqJsonLd,
  INSPECTION_FAQS,
} from "@/lib/seo";

export const metadata: Metadata = {
  title: "Car Inspection in the UAE — 300+ Point Mobile Vehicle Inspection",
  description:
    "Book a professional mobile car inspection across Dubai, Abu Dhabi, Sharjah and the UAE. 300+ inspection points, 40+ photos and a full digital report — we come to you.",
  keywords: [
    "car inspection",
    "car inspection Dubai",
    "vehicle inspection UAE",
    "pre-purchase car inspection",
    "mobile car inspection",
    "used car inspection",
    "300 point inspection",
  ],
  alternates: { canonical: "/inspection" },
  openGraph: {
    title: "Car Inspection in the UAE — 300+ Point Mobile Vehicle Inspection",
    description:
      "Professional mobile vehicle inspection across the UAE. 300+ points, 40+ photos and a full digital report, delivered wherever you are.",
    url: absoluteUrl("/inspection"),
    type: "website",
  },
};

export default function InspectionPage() {
  return (
    <>
      <JsonLd data={[inspectionServiceJsonLd(), faqJsonLd(INSPECTION_FAQS)]} />
      <InspectionLanding />
    </>
  );
}
