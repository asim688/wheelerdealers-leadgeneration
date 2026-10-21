import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { EMIRATES } from "@/lib/locations";
import { BLOG_POSTS } from "@/lib/blog";

/**
 * /sitemap.xml — the public, indexable pages. Private portals (admin, inspector,
 * dealer), API routes and per-token report pages are intentionally excluded.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const emiratePages: MetadataRoute.Sitemap = EMIRATES.map((e) => ({
    url: `${SITE_URL}/inspection/${e.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const blogPages: MetadataRoute.Sitemap = BLOG_POSTS.map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.dateModified ?? p.datePublished),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/inspection`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/inspection/book`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...emiratePages,
    ...blogPages,
  ];
}
