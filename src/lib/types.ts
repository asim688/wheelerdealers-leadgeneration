export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * Structured result of AI-analysing an uploaded vehicle inspection report
 * (e.g. a dubizzle / WheelerDealers comprehensive inspection PDF). Used to make
 * the valuation more accurate and to explain positive / negative factors.
 */
export interface InspectionAnalysis {
  hasReport?: boolean;
  /** Provider name if detected (e.g. "dubizzle"), else a generic label. */
  source?: string;
  make?: string;
  model?: string;
  year?: number;
  trim?: string;
  /** Odometer reading in km. */
  mileage?: number;
  serviceHistory?: string;
  keys?: string;
  accident?: string;
  /** Overall condition: Excellent | Good | Average | Needs repairs. */
  condition?: string;
  /** Overall rating on a 0-10 scale. */
  overallScore?: number;
  /** Section scores (0-100) when present in the report. */
  bodyDamageScore?: number;
  frameScore?: number;
  engineScore?: number;
  /** Human-readable strong points / issues extracted from the report. */
  positives?: string[];
  negatives?: string[];
  /** One-sentence condition summary. */
  summary?: string;
}

/** Structured vehicle + contact data the AI extracts during the Sell flow. */
export interface SellData {
  make?: string;
  model?: string;
  trim?: string;
  year?: number;
  mileage?: number;
  condition?: string;
  // Extended questionnaire (used by the V2 valuation reasoning)
  accident?: string;
  serviceHistory?: string;
  previousOwners?: number;
  warranty?: string;
  keys?: string;
  modifications?: string;
  /** Analysed inspection report, when the seller uploaded one. */
  inspection?: InspectionAnalysis;
  name?: string;
  mobile?: string;
  email?: string;
}

/** Which step of the Sell conversation we are on. */
export type SellStage = "car" | "contact" | "done";

/** The computed valuation returned once enough data is collected. */
export interface Estimate {
  min: number;
  max: number;
  point: number;
  currency: string;
  /** How many comparable DB listings the estimate is based on (0 = fallback). */
  sampleCount?: number;
  /** V2: confidence in the valuation, 0-100. */
  confidence?: number;
  /** V2: demand/liquidity signal from comparable supply. */
  marketStatus?: "High" | "Medium" | "Low";
  /** V2: reasons that push value up (from the questionnaire). */
  positives?: string[];
  /** V2: reasons that push value down (from the questionnaire). */
  negatives?: string[];
  /** V2: true when an uploaded inspection report informed the valuation. */
  inspectionUsed?: boolean;
  /** Which engine produced the price. */
  valuationSource?: "database" | "live-web" | "ai-knowledge" | "baseline";
  /** Marketplace domains that backed a live-web valuation (proof for the customer). */
  liveSources?: string[];
}

/** Response shape returned by POST /api/sell (legacy chat contract). */
export interface SellResponse {
  reply: string;
  stage: SellStage;
  data: SellData;
  estimate?: Estimate;
}

/** Result of decoding a chassis number (VIN) via the NHTSA vPIC API. */
export interface VinDecodeResult {
  vin: string;
  decoded: boolean;
  make: string;
  model: string;
  year?: number;
  bodyClass: string;
  /** Extra descriptive fields (when the decoder provides them). */
  trim?: string;
  transmission?: string;
  fuelType?: string;
  /** True when make+year decoded but model is missing (common for GCC cars). */
  partial?: boolean;
  errorCode?: string;
  /** Vehicle colour, when read from the registration card (Mulkiya). */
  color?: string;
  /** Engine number, when read from the registration card (Mulkiya). */
  engineNo?: string;
  /** Which decoder produced this result. */
  source?: "vincario" | "nhtsa" | "ai" | "mulkiya";
  /** True when Gemini filled in details the VIN APIs couldn't (e.g. the model). */
  aiAssisted?: boolean;
  message: string;
}

/**
 * Vehicle details extracted by AI vision from a UAE vehicle registration card
 * (the "Mulkiya" / بطاقة تسجيل المركبة). Used by the Sell flow instead of a VIN
 * decode: the customer uploads the back of the card and we read it directly.
 */
export interface MulkiyaExtraction {
  make: string;
  model: string;
  /** 4-digit manufacture year (the card's "Model" / سنة الصنع field). */
  year?: number;
  /** Chassis number (VIN), uppercased. */
  vin: string;
  /** Engine number ("Eng. No." on the card), uppercased. */
  engineNo?: string;
  color?: string;
  bodyClass?: string;
  origin?: string;
  /** False when the image isn't a legible Mulkiya. */
  readable: boolean;
  message: string;
}

/** Body accepted by POST /api/sell for the structured VIN-first submit. */
export interface SellSubmit {
  vin?: string;
  engineNo?: string;
  make: string;
  model: string;
  trim?: string;
  year: number;
  mileage: number;
  condition: string;
  // Extended questionnaire (optional)
  accident?: string;
  serviceHistory?: string;
  previousOwners?: number;
  warranty?: string;
  keys?: string;
  modifications?: string;
  /** Analysed inspection report (from POST /api/sell/inspection-report). */
  inspection?: InspectionAnalysis;
  name: string;
  mobile: string;
  email: string;
}

export type TabId = "buy" | "sell" | "trade" | "dealer";

/** A car from the dealer inventory, returned to buyers. */
export interface Car {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  bodyType: string;
  fuelType: string;
  transmission: string;
  color?: string | null;
  seats?: number | null;
  description?: string | null;
  imageUrl?: string | null;
}

/** Search criteria the AI extracts from a buyer's free-text request. */
export interface BuyCriteria {
  makes?: string[];
  bodyTypes?: string[];
  fuelTypes?: string[];
  transmission?: string;
  minYear?: number;
  maxYear?: number;
  maxPrice?: number;
  minSeats?: number;
  keywords?: string[];
}

/** Which step of the Buy conversation we are on. */
export type BuyStage = "searching" | "results";

/** A matched car plus why it matched. */
export interface CarMatch extends Car {
  matchScore: number;
}

/** Response shape returned by POST /api/buy. */
export interface BuyResponse {
  reply: string;
  stage: BuyStage;
  matches: CarMatch[];
  currency: string;
}

// ---------------------------------------------------------------------------
// TRADE flow (sell current car + buy a replacement)
// ---------------------------------------------------------------------------

/** Details of the car the user currently owns and wants to trade in. */
export interface TradeInCar {
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  condition?: string;
}

/** Which step of the Trade conversation we are on. */
export type TradeStage = "tradeIn" | "wants" | "contact" | "done";

/** Response shape returned by POST /api/trade. */
export interface TradeResponse {
  reply: string;
  stage: TradeStage;
  tradeIn: TradeInCar;
  wants: BuyCriteria;
  estimate?: Estimate;
  matches: CarMatch[];
  currency: string;
}

// ---------------------------------------------------------------------------
// DEALER CORE (auction + bidding)
// ---------------------------------------------------------------------------

/** The authenticated dealer's public profile. */
export interface DealerProfile {
  id: string;
  name: string;
  email: string;
  approved?: boolean;
}

/**
 * An auction as seen by a dealer. Deliberately omits the seller's contact
 * details (name / mobile / email) — the platform brokers the deal.
 */
export interface AuctionListing {
  id: string;
  status: string;
  endsAt: string | null;
  createdAt: string;
  car: {
    make: string;
    model: string;
    year: number;
    mileage: number;
    condition: string;
  };
  estimateMin: number | null;
  estimateMax: number | null;
  currency: string;
  highestBid: number | null;
  bidCount: number;
  yourBid: number | null;
  leadType: string; // sell | trade
}

// ---------------------------------------------------------------------------
// ADMIN (platform operator)
// ---------------------------------------------------------------------------

/** Aggregate snapshot of the whole database for the admin overview. */
export interface AdminOverview {
  counts: {
    leads: number;
    cars: number;
    carsSold: number;
    dealers: number;
    dealersApproved: number;
    dealersPending: number;
    auctions: number;
    auctionsOpen: number;
    auctionsClosed: number;
    bids: number;
    marketPrices: number;
    carListings: number;
    inspectionsBooked: number;
  };
  leadsByIntent: Array<{ intent: string; count: number }>;
  avgEstimate: { min: number; max: number };
  topMakes: Array<{ make: string; count: number }>;
  recentLeads: Array<{
    id: string;
    intent: string;
    car: string;
    name: string;
    estimateMin: number | null;
    estimateMax: number | null;
    currency: string;
    createdAt: string;
  }>;
  currency: string;
}

/** A registered dealer as seen by the admin. */
export interface AdminDealer {
  id: string;
  name: string;
  email: string;
  approved: boolean;
  createdAt: string;
}

/** Query params the admin Leads table sends to the server. */
export interface AdminLeadsQuery {
  q: string;
  intent: string;
  make: string;
  condition: string;
  accident: string;
  inspection: string; // "" | "booked" | "none"
  dateFrom: string;
  dateTo: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
}

/** Paginated, faceted response for the admin Leads table. */
export interface AdminLeadsResponse {
  leads: AdminLead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: {
    makes: string[];
    intents: string[];
    conditions: string[];
  };
}

export interface AdminMarketListing {
  id: string;
  title: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  mileageKm: number | null;
  specs: string;
  transmission: string;
  priceAed: number;
  location: string;
  source: string;
  createdAt: string;
}

export interface AdminMarketResponse {
  listings: AdminMarketListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: {
    sources: { source: string; count: number }[];
    makes: string[];
  };
}

/** A captured lead as seen by the admin — the full record for follow-up. */
export interface AdminLead {
  id: string;
  intent: string; // sell | trade | buy | dealer
  createdAt: string;
  // Vehicle
  make: string;
  model: string;
  year: number | null;
  mileage: number | null;
  condition: string;
  // Extended questionnaire
  accident: string | null;
  serviceHistory: string | null;
  previousOwners: number | null;
  warranty: string | null;
  keys: string | null;
  modifications: string | null;
  // Valuation
  estimateMin: number | null;
  estimateMax: number | null;
  currency: string;
  // Contact
  name: string;
  mobile: string;
  email: string;
  // Inspection booking
  inspectionType: string | null;
  inspectionSlot: string | null;
  inspectionAt: string | null;
}

/** A single bid as seen by the admin, including which dealer placed it. */
export interface AdminBid {
  id: string;
  amount: number;
  createdAt: string;
  dealerName: string;
  dealerEmail: string;
}

/**
 * An auction as seen by the admin — includes the seller's contact details (so
 * the operator can finalise the deal) and the full bid history.
 */
export interface AdminAuction {
  id: string;
  status: string; // open | closed
  endsAt: string | null;
  createdAt: string;
  leadType: string;
  car: {
    make: string;
    model: string;
    year: number;
    mileage: number;
    condition: string;
  };
  estimateMin: number | null;
  estimateMax: number | null;
  currency: string;
  seller: {
    name: string;
    mobile: string;
    email: string;
  };
  bids: AdminBid[];
  highestBid: number | null;
  winningBidId: string | null;
}

// ---------------------------------------------------------------------------
// VEHICLE INSPECTION MODULE
// ---------------------------------------------------------------------------

/** Payload the public booking wizard posts to create an inspection job. */
/** A location chosen via Google Places autocomplete, GPS, or manual entry. */
export interface SelectedLocation {
  formattedAddress: string;
  lat?: number;
  lng?: number;
  city?: string;
  emirate?: string;
  country?: string;
  placeId?: string;
  /** A shareable Google Maps pin link, when coordinates are known. */
  mapUrl?: string;
}

export interface InspectionBookingInput {
  // Step 1 — Customer
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  // Step 2 — Vehicle (VIN decode)
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  bodyClass?: string;
  trim?: string;
  transmission?: string;
  fuelType?: string;
  /** Any extra free-text remarks the customer shared during booking. */
  notes?: string;
  // Step 3 — Location
  address: string;
  city?: string;
  emirate?: string;
  lat?: number;
  lng?: number;
  // Step 4 — Schedule
  date?: string; // ISO date (YYYY-MM-DD)
  slot?: string; // e.g. "09:00 AM"
}

/** Confirmation returned after a successful booking. */
export interface InspectionBookingResult {
  ok: boolean;
  jobId: string;
  jobCode: string;
  fee: number;
  currency: string;
  scheduledAt: string | null;
  scheduledSlot: string | null;
  /** Hosted payment page (Stripe Checkout) when online payment is enabled. */
  payUrl?: string | null;
}

/** The signed-in inspector's public profile. */
export interface InspectorProfile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}

/** Inspection-company dashboard stat counts + earnings. */
export interface InspectorStats {
  open: number;
  today: number;
  completed: number;
  thisWeek?: number;
  avgScore?: number | null;
  /** Jobs currently in the marketplace pool. */
  available?: number;
  /** Total payout for completed jobs. */
  earned?: number;
  /** Payout for accepted/in-progress/submitted jobs (not yet finalised). */
  pendingEarnings?: number;
}

/** A job row in the company's list. */
export interface InspectorJob {
  id: string;
  jobCode: string;
  status: string;
  vehicle: string;
  customerName: string;
  customerMobile: string;
  location: string;
  scheduledAt: string | null;
  scheduledSlot: string | null;
  payout?: number | null;
  currency?: string;
  completedAt?: string | null;
}

/** A job row in the marketplace Available pool (no customer contact yet). */
export interface AvailableJob {
  id: string;
  jobCode: string;
  status: string;
  vehicle: string;
  location: string;
  scheduledAt: string | null;
  scheduledSlot: string | null;
  createdAt: string;
}

/** A single inspection point (per-job) as seen by the inspector. */
export interface InspectorItem {
  id: string;
  section: string;
  itemKey: string;
  label: string;
  condition: string | null;
  comments: string | null;
  order: number;
}

/** A photo attached to a job / item. */
export interface InspectorPhoto {
  id: string;
  itemId: string | null;
  url: string;
  caption: string | null;
}

/** Full job detail for the inspector's job view + inspection form. */
export interface InspectorJobDetail {
  id: string;
  jobCode: string;
  status: string;
  customer: { name: string; mobile: string; email: string };
  vehicle: {
    label: string;
    vin: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    trim: string | null;
    transmission: string | null;
    fuelType: string | null;
  };
  location: { address: string | null; city: string | null; emirate: string | null; full: string };
  scheduledAt: string | null;
  scheduledSlot: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

/** An inspection job row in the admin Jobs Management table. */
export interface AdminInspectionJob {
  id: string;
  jobCode: string;
  status: string;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  vehicle: string;
  location: string;
  inspector: { id: string; name: string } | null;
  scheduledAt: string | null;
  scheduledSlot: string | null;
  fee: number | null;
  currency: string;
  paymentStatus?: string;
  paymentProvider?: string | null;
  paymentRef?: string | null;
  paidAt?: string | null;
  partnerPayout?: number | null;
  commission?: number | null;
  reportToken?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

/** Paginated response for the admin Jobs Management screen. */
export interface AdminInspectionsResponse {
  jobs: AdminInspectionJob[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCounts: Record<string, number>;
  revenue?: number;
  payouts?: number;
  commission?: number;
  currency?: string;
  inspectors: Array<{ id: string; name: string }>;
}

/** An inspection company as seen by the admin roster. */
export interface AdminInspector {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  approvalStatus?: string;
  contactPerson?: string | null;
  tradeLicense?: string | null;
  areas?: string | null;
  services?: string | null;
  jobCount: number;
  createdAt: string;
}
