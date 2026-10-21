/**
 * Per-emirate data used to generate local "car inspection in {emirate}" landing
 * pages. Each entry has genuinely distinct copy and a real list of areas so the
 * pages are useful and unique (not thin duplicate/"doorway" pages).
 */

export type Emirate = {
  /** URL slug, e.g. "dubai" → /inspection/dubai */
  slug: string;
  /** Display name, e.g. "Dubai" */
  name: string;
  /** One-line intro shown under the H1. */
  intro: string;
  /** A short, location-specific paragraph of useful context. */
  body: string;
  /** Real neighbourhoods / areas we cover — shown as chips. */
  areas: string[];
};

export const EMIRATES: Emirate[] = [
  {
    slug: "dubai",
    name: "Dubai",
    intro:
      "Book a professional mobile car inspection anywhere in Dubai — we come to you, from Downtown to Jebel Ali.",
    body:
      "Buying a used car in Dubai's fast-moving market? A pre-purchase inspection protects you from expensive surprises — accident history, engine and gearbox issues, or clocked mileage. Our inspector meets you at the seller's location, a showroom, or your home anywhere in Dubai and delivers a full 300+ point digital report the same day.",
    areas: [
      "Downtown Dubai",
      "Dubai Marina",
      "Business Bay",
      "Deira",
      "Bur Dubai",
      "Jumeirah",
      "Al Barsha",
      "Silicon Oasis",
      "Motor City",
      "Dubai Investment Park",
    ],
  },
  {
    slug: "abu-dhabi",
    name: "Abu Dhabi",
    intro:
      "Mobile pre-purchase car inspection across Abu Dhabi — from the Corniche to Mussafah.",
    body:
      "In Abu Dhabi, cars often cover long highway distances, so brakes, tyres and cooling systems deserve a close look before you buy. Our expert inspector comes to you anywhere in the capital and checks every major system, sending you a detailed report with 40+ photos so you can negotiate — or walk away — with confidence.",
    areas: [
      "Khalifa City",
      "Al Reem Island",
      "Yas Island",
      "Mussafah",
      "Al Raha",
      "Corniche",
      "Al Khalidiyah",
      "Mohammed Bin Zayed City",
    ],
  },
  {
    slug: "sharjah",
    name: "Sharjah",
    intro:
      "Trusted mobile car inspection throughout Sharjah — we inspect the car wherever it is.",
    body:
      "Sharjah's used-car scene offers great value, but private deals carry risk. Our pre-purchase inspection gives you an independent, unbiased assessment before money changes hands — covering the engine, body, electronics, tyres and a full road test — with a clear digital report you can rely on.",
    areas: [
      "Al Nahda",
      "Al Majaz",
      "Muwaileh",
      "Al Qasimia",
      "Al Khan",
      "Al Taawun",
      "Industrial Area",
    ],
  },
  {
    slug: "ajman",
    name: "Ajman",
    intro: "Mobile vehicle inspection in Ajman — expert checks at your location.",
    body:
      "Whether you're buying privately or from a dealer in Ajman, an independent inspection is the smartest AED you'll spend. We come to you, inspect 300+ points and hand you a photo-backed report so you know exactly what you're buying.",
    areas: [
      "Al Nuaimiya",
      "Al Rashidiya",
      "Al Jurf",
      "Ajman Corniche",
      "Al Mowaihat",
    ],
  },
  {
    slug: "ras-al-khaimah",
    name: "Ras Al Khaimah",
    intro:
      "Professional car inspection across Ras Al Khaimah — we bring the inspection to you.",
    body:
      "From city driving to mountain roads, cars in Ras Al Khaimah see varied conditions. Our mobile inspector checks the suspension, brakes, cooling and drivetrain thoroughly and delivers a full digital report, so a used-car purchase in RAK is a confident one.",
    areas: [
      "Al Nakheel",
      "Al Hamra",
      "Mina Al Arab",
      "Al Dhait",
      "Al Rams Road",
    ],
  },
  {
    slug: "fujairah",
    name: "Fujairah",
    intro: "Mobile car inspection in Fujairah — detailed, independent and on-site.",
    body:
      "Fujairah's coastal and mountain routes are demanding on a vehicle. Before you buy, let our expert inspector assess the car in person and give you an honest, detailed report covering every major system — no guesswork, no pressure.",
    areas: ["Fujairah City", "Dibba", "Al Faseel", "Sakamkam", "Merashid"],
  },
  {
    slug: "umm-al-quwain",
    name: "Umm Al Quwain",
    intro:
      "Trusted pre-purchase car inspection in Umm Al Quwain — we come to the car.",
    body:
      "Buying a used car in Umm Al Quwain? Get an independent 300+ point inspection before you commit. Our inspector meets you at the vehicle's location and provides a clear, photo-rich digital report so you can make a confident decision.",
    areas: ["Al Salamah", "Al Raas", "King Faisal Road", "Al Haditha"],
  },
];

export function getEmirate(slug: string): Emirate | undefined {
  return EMIRATES.find((e) => e.slug === slug);
}
