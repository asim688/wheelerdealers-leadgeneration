/**
 * ----------------------------------------------------------------------------
 * Central SEO configuration + structured-data (JSON-LD) builders.
 * ----------------------------------------------------------------------------
 * One source of truth for the canonical site URL, brand facts, default social
 * metadata and the schema.org objects that power Google rich results.
 *
 * The production URL comes from NEXT_PUBLIC_BASE_URL when set, otherwise falls
 * back to the live domain so canonical/OG links are always absolute and correct.
 * ----------------------------------------------------------------------------
 */

/** Canonical origin, e.g. "https://www.thewheelerdealers.com" (no trailing slash). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.thewheelerdealers.com"
).replace(/\/$/, "");

export const SITE_NAME = "The Wheeler Dealers";
export const SITE_TITLE_DEFAULT =
  "The Wheeler Dealers — Car Inspection, Buy, Sell & Trade in the UAE";
export const SITE_DESCRIPTION =
  "Professional mobile car inspection across the UAE — 300+ point checks with a full digital report. Plus an AI marketplace to buy, sell and trade your car.";

/** Emirates we serve — reused in copy and LocalBusiness structured data. */
export const SERVICE_AREAS = [
  "Dubai",
  "Abu Dhabi",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
  "Fujairah",
  "Umm Al Quwain",
] as const;

/** Head-term keywords we want to rank for. */
export const SITE_KEYWORDS = [
  "car inspection",
  "vehicle inspection UAE",
  "car inspection Dubai",
  "pre-purchase car inspection",
  "mobile car inspection",
  "300 point inspection",
  "used car inspection",
  "car check UAE",
  "pre purchase inspection Dubai",
  "buy sell trade cars UAE",
];

/** Absolute URL helper. Pass a path like "/inspection". */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Organization + WebSite schema — emitted site-wide (in the root layout). Helps
 * Google build the brand knowledge panel and enable sitelinks search.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: ["Wheeler Dealers UAE", "The Wheeler Dealers UAE", "TheWheelerDealers.com"],
    url: SITE_URL,
    logo: absoluteUrl("/logo.jpeg"),
    description: SITE_DESCRIPTION,
    areaServed: SERVICE_AREAS.map((name) => ({
      "@type": "AdministrativeArea",
      name,
    })),
  };
}

export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: "Wheeler Dealers UAE",
    url: SITE_URL,
  };
}

/**
 * LocalBusiness / AutomotiveBusiness schema for the inspection service. This is
 * the key object for local "car inspection near me" style rich results.
 *
 * Pass an `area` (e.g. "Dubai") on the per-emirate landing pages so the schema
 * is scoped to that location; omit it for the UAE-wide inspection page.
 */
export function inspectionServiceJsonLd(opts?: { area?: string; path?: string }) {
  const area = opts?.area;
  const path = opts?.path ?? "/inspection";
  return {
    "@context": "https://schema.org",
    "@type": ["AutomotiveBusiness", "Service"],
    name: area
      ? `${SITE_NAME} — Car Inspection in ${area}`
      : `${SITE_NAME} — Vehicle Inspection`,
    url: absoluteUrl(path),
    image: absoluteUrl("/logo.jpeg"),
    description: area
      ? `Professional mobile car inspection in ${area}. 300+ inspection points, 40+ photos and a full digital report, delivered anywhere in ${area}.`
      : "Professional mobile vehicle inspection across the UAE. 300+ inspection points, 40+ photos and a full digital report delivered wherever you are.",
    areaServed: area
      ? [{ "@type": "AdministrativeArea", name: area }]
      : SERVICE_AREAS.map((name) => ({
          "@type": "AdministrativeArea",
          name,
        })),
    serviceType: "Vehicle inspection",
    provider: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    offers: {
      "@type": "Offer",
      priceCurrency: process.env.NEXT_PUBLIC_CURRENCY || "AED",
      price: process.env.INSPECTION_FEE_AED || "10",
      url: absoluteUrl("/inspection/book"),
    },
  };
}

/** BreadcrumbList schema — helps Google show a breadcrumb trail in results. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

/** FAQPage schema — can win an expandable FAQ block directly in search results. */
export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
}

/** BlogPosting schema — makes articles eligible for rich article results. */
export function blogPostingJsonLd(post: {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
}) {
  const url = absoluteUrl(`/blog/${post.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url,
    datePublished: post.datePublished,
    dateModified: post.dateModified ?? post.datePublished,
    image: absoluteUrl("/logo.jpeg"),
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: absoluteUrl("/logo.jpeg") },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}

/** The FAQ shown (and marked up) on the inspection landing page. */
export const INSPECTION_FAQS = [
  {
    question: "How much does a car inspection cost in the UAE?",
    answer:
      "A full mobile vehicle inspection with The Wheeler Dealers is a flat fee that includes a 300+ point check, 40+ photos and a digital report. See the booking page for the current price.",
  },
  {
    question: "Do you come to my location for the inspection?",
    answer:
      "Yes. Our inspection is fully mobile — our inspector comes to your home, office or any location across Dubai, Abu Dhabi, Sharjah and the other emirates.",
  },
  {
    question: "What is a pre-purchase car inspection?",
    answer:
      "A pre-purchase inspection is a detailed check of a used car before you buy it. We assess the engine, transmission, body, electronics and more, then give you a full report so you can buy with confidence.",
  },
  {
    question: "How long does a vehicle inspection take?",
    answer:
      "Most inspections take about 45–90 minutes on site, after which you receive a full digital report with photos.",
  },
  {
    question: "Which areas of the UAE do you cover?",
    answer:
      "We provide mobile car inspections across all seven emirates: Dubai, Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah, Fujairah and Umm Al Quwain.",
  },
];
