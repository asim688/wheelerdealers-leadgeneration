import { INSPECTION_FAQS } from "@/lib/seo";

/**
 * Visible FAQ block. The questions/answers here MUST match the FAQPage JSON-LD
 * (Google requires the structured data to reflect content visible on the page).
 * Rendered as plain, server-side text so every answer is fully crawlable.
 */
export default function InspectionFaq({
  title = "Frequently asked questions",
  items = INSPECTION_FAQS,
}: {
  title?: string;
  items?: { question: string; answer: string }[];
}) {
  return (
    <section className="border-t border-neutral-200 bg-white py-16">
      <div className="mx-auto max-w-3xl px-5">
        <h2 className="text-center text-2xl font-bold text-neutral-900">{title}</h2>
        <dl className="mt-8 divide-y divide-neutral-200">
          {items.map((f) => (
            <div key={f.question} className="py-5">
              <dt className="text-base font-semibold text-neutral-900">{f.question}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-neutral-600">{f.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
