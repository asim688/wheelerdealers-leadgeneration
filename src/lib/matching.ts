import type { BuyCriteria, Car, CarMatch } from "./types";

/**
 * ----------------------------------------------------------------------------
 * Inventory matching (rule-based scoring).
 * ----------------------------------------------------------------------------
 * Scores each car in the inventory against the buyer's criteria and returns the
 * best matches. This is a transparent, dependency-free approach that works on
 * SQLite today.
 *
 * For production-grade semantic search, upgrade to PostgreSQL + pgvector and
 * match Gemini embeddings of the buyer's request against embedded car
 * descriptions. The scoring weights below are a good fallback / re-rank layer.
 * ----------------------------------------------------------------------------
 */

const lc = (s?: string | null) => (s ?? "").toLowerCase().trim();

function scoreCar(car: Car, c: BuyCriteria): number {
  let score = 0;

  // Make preference (strong signal)
  const makes = (c.makes ?? []).map(lc).filter(Boolean);
  if (makes.length) {
    score += makes.includes(lc(car.make)) ? 40 : -15;
  }

  // Body type (strong signal)
  const bodyTypes = (c.bodyTypes ?? []).map(lc).filter(Boolean);
  if (bodyTypes.length) {
    score += bodyTypes.includes(lc(car.bodyType)) ? 35 : -25;
  }

  // Fuel type (medium signal)
  const fuelTypes = (c.fuelTypes ?? []).map(lc).filter(Boolean);
  if (fuelTypes.length) {
    score += fuelTypes.includes(lc(car.fuelType)) ? 25 : -15;
  }

  // Transmission (medium signal)
  if (c.transmission) {
    score += lc(car.transmission) === lc(c.transmission) ? 15 : -8;
  }

  // Budget: reward being under budget, penalise going over proportionally.
  if (c.maxPrice && c.maxPrice > 0) {
    if (car.price <= c.maxPrice) {
      score += 30;
      // Bonus for using the budget well (not absurdly cheap relative to ceiling).
      const ratio = car.price / c.maxPrice;
      if (ratio >= 0.6) score += 8;
    } else {
      const over = (car.price - c.maxPrice) / c.maxPrice;
      score -= Math.min(60, 25 + over * 100); // small overshoot tolerated, large punished
    }
  }

  // Year range
  if (c.minYear && c.minYear > 0) {
    score += car.year >= c.minYear ? 12 : -20;
  }
  if (c.maxYear && c.maxYear > 0) {
    score += car.year <= c.maxYear ? 8 : -10;
  }

  // Seats / family size
  if (c.minSeats && c.minSeats > 0 && car.seats) {
    score += car.seats >= c.minSeats ? 12 : -18;
  }

  // Keyword hints matched against model + description + body/fuel type.
  const haystack = [
    car.make,
    car.model,
    car.bodyType,
    car.fuelType,
    car.transmission,
    car.color,
    car.description,
  ]
    .map(lc)
    .join(" ");
  for (const kw of (c.keywords ?? []).map(lc).filter(Boolean)) {
    if (haystack.includes(kw)) score += 6;
  }

  // Gentle preference for newer, lower-mileage cars to break ties.
  score += Math.max(0, car.year - 2015) * 0.5;
  score -= car.mileage / 20000;

  return score;
}

/**
 * Returns up to `limit` cars ranked by how well they match the criteria.
 * If the criteria are essentially empty, returns a sensible default selection.
 */
export function matchCars(
  inventory: Car[],
  criteria: BuyCriteria,
  limit = 4,
): CarMatch[] {
  const hasSignal =
    (criteria.makes?.length ?? 0) > 0 ||
    (criteria.bodyTypes?.length ?? 0) > 0 ||
    (criteria.fuelTypes?.length ?? 0) > 0 ||
    Boolean(criteria.transmission) ||
    (criteria.maxPrice ?? 0) > 0 ||
    (criteria.minYear ?? 0) > 0 ||
    (criteria.minSeats ?? 0) > 0 ||
    (criteria.keywords?.length ?? 0) > 0;

  const scored: CarMatch[] = inventory.map((car) => ({
    ...car,
    matchScore: scoreCar(car, criteria),
  }));

  scored.sort((a, b) => b.matchScore - a.matchScore);

  // When there is a real signal, drop clearly poor matches (negative score).
  const filtered = hasSignal ? scored.filter((c) => c.matchScore > 0) : scored;

  return (filtered.length ? filtered : scored).slice(0, limit);
}
