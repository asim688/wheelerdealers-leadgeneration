import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BLOG_POSTS, getPost, getSortedPosts } from "@/lib/blog";
import {
  absoluteUrl,
  blogPostingJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
} from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import BlogChrome from "@/components/BlogChrome";
import BlogContent from "@/components/BlogContent";
import InspectionFaq from "@/components/InspectionFaq";

export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: absoluteUrl(`/blog/${post.slug}`),
      type: "article",
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified ?? post.datePublished,
    },
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const related = getSortedPosts()
    .filter((p) => p.slug !== post.slug)
    .slice(0, 2);

  return (
    <>
      <JsonLd
        data={[
          blogPostingJsonLd({
            slug: post.slug,
            title: post.title,
            description: post.description,
            datePublished: post.datePublished,
            dateModified: post.dateModified,
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
          ...(post.faqs ? [faqJsonLd(post.faqs)] : []),
        ]}
      />
      <BlogChrome>
        <article className="mx-auto max-w-3xl px-5 pt-8 lg:pt-12">
          <nav className="text-xs text-neutral-500" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-red-600">Home</Link>
            <span className="mx-1.5">/</span>
            <Link href="/blog" className="hover:text-red-600">Blog</Link>
          </nav>

          <div className="mt-5 flex items-center gap-3 text-xs">
            <span className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 font-semibold text-red-600">
              {post.category}
            </span>
            <time dateTime={post.datePublished} className="text-neutral-500">
              {formatDate(post.datePublished)}
            </time>
            <span className="text-neutral-400">· {post.readingTimeMins} min read</span>
          </div>

          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-neutral-900 sm:text-4xl">
            {post.title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-neutral-600">
            {post.excerpt}
          </p>

          <hr className="my-8 border-neutral-200" />

          <BlogContent blocks={post.body} />
        </article>

        {post.faqs && post.faqs.length > 0 && (
          <InspectionFaq title="Frequently asked questions" items={post.faqs} />
        )}

        {related.length > 0 && (
          <section className="border-t border-neutral-200 py-12">
            <div className="mx-auto max-w-3xl px-5">
              <h2 className="text-lg font-bold text-neutral-900">Keep reading</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/blog/${r.slug}`}
                    className="group rounded-2xl border border-neutral-200 p-5 transition-shadow hover:shadow-md"
                  >
                    <h3 className="font-semibold text-neutral-900 group-hover:text-red-600">
                      {r.title}
                    </h3>
                    <p className="mt-1.5 text-sm text-neutral-600">{r.excerpt}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </BlogChrome>
    </>
  );
}
