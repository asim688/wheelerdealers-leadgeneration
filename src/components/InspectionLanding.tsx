import Link from "next/link";
import BrandLogo from "./BrandLogo";
import InspectionFaq from "./InspectionFaq";
import InspectionFee from "./InspectionFee";
import { EMIRATES } from "@/lib/locations";

/**
 * Public sales / landing page for the Vehicle Inspection module. Promotes the
 * service and routes customers into the booking wizard (/inspection/book).
 */

const HIGHLIGHTS = [
  "300+ Inspection Points",
  "Digital Inspection Report",
  "Expert Inspectors",
  "40+ High-Quality Photos",
];

const BENEFITS: Array<{ title: string; body: string; icon: React.ReactNode }> = [
  {
    title: "Mobile Inspection",
    body: "At your home, office or anywhere in the UAE — our inspector comes to the car.",
    icon: <PinIcon />,
  },
  {
    title: "Detailed Report",
    body: "A comprehensive digital report covering every system, with photos and comments.",
    icon: <DocIcon />,
  },
  {
    title: "Transparent Pricing",
    body: "One flat fee, no hidden charges. You know the price before you book.",
    icon: <TagIcon />,
  },
  {
    title: "Quick Delivery",
    body: "Your report is delivered within 24 hours of the inspection.",
    icon: <BoltIcon />,
  },
];

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Book",
    body: "Chat with our AI assistant or use the booking form to share your details, vehicle, location and preferred time.",
  },
  {
    title: "Pay securely online",
    body: "Review your booking and pay the inspection fee through Stripe's secure checkout.",
  },
  {
    title: "Inspector visits",
    body: "A verified inspector is assigned and comes to your car at the scheduled time.",
  },
  {
    title: "Receive your report",
    body: "Your digital inspection report with photos is delivered within 24 hours.",
  },
];

const COVERAGE = [
  "Exterior",
  "Interior",
  "Mechanical",
  "Tyres & Brakes",
  "Underbody",
  "Electrical",
  "Road Test",
  "Photos",
  "Summary",
];

export default function InspectionLanding() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" aria-label="The Wheeler Dealers home">
            <BrandLogo size="sm" />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/"
              className="rounded-md px-3 py-2 font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              Home
            </Link>
            <Link
              href="/inspector"
              className="rounded-md px-3 py-2 font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              Inspector Login
            </Link>
            <Link
              href="/inspection/book"
              className="rounded-md bg-red-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-red-700"
            >
              Book Inspection
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pt-12 lg:grid-cols-2 lg:items-center lg:gap-14 lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
              Detailed. Accurate. Mobile.
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-neutral-900 sm:text-5xl">
              Professional Vehicle
              <br />
              Inspection <span className="text-red-600">You Can Trust</span>
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-neutral-600">
              We come to you and inspect your vehicle wherever you are — with a
              full digital report so you can buy, sell or drive with confidence.
            </p>

            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {HIGHLIGHTS.map((h) => (
                <li key={h} className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                  <CheckIcon /> {h}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/inspection/book"
                className="rounded-md bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Book an Inspection
              </Link>
              <a
                href="#how"
                className="rounded-md border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                Learn More
              </a>
            </div>
            <Link
              href="/inspection/book?mode=form"
              className="mt-3 inline-flex items-center rounded-md border-2 border-neutral-400 px-6 py-3 text-sm font-bold text-neutral-900 transition-colors hover:border-red-600 hover:bg-red-50"
            >
              Fill a form instead
            </Link>
          </div>

          {/* Branded visual panel */}
          <div className="relative hidden min-h-[420px] overflow-hidden rounded-3xl bg-neutral-900 p-8 shadow-2xl lg:block">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-red-600/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-red-500/20 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between text-white">
              <div>
                <p className="text-sm font-medium uppercase tracking-widest text-red-400">
                  The Wheeler Dealers
                </p>
                <p className="mt-2 text-2xl font-bold leading-snug">
                  Every bolt, panel &amp; system —
                  <br />
                  checked by an expert.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Stat value="300+" label="Points" />
                <Stat value="40+" label="Photos" />
                <Stat value="24h" label="Report" />
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-5 pt-16">
          <h2 className="text-center text-2xl font-bold text-neutral-900">How it works</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-neutral-200 p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold text-neutral-900">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Why choose us */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-center text-2xl font-bold text-neutral-900">
            Why choose The Wheeler Dealers?
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-neutral-200 p-6 transition-shadow hover:shadow-md"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  {b.icon}
                </div>
                <h3 className="mt-4 font-semibold text-neutral-900">{b.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Coverage */}
        <section className="border-y border-neutral-200 bg-neutral-50 py-16">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-center text-2xl font-bold text-neutral-900">
              What we inspect
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-neutral-600">
              A structured, point-by-point inspection across nine areas of the
              vehicle — each item rated with comments and photos.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {COVERAGE.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing / CTA */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="mx-auto max-w-md rounded-3xl border border-neutral-200 p-8 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-600">
              Transparent pricing
            </p>
            <p className="mt-3 text-4xl font-extrabold text-neutral-900">
              <InspectionFee />
              <span className="text-base font-medium text-neutral-500"> / inspection</span>
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Full 300+ point inspection, digital report and photos. No hidden charges.
            </p>
            <Link
              href="/inspection/book"
              className="mt-6 inline-block w-full rounded-md bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              Book an Inspection
            </Link>
            <p className="mt-3 text-xs text-neutral-500">
              Secure online payment via Stripe.
            </p>
            <Link
              href="/inspection/book?mode=form"
              className="mt-3 inline-block w-full rounded-md border-2 border-neutral-400 px-6 py-3 text-sm font-bold text-neutral-900 transition-colors hover:border-red-600 hover:bg-red-50"
            >
              Fill a form instead
            </Link>
          </div>
        </section>

        {/* Locations — internal links to per-emirate landing pages */}
        <section className="border-t border-neutral-200 bg-neutral-50 py-16">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-center text-2xl font-bold text-neutral-900">
              Car inspection across the UAE
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-neutral-600">
              We provide mobile pre-purchase car inspections in all seven emirates —
              our inspector comes to you.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {EMIRATES.map((e) => (
                <Link
                  key={e.slug}
                  href={`/inspection/${e.slug}`}
                  className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                >
                  Car inspection in {e.name}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ (mirrors the FAQPage structured data) */}
        <InspectionFaq />
      </main>

      <footer className="border-t border-neutral-200 py-8">
        <div className="mx-auto max-w-6xl px-5 text-center text-xs text-neutral-500">
          <div className="mb-2 flex flex-wrap justify-center gap-4">
            <Link href="/blog" className="font-medium text-neutral-600 hover:text-red-600">
              Blog
            </Link>
            <Link href="/inspector" className="font-medium text-neutral-600 hover:text-red-600">
              Inspector Login
            </Link>
            <Link href="/admin" className="font-medium text-neutral-600 hover:text-red-600">
              Admin
            </Link>
          </div>
          © {new Date().getFullYear()} The Wheeler Dealers. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-3 text-center backdrop-blur">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] text-neutral-300">{label}</p>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
    </svg>
  );
}
