import Link from "next/link";
import BrandLogo from "./BrandLogo";
import InspectionFaq from "./InspectionFaq";
import InspectionFee from "./InspectionFee";
import { EMIRATES, type Emirate } from "@/lib/locations";

/**
 * Localized "Car Inspection in {Emirate}" landing page. Same visual language as
 * the main inspection page, but with location-specific H1, copy and areas so it
 * can rank for "car inspection {emirate}" style searches.
 */
export default function InspectionLocation({ emirate }: { emirate: Emirate }) {
  const others = EMIRATES.filter((e) => e.slug !== emirate.slug);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" aria-label="The Wheeler Dealers home">
            <BrandLogo size="sm" />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/inspection"
              className="rounded-md px-3 py-2 font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              Inspection
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
        {/* Breadcrumb */}
        <nav className="mx-auto max-w-6xl px-5 pt-6 text-xs text-neutral-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-red-600">Home</Link>
          <span className="mx-1.5">/</span>
          <Link href="/inspection" className="hover:text-red-600">Inspection</Link>
          <span className="mx-1.5">/</span>
          <span className="font-medium text-neutral-700">{emirate.name}</span>
        </nav>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pt-6 lg:pt-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
            Mobile · On-site · Same-day report
          </span>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight text-neutral-900 sm:text-5xl">
            Car Inspection in <span className="text-red-600">{emirate.name}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-600">
            {emirate.intro}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/inspection/book"
              className="rounded-md bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              Book an Inspection in {emirate.name}
            </Link>
            <Link
              href="/inspection"
              className="rounded-md border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              How it works
            </Link>
          </div>
        </section>

        {/* Local context + highlights */}
        <section className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-10 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <h2 className="text-2xl font-bold text-neutral-900">
                Pre-purchase inspection, wherever the car is in {emirate.name}
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-neutral-600">{emirate.body}</p>
              <p className="mt-4 text-sm leading-relaxed text-neutral-600">
                Every inspection covers 300+ points across the exterior, interior,
                engine and mechanical systems, tyres and brakes, underbody,
                electrical, plus a full road test — finished with a digital report
                and 40+ high-quality photos delivered within 24 hours.
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-red-600">
                Flat fee
              </p>
              <p className="mt-2 text-3xl font-extrabold text-neutral-900">
                <InspectionFee />
                <span className="text-sm font-medium text-neutral-500"> / inspection</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-neutral-700">
                <li className="flex items-center gap-2"><Dot /> 300+ inspection points</li>
                <li className="flex items-center gap-2"><Dot /> 40+ photos</li>
                <li className="flex items-center gap-2"><Dot /> Report within 24h</li>
                <li className="flex items-center gap-2"><Dot /> We come to you</li>
              </ul>
              <Link
                href="/inspection/book"
                className="mt-6 inline-block w-full rounded-md bg-red-600 px-6 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Book now
              </Link>
            </div>
          </div>
        </section>

        {/* Areas covered */}
        <section className="border-y border-neutral-200 bg-neutral-50 py-14">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-2xl font-bold text-neutral-900">
              Areas we cover in {emirate.name}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-neutral-600">
              Our inspectors travel across {emirate.name}, including:
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {emirate.areas.map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        </section>

        <InspectionFaq title={`Car inspection in ${emirate.name} — FAQs`} />

        {/* Other emirates */}
        <section className="border-t border-neutral-200 py-14">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="text-lg font-bold text-neutral-900">
              We also inspect cars across the UAE
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {others.map((e) => (
                <Link
                  key={e.slug}
                  href={`/inspection/${e.slug}`}
                  className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                >
                  Car inspection in {e.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-neutral-200 py-8">
        <div className="mx-auto max-w-6xl px-5 text-center text-xs text-neutral-500">
          © {new Date().getFullYear()} The Wheeler Dealers. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-red-600" />;
}
