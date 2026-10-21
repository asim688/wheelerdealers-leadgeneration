/**
 * Blog content model + articles.
 *
 * Content is authored as typed "blocks" (no MDX dependency) so it renders as
 * clean, fully-crawlable server HTML. Each article targets a specific long-tail
 * search intent (e.g. "pre-purchase car inspection Dubai", "car inspection cost")
 * with genuinely useful, substantial content — not thin/duplicate pages.
 */

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "cta"; text: string; href: string; label: string };

export type BlogPost = {
  slug: string;
  title: string;
  /** Meta description (~150–160 chars). */
  description: string;
  keywords: string[];
  /** ISO date, e.g. "2026-08-01". */
  datePublished: string;
  dateModified?: string;
  readingTimeMins: number;
  category: string;
  /** Short teaser used on the blog index and cards. */
  excerpt: string;
  /** Optional FAQ block — also emitted as FAQPage structured data. */
  faqs?: { question: string; answer: string }[];
  body: Block[];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "pre-purchase-car-inspection-dubai-guide",
    title: "Pre-Purchase Car Inspection in Dubai: The Complete 2026 Guide",
    description:
      "Everything you need to know about a pre-purchase car inspection in Dubai — what's checked, how much it costs, how long it takes and how it saves you money.",
    keywords: [
      "pre-purchase car inspection Dubai",
      "car inspection Dubai",
      "used car inspection Dubai",
      "PPI Dubai",
      "car check before buying Dubai",
    ],
    datePublished: "2026-08-01",
    readingTimeMins: 8,
    category: "Buying Guides",
    excerpt:
      "Buying a used car in Dubai? A pre-purchase inspection is the cheapest insurance you'll ever buy. Here's exactly what it covers and why it matters.",
    faqs: [
      {
        question: "Is a pre-purchase inspection worth it in Dubai?",
        answer:
          "Yes. For a small flat fee, an independent inspection can reveal accident damage, engine or gearbox problems and clocked mileage — issues that could cost you tens of thousands of dirhams after purchase. On a used car it's the single best-value check you can do.",
      },
      {
        question: "Can I get a car inspected before buying it privately in Dubai?",
        answer:
          "Absolutely. Our inspection is mobile, so we meet you and the seller at any agreed location in Dubai — the seller's home, a car park or a showroom — and inspect the car on the spot before you pay.",
      },
      {
        question: "How long does a pre-purchase inspection take in Dubai?",
        answer:
          "A full 300+ point inspection typically takes 45–90 minutes on site. You then receive a complete digital report with photos, usually the same day.",
      },
    ],
    body: [
      {
        type: "p",
        text: "Dubai has one of the most active used-car markets in the world. Great deals are everywhere — but so are cars with hidden accident history, odometer rollbacks and mechanical problems that only surface weeks after you've paid. A pre-purchase inspection (PPI) is an independent, professional check of a used car before you buy it, and it's the single smartest step you can take to protect your money.",
      },
      {
        type: "p",
        text: "This guide explains exactly what a pre-purchase car inspection in Dubai covers, what it costs, how long it takes, and how to use the report to negotiate a better price — or walk away from a bad deal.",
      },
      { type: "h2", text: "What is a pre-purchase car inspection?" },
      {
        type: "p",
        text: "A pre-purchase inspection is a detailed, top-to-bottom assessment of a used vehicle carried out by an independent, qualified inspector who has no stake in the sale. Unlike the seller — who wants the car to look its best — the inspector's only job is to tell you the truth about the car's real condition.",
      },
      {
        type: "p",
        text: "At The Wheeler Dealers, a full inspection covers 300+ individual points across every major system, backed by 40+ photos and a written digital report you keep forever.",
      },
      { type: "h2", text: "What does the inspection cover?" },
      {
        type: "p",
        text: "A thorough PPI goes far beyond a quick look under the bonnet. Here's what a proper inspection examines:",
      },
      {
        type: "ul",
        items: [
          "Engine — oil condition, leaks, cold-start behaviour, unusual noises, warning lights and error codes read via OBD scan.",
          "Transmission & drivetrain — smooth gear changes, clutch wear, differential and driveshaft condition.",
          "Body & paint — panel gaps, repaint marks, filler and signs of previous accident repair.",
          "Chassis & underbody — rust, structural damage and evidence of a heavy impact.",
          "Suspension, steering & brakes — wear, play, pad and disc condition, and braking performance.",
          "Tyres — tread depth, age, uneven wear (a sign of alignment or suspension issues).",
          "Electrical & electronics — lights, AC (critical in the UAE heat), infotainment, sensors and cameras.",
          "Interior — wear consistent with the claimed mileage, water damage and odours.",
          "Road test — real-world behaviour under acceleration, braking and cornering.",
        ],
      },
      { type: "h2", text: "Why it matters more in the UAE" },
      {
        type: "p",
        text: "The UAE climate is uniquely tough on cars. Extreme summer heat stresses the air-conditioning, cooling system, battery and rubber components. Fine desert dust works into filters and seals. And because many cars are imported or have been flood-damaged elsewhere, history checks are essential. A good inspector knows exactly where these region-specific problems hide.",
      },
      {
        type: "quote",
        text: "The cost of an inspection is tiny compared with the cost of the first major repair you didn't see coming.",
      },
      { type: "h2", text: "How much does it cost — and is it worth it?" },
      {
        type: "p",
        text: "A professional pre-purchase inspection in Dubai is a small, flat fee — a fraction of one percent of what you're about to spend on the car. Set against the risk of buying a vehicle with a blown gearbox, hidden accident damage or rolled-back mileage, it pays for itself many times over. Even when a car checks out perfectly, the report gives you peace of mind and a documented record of its condition.",
      },
      {
        type: "cta",
        text: "Ready to buy with confidence?",
        href: "/inspection/book",
        label: "Book a Dubai inspection",
      },
      { type: "h2", text: "How to use the report" },
      {
        type: "ol",
        items: [
          "Read the summary first — it flags the most important issues.",
          "Use any faults as leverage to negotiate the price down, or ask the seller to fix them.",
          "For serious structural or engine problems, treat the report as your signal to walk away.",
          "Keep the report — it's useful evidence of condition when you come to resell.",
        ],
      },
      { type: "h2", text: "The bottom line" },
      {
        type: "p",
        text: "In a market as fast-moving as Dubai's, an independent pre-purchase inspection turns a risky gamble into an informed decision. For a small fee you get the full picture of what you're buying — and the confidence to negotiate hard or walk away. It's the cheapest insurance policy in motoring.",
      },
    ],
  },
  {
    slug: "car-inspection-cost-uae",
    title: "How Much Does a Car Inspection Cost in the UAE? (2026 Prices)",
    description:
      "A clear breakdown of car inspection costs in the UAE — what affects the price, what's included in a good inspection and how to avoid paying for the wrong thing.",
    keywords: [
      "car inspection cost UAE",
      "car inspection price Dubai",
      "how much is a car inspection",
      "vehicle inspection price UAE",
      "cheapest car inspection Dubai",
    ],
    datePublished: "2026-08-02",
    readingTimeMins: 6,
    category: "Costs & Pricing",
    excerpt:
      "Wondering what a car inspection should cost in the UAE? Here's what drives the price and how to make sure you're paying for real value.",
    faqs: [
      {
        question: "How much does a car inspection cost in the UAE?",
        answer:
          "Prices vary by provider and scope, but a full mobile pre-purchase inspection with a 300+ point check, photos and a digital report is a modest flat fee. The Wheeler Dealers charges a single transparent price with no hidden extras — see the booking page for the current figure.",
      },
      {
        question: "Why are some car inspections so cheap?",
        answer:
          "Very cheap inspections often cover far fewer points, skip the road test or the OBD scan, or don't include photos and a written report. Always check exactly what's included before comparing prices.",
      },
    ],
    body: [
      {
        type: "p",
        text: "\"How much does a car inspection cost?\" is one of the most common questions from UAE car buyers — and the honest answer is: it depends on what you're actually getting. This guide breaks down what drives the price so you can compare fairly and avoid paying for a check that misses the things that matter.",
      },
      { type: "h2", text: "What you're really paying for" },
      {
        type: "p",
        text: "A car inspection price reflects the depth of the check and the expertise behind it. The main factors are:",
      },
      {
        type: "ul",
        items: [
          "Number of inspection points — a 50-point glance is not the same as a 300+ point inspection.",
          "Whether it's mobile — a mobile inspector who comes to you saves you time and transport.",
          "Diagnostics — a proper OBD scan reads hidden fault codes the eye can't see.",
          "Photos and a written report — documentation you can keep and use to negotiate.",
          "Road test — real-world driving reveals faults a static check never will.",
          "Inspector expertise — an experienced inspector spots region-specific problems fast.",
        ],
      },
      { type: "h2", text: "Cheap vs. valuable: what to watch for" },
      {
        type: "p",
        text: "The cheapest inspection is rarely the best value. A low headline price often means fewer points checked, no road test, no diagnostic scan, or no written report. If a fault slips through because the inspection was shallow, the \"saving\" can cost you thousands later.",
      },
      {
        type: "quote",
        text: "Compare inspections on what's included — not just the headline price.",
      },
      { type: "h2", text: "What a fair, transparent price looks like" },
      {
        type: "p",
        text: "A good inspection is a single flat fee with no surprises. At The Wheeler Dealers, one transparent price includes the full 300+ point inspection, 40+ photos, a diagnostic scan, a road test and a same-day digital report. You know exactly what you're paying before you book.",
      },
      {
        type: "cta",
        text: "See the current inspection price",
        href: "/inspection/book",
        label: "Book an inspection",
      },
      { type: "h2", text: "Is it worth the money?" },
      {
        type: "p",
        text: "Set the inspection fee against the price of the car and the cost of a single major repair, and the answer is almost always yes. Whether the report reveals a deal-breaking fault or simply confirms the car is sound, you come away able to make a confident, informed decision — which is exactly what you're paying for.",
      },
    ],
  },
  {
    slug: "used-car-inspection-checklist",
    title: "Used Car Inspection Checklist: 15 Things to Check Before You Buy",
    description:
      "A practical used-car inspection checklist for UAE buyers — 15 essential checks covering the engine, body, tyres, interior and documents before you hand over money.",
    keywords: [
      "used car inspection checklist",
      "car inspection checklist UAE",
      "what to check before buying a used car",
      "used car checklist Dubai",
    ],
    datePublished: "2026-08-03",
    readingTimeMins: 7,
    category: "Buying Guides",
    excerpt:
      "Viewing a used car this weekend? Run through these 15 checks first — then let a professional confirm what you can't see.",
    faqs: [
      {
        question: "What should I check before buying a used car in the UAE?",
        answer:
          "Start with the documents, service history and VIN, then check the body for repaint or accident repair, the tyres for uneven wear, the AC (critical in the UAE), warning lights and how the car drives. For anything mechanical or structural, get a professional pre-purchase inspection.",
      },
      {
        question: "Can I inspect a used car myself?",
        answer:
          "You can do a useful first-pass check yourself using a checklist like this one, but many serious faults — internal engine wear, hidden accident repair, electronic faults — need diagnostic tools and experience to catch. A professional inspection is the safe way to confirm.",
      },
    ],
    body: [
      {
        type: "p",
        text: "A used car can look perfect and still hide expensive problems. Before you fall for a shiny paint job, run through this 15-point checklist. It won't replace a professional inspection — but it will help you weed out obvious lemons before you spend money on a full check.",
      },
      { type: "h2", text: "Documents & history" },
      {
        type: "ol",
        items: [
          "Match the VIN on the chassis, windscreen and registration card — they must be identical.",
          "Check the service history for regular, consistent servicing.",
          "Confirm the mileage looks consistent with the car's age and wear.",
          "Verify there's no outstanding finance or unpaid fines on the vehicle.",
        ],
      },
      { type: "h2", text: "Exterior & body" },
      {
        type: "ol",
        items: [
          "Look down each panel in daylight for colour mismatch or ripples (signs of repaint or filler).",
          "Check panel gaps are even — uneven gaps can indicate accident repair.",
          "Inspect the tyres for tread depth and uneven wear (a clue to alignment or suspension faults).",
          "Look under the car for rust, leaks and fresh undersealing hiding damage.",
        ],
      },
      { type: "h2", text: "Interior & electronics" },
      {
        type: "ol",
        items: [
          "Test the air-conditioning thoroughly — in the UAE a weak AC is a serious, costly fault.",
          "Check all warning lights come on then go off; a light that never comes on may be hidden.",
          "Test every electric window, the infotainment, cameras and sensors.",
          "Look for wear on the pedals, seat and steering wheel that matches the claimed mileage.",
        ],
      },
      { type: "h2", text: "Engine & driving" },
      {
        type: "ol",
        items: [
          "Start the car from cold — listen for rattles and watch for smoke.",
          "Check the oil and coolant for correct level and condition.",
          "Drive it: the gearbox should shift smoothly, the brakes pull straight, and there should be no vibration or pulling.",
        ],
      },
      {
        type: "quote",
        text: "If a seller won't let you drive the car or take it for inspection, walk away.",
      },
      { type: "h2", text: "The check you can't do yourself" },
      {
        type: "p",
        text: "This checklist catches the obvious problems — but internal engine wear, hidden structural repair, diagnostic fault codes and suspension issues need tools and experience to find. That's where a professional pre-purchase inspection comes in. Our inspector runs a 300+ point check, reads the car's fault codes and gives you a full report so nothing is left to chance.",
      },
      {
        type: "cta",
        text: "Let a professional confirm the car is sound",
        href: "/inspection/book",
        label: "Book an inspection",
      },
    ],
  },
  {
    slug: "rta-vs-pre-purchase-inspection",
    title: "RTA Vehicle Inspection vs Pre-Purchase Inspection: What's the Difference?",
    description:
      "RTA testing and a pre-purchase inspection are not the same thing. Here's what each one checks, when you need it, and why passing the RTA test doesn't mean a car is a good buy.",
    keywords: [
      "RTA vehicle inspection",
      "RTA car test",
      "RTA vs pre-purchase inspection",
      "vehicle inspection Dubai RTA",
      "car passing test Dubai",
    ],
    datePublished: "2026-08-04",
    readingTimeMins: 6,
    category: "How It Works",
    excerpt:
      "Passing the RTA test means a car is road-legal — not that it's a good buy. Here's the crucial difference every UAE buyer should understand.",
    faqs: [
      {
        question: "Is an RTA inspection the same as a pre-purchase inspection?",
        answer:
          "No. An RTA (or Tasjeel) test confirms a car meets the minimum legal and safety standard to be registered on UAE roads. A pre-purchase inspection is a far deeper, independent assessment of the car's overall condition and value before you buy it.",
      },
      {
        question: "Do I still need a pre-purchase inspection if the car passed the RTA test?",
        answer:
          "Yes. A car can pass the RTA test and still have worn components, hidden accident repair, gearbox problems or an expensive fault developing. The RTA test is a pass/fail legal check; a pre-purchase inspection tells you whether the car is actually worth buying.",
      },
    ],
    body: [
      {
        type: "p",
        text: "Buyers in the UAE often assume that a car which has passed its RTA test must be a safe purchase. It's an easy mistake — but the RTA test and a pre-purchase inspection do two completely different jobs. Understanding the difference can save you from an expensive mistake.",
      },
      { type: "h2", text: "What the RTA vehicle inspection is" },
      {
        type: "p",
        text: "The RTA test (carried out at Tasjeel and other approved centres) is a mandatory technical inspection required to register or renew a vehicle on Dubai's roads. It's essentially a pass/fail safety and emissions check against a minimum legal standard. It confirms the car is road-legal — nothing more.",
      },
      {
        type: "ul",
        items: [
          "It's a legal requirement, not a buyer's tool.",
          "It's pass/fail against a minimum standard.",
          "It doesn't tell you about wear, accident history or long-term reliability.",
          "It doesn't value the car or advise you whether to buy it.",
        ],
      },
      { type: "h2", text: "What a pre-purchase inspection is" },
      {
        type: "p",
        text: "A pre-purchase inspection is an independent, in-depth assessment carried out for the buyer, not the authorities. Its whole purpose is to tell you the real condition of the car and whether it's worth what the seller is asking.",
      },
      {
        type: "ul",
        items: [
          "It's done for you, the buyer, before you commit.",
          "It covers 300+ points across every system, not just the legal minimum.",
          "It flags accident repair, wear, developing faults and diagnostic error codes.",
          "It gives you a detailed report and photos to negotiate with — or walk away.",
        ],
      },
      {
        type: "quote",
        text: "RTA-passed means road-legal. It does not mean problem-free.",
      },
      { type: "h2", text: "Why you need both" },
      {
        type: "p",
        text: "The RTA test keeps the car legal on the road; the pre-purchase inspection protects your wallet. A vehicle can sail through its RTA test while hiding a slipping gearbox, repaired crash damage or a fault code that's about to become a major bill. Only a proper pre-purchase inspection reveals those things before you pay.",
      },
      {
        type: "cta",
        text: "Get the full picture before you buy",
        href: "/inspection/book",
        label: "Book a pre-purchase inspection",
      },
      { type: "h2", text: "In short" },
      {
        type: "p",
        text: "Treat the RTA test as the legal box that must be ticked, and the pre-purchase inspection as the smart buyer's due diligence. One tells you the car can be driven; the other tells you whether you should buy it. For any used-car purchase in the UAE, you want both.",
      },
    ],
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

/** Posts sorted newest-first, for the blog index. */
export function getSortedPosts(): BlogPost[] {
  return [...BLOG_POSTS].sort((a, b) =>
    b.datePublished.localeCompare(a.datePublished),
  );
}
