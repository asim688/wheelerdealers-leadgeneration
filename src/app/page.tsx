import type { Metadata } from "next";
import LandingClient from "@/components/LandingClient";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "The Wheeler Dealers — Sell, Buy & Inspect Cars in the UAE",
  description:
    "Sell your car to verified dealers, buy with confidence, and book a professional mobile car inspection across Dubai, Abu Dhabi, Sharjah and the UAE.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "The Wheeler Dealers — Sell, Buy & Inspect Cars in the UAE",
    description:
      "Sell your car to verified dealers, buy with confidence, and book a professional mobile car inspection across the UAE.",
    url: absoluteUrl("/"),
    type: "website",
  },
};

export default function Home() {
  return <LandingClient />;
}
