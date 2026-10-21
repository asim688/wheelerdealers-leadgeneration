import Link from "next/link";
import BrandLogo from "./BrandLogo";

/** Shared header + footer chrome for blog pages, matching the site style. */
export default function BlogChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Link href="/" aria-label="The Wheeler Dealers home">
            <BrandLogo size="sm" />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/blog"
              className="rounded-md px-3 py-2 font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              Blog
            </Link>
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

      <main className="flex-1">{children}</main>

      <footer className="border-t border-neutral-200 py-8">
        <div className="mx-auto max-w-4xl px-5 text-center text-xs text-neutral-500">
          © {new Date().getFullYear()} The Wheeler Dealers. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
