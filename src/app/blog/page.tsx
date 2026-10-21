import type { Metadata } from "next";
import Link from "next/link";
import { getSortedPosts } from "@/lib/blog";
import { absoluteUrl, breadcrumbJsonLd } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import BlogChrome from "@/components/BlogChrome";

export const metadata: Metadata = {
  title: "Car Inspection & Buying Guides — The Wheeler Dealers Blog",
  description:
    "Expert guides on car inspection, buying used cars and vehicle checks in the UAE — pre-purchase inspection tips, cost breakdowns and checklists.",
  keywords: [
    "car inspection blog",
    "car buying guide UAE",
    "used car tips Dubai",
    "pre-purchase inspection guide",
  ],
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Car Inspection & Buying Guides — The Wheeler Dealers Blog",
    description:
      "Expert guides on car inspection and buying used cars in the UAE.",
    url: absoluteUrl("/blog"),
    type: "website",
  },
};

export default function BlogIndexPage() {
  const posts = getSortedPosts();

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Blog", path: "/blog" },
        ])}
      />
      <BlogChrome>
        <section className="mx-auto max-w-4xl px-5 pt-10 lg:pt-14">
          <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 sm:text-5xl">
            Car inspection &amp; buying guides
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-600">
            Practical, no-nonsense advice on inspecting and buying used cars in the
            UAE — so you spend your money with confidence.
          </p>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-12">
          <div className="grid gap-6 sm:grid-cols-2">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col rounded-2xl border border-neutral-200 p-6 transition-shadow hover:shadow-md"
              >
                <span className="inline-flex w-fit items-center rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                  {post.category}
                </span>
                <h2 className="mt-4 text-lg font-bold leading-snug text-neutral-900 group-hover:text-red-600">
                  {post.title}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-600">
                  {post.excerpt}
                </p>
                <span className="mt-4 text-xs font-medium text-neutral-400">
                  {post.readingTimeMins} min read
                </span>
              </Link>
            ))}
          </div>
        </section>
      </BlogChrome>
    </>
  );
}
