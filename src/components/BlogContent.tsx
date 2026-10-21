import Link from "next/link";
import type { Block } from "@/lib/blog";

/** Renders a blog article's typed content blocks as clean, crawlable HTML. */
export default function BlogContent({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2 key={i} className="mt-10 text-2xl font-bold text-neutral-900">
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mt-6 text-xl font-semibold text-neutral-900">
                {block.text}
              </h3>
            );
          case "p":
            return (
              <p key={i} className="text-base leading-relaxed text-neutral-700">
                {block.text}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-2 pl-6 text-neutral-700">
                {block.items.map((it, j) => (
                  <li key={j} className="leading-relaxed">{it}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-2 pl-6 text-neutral-700">
                {block.items.map((it, j) => (
                  <li key={j} className="leading-relaxed">{it}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="border-l-4 border-red-500 bg-red-50 px-5 py-4 text-lg font-medium italic text-neutral-800"
              >
                {block.text}
              </blockquote>
            );
          case "cta":
            return (
              <div
                key={i}
                className="my-8 flex flex-col items-start gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="text-base font-semibold text-neutral-900">{block.text}</p>
                <Link
                  href={block.href}
                  className="shrink-0 rounded-md bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  {block.label}
                </Link>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
