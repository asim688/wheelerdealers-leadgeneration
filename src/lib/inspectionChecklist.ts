/**
 * ----------------------------------------------------------------------------
 * Vehicle inspection checklist template (client format, October 2026).
 * ----------------------------------------------------------------------------
 * The Wheeler Dealers documents facts — it does not grade, score, pass/fail or
 * recommend a vehicle. Every parameter is recorded with neutral observation
 * wording and the customer makes the purchasing decision.
 *
 * Report sections:
 *   01 Vehicle identification ........ job + report fields (not items)
 *   02–11 .............................. checklist items below (materialised
 *                                        into per-job `InspectionItem` rows)
 *   12 Diagnostic scan & comments ..... report fields (not items)
 *   13 Photographic evidence .......... photo-slot items below
 *   14 Scope & customer decision ...... fixed text
 *
 * Edit freely — keys must stay unique.
 */

/** How a parameter is recorded by the inspector. */
export type ItemType = "observation" | "tyre" | "rim" | "paint" | "brake_type" | "photo";

export interface ChecklistItem {
  /** Stable unique key, e.g. "tyres.fl". */
  key: string;
  label: string;
  type: ItemType;
}

export interface ChecklistSection {
  key: string;
  title: string;
  items: ChecklistItem[];
}

export const NOT_ASSESSED = "Not assessed / unavailable";

/** Neutral observation choices offered for most parameters. */
export const OBSERVATION_OPTIONS = [
  "No obvious issue observed",
  "Wear or damage observed",
  NOT_ASSESSED,
] as const;

const RIM_OPTIONS = ["No obvious issue observed", "Damaged or scratched", NOT_ASSESSED] as const;
const PAINT_OPTIONS = ["Original paint", "Repainted", "Panel replaced", NOT_ASSESSED] as const;
const BRAKE_TYPE_OPTIONS = ["Disc", "Drum", NOT_ASSESSED] as const;

/** Observation choices per item type (photo slots have none). */
export function optionsFor(type: ItemType): readonly string[] {
  switch (type) {
    case "rim":
      return RIM_OPTIONS;
    case "paint":
      return PAINT_OPTIONS;
    case "brake_type":
      return BRAKE_TYPE_OPTIONS;
    case "photo":
      return [];
    default:
      return OBSERVATION_OPTIONS;
  }
}

export interface ValueField {
  key: string;
  label: string;
  unit?: string;
  placeholder: string;
}

/** Structured measurements stored in `InspectionItem.value` per item type. */
export const VALUE_FIELDS: Partial<Record<ItemType, ValueField[]>> = {
  tyre: [
    { key: "dotWeek", label: "DOT week", placeholder: "e.g. 23" },
    { key: "dotYear", label: "DOT year", placeholder: "e.g. 2023" },
    { key: "treadMm", label: "Tread depth", unit: "mm", placeholder: "e.g. 6.5" },
  ],
  paint: [{ key: "thicknessUm", label: "Paint thickness", unit: "µm", placeholder: "e.g. 120" }],
};

/** Every measurement key the autosave endpoint will accept. */
export const VALUE_KEYS = new Set(
  Object.values(VALUE_FIELDS).flatMap((fields) => fields.map((f) => f.key)),
);

function section(
  key: string,
  title: string,
  pairs: Array<[string, string] | [string, string, ItemType]>,
): ChecklistSection {
  return {
    key,
    title,
    items: pairs.map(([k, label, type]) => ({ key: `${key}.${k}`, label, type: type ?? "observation" })),
  };
}

export const INSPECTION_SECTIONS: ChecklistSection[] = [
  section("tyres", "Tyres", [
    ["fl", "Front-left tyre (FL)", "tyre"],
    ["fr", "Front-right tyre (FR)", "tyre"],
    ["rl", "Rear-left tyre (RL)", "tyre"],
    ["rr", "Rear-right tyre (RR)", "tyre"],
    ["spare", "Spare tyre (ST)", "tyre"],
  ]),
  section("rims", "Rims / wheels", [
    ["fl", "Front-left rim", "rim"],
    ["fr", "Front-right rim", "rim"],
    ["rl", "Rear-left rim", "rim"],
    ["rr", "Rear-right rim", "rim"],
    ["spare", "Spare wheel rim", "rim"],
  ]),
  section("brakes", "Braking system", [
    ["pads_fl", "Front-left brake pads"],
    ["disc_fl", "Front-left brake disc"],
    ["pads_fr", "Front-right brake pads"],
    ["disc_fr", "Front-right brake disc"],
    ["pads_rl", "Rear-left brake pads"],
    ["disc_rl", "Rear-left brake disc"],
    ["pads_rr", "Rear-right brake pads"],
    ["disc_rr", "Rear-right brake disc"],
    ["surface_fl", "Front-left brake disc surface"],
    ["surface_fr", "Front-right brake disc surface"],
    ["surface_rl", "Rear-left brake disc surface"],
    ["surface_rr", "Rear-right brake disc surface"],
    ["type_front", "Front brake type", "brake_type"],
    ["type_rear", "Rear brake type", "brake_type"],
  ]),
  section("suspension", "Suspension", [
    ["front_overall", "Front suspension overall"],
    ["front_right", "Front-right suspension"],
    ["front_left", "Front-left suspension"],
    ["rear_overall", "Rear suspension overall"],
    ["rear_right", "Rear-right suspension"],
    ["rear_left", "Rear-left suspension"],
    ["front_surface", "Front suspension surface damage"],
    ["rear_surface", "Rear suspension surface damage"],
  ]),
  section("trim", "Interior and exterior trim", [
    ["roof_lining", "Roof lining"],
    ["rear_view_mirror", "Rear-view mirror"],
    ["steering_upholstery", "Steering wheel upholstery"],
    ["seats_upholstery", "Seats upholstery"],
    ["gear_lever", "Gear lever"],
    ["trunk_lining", "Trunk lining"],
    ["armrest", "Armrest and side pockets"],
    ["dashboard", "Dashboard"],
    ["floor_mats", "Floor mats"],
    ["doors", "Doors"],
    ["front_windscreen", "Front windscreen"],
    ["rear_windscreen", "Rear windscreen"],
    ["side_windows", "Side windows"],
    ["hood", "Hood / bonnet"],
    ["trunk", "Trunk"],
    ["front_bumper", "Front bumper"],
    ["rear_bumper", "Rear bumper"],
  ]),
  section("electrical", "Electrical system and equipment", [
    ["gear_lever", "Gear lever"],
    ["doors", "Doors"],
    ["rear_windscreen", "Rear windscreen"],
    ["steering", "Steering"],
    ["key", "Key"],
    ["infotainment", "Infotainment system"],
    ["windows", "Windows operation"],
    ["seats_adjustment", "Seats adjustment"],
    ["door_lock", "Door lock"],
    ["ac", "A/C control and cooling"],
    ["console_buttons", "Centre console buttons"],
    ["cameras", "Cameras"],
    ["gauges", "Gauges"],
    ["mirrors", "Rear-view / side mirrors"],
    ["ac_grilles", "A/C grilles"],
    ["ignition", "Ignition system"],
    ["brake_lights", "Brake lights"],
    ["headlights", "Headlights"],
    ["fog_lights", "Fog lights"],
    ["reverse_lights", "Reverse lights"],
    ["plate_lights", "Number plate lights"],
    ["indicators", "Indicators and hazard lights"],
    ["wipers", "Wipers"],
    ["soft_close_doors", "Soft-closing doors"],
    ["sunroof", "Sunroof / moonroof"],
    ["interior_lights", "Interior lights"],
    ["cruise_control", "Cruise control"],
    ["horn", "Horn"],
    ["parking_sensors", "Parking sensors"],
  ]),
  section("paint", "Body and paint", [
    ["front_bumper", "Front bumper", "paint"],
    ["bonnet", "Bonnet", "paint"],
    ["fender_fr", "Front right fender", "paint"],
    ["fender_fl", "Front left fender", "paint"],
    ["door_fr", "Front right door", "paint"],
    ["door_fl", "Front left door", "paint"],
    ["door_rr", "Rear right door", "paint"],
    ["door_rl", "Rear left door", "paint"],
    ["fender_rr", "Rear right fender", "paint"],
    ["fender_rl", "Rear left fender", "paint"],
    ["boot", "Boot lid / tailgate", "paint"],
    ["rear_bumper", "Rear bumper", "paint"],
    ["roof", "Roof", "paint"],
  ]),
  section("engine", "Engine", [
    ["upper_cover", "Engine upper cover"],
    ["shield_cover", "Engine shield cover"],
    ["mounts", "Engine mounts"],
    ["bonnet_hinge", "Bonnet hinge and holder"],
    ["turbo", "Turbo / supercharger"],
    ["fender_liners", "Fender liners"],
    ["drive_belt", "Drive belt / pulleys"],
    ["idle", "Engine idle"],
    ["oil_cap", "Engine oil filler cap"],
    ["radiator", "Radiator"],
    ["oil_leaks", "Engine oil leaks"],
    ["oil_condition", "Engine oil condition"],
    ["coolant_condition", "Coolant condition"],
    ["coolant_cap", "Coolant cap"],
    ["hoses", "Hoses and pipes"],
    ["exhaust", "Exhaust system"],
    ["four_wheel_drive", "Four-wheel drive (4WD)"],
  ]),
  section("transmission", "Transmission and drivetrain", [
    ["fluid", "Transmission fluid level and condition"],
    ["leaks", "Transmission fluid leaks"],
    ["selector", "Gear selector"],
    ["noise", "Unusual noise"],
    ["shifting", "Gear shifting"],
    ["differential", "Differential"],
  ]),
  section("chassis", "Chassis and subframe", [
    ["core_support", "Core support"],
    ["frame_rail", "Frame rail"],
    ["wheel_house", "Wheel house"],
    ["fender_apron_right", "Right fender apron"],
    ["shock_tower", "Shock tower / shock mount"],
    ["radiator_side_support", "Radiator side support (side baffle)"],
    ["fender_apron_left", "Left fender apron"],
    ["hinge_pillar", "Front body hinge pillar"],
    ["front_floor", "Front floor board"],
    ["door_sill_left", "Left door sill"],
    ["b_pillar", "Centre pillar post (B-pillar)"],
    ["mid_floor", "Mid floor board"],
    ["quarter_panel", "Body quarter panel"],
    ["c_pillar", "C-pillar"],
    ["seat_frame", "Seat frame"],
    ["rear_floor", "Rear floor panel"],
    ["a_pillar_left", "Left A-pillar"],
    ["roof_panel", "Roof panel"],
    ["door_sill_right", "Right door sill"],
    ["a_pillar_right", "Right A-pillar"],
  ]),
  section("photos", "Photographic evidence and attachments", [
    ["exterior", "Exterior overview", "photo"],
    ["interior", "Interior overview", "photo"],
    ["engine_bay", "Engine bay", "photo"],
    ["undercarriage", "Undercarriage / chassis", "photo"],
    ["odometer", "Odometer", "photo"],
    ["scan", "Diagnostic scan evidence", "photo"],
  ]),
];

/** Section title of the photo-slot section (gallery, not recorded parameters). */
export const PHOTO_SECTION_TITLE = "Photographic evidence and attachments";

const TYPE_BY_KEY = new Map<string, ItemType>(
  INSPECTION_SECTIONS.flatMap((s) => s.items.map((it) => [it.key, it.type] as const)),
);

/**
 * Item type for a stored item key. Unknown (legacy) keys are treated as plain
 * observations, except the old "photos.*" gallery slots.
 */
export function itemType(itemKey: string): ItemType {
  return TYPE_BY_KEY.get(itemKey) ?? (itemKey.startsWith("photos.") ? "photo" : "observation");
}

/** Photo slots are evidence, not recorded parameters, so they don't count towards progress. */
export function isRecordable(itemKey: string): boolean {
  return itemType(itemKey) !== "photo";
}

/** Number of recordable parameters in the template (sections 02–11). */
export const TOTAL_ITEMS = INSPECTION_SECTIONS.reduce(
  (n, s) => n + s.items.filter((it) => it.type !== "photo").length,
  0,
);

/** Flattens the template into ordered rows for materialising a job's items. */
export function flattenChecklist(): Array<{
  section: string;
  itemKey: string;
  label: string;
  order: number;
}> {
  const rows: Array<{ section: string; itemKey: string; label: string; order: number }> = [];
  let order = 0;
  for (const s of INSPECTION_SECTIONS) {
    for (const it of s.items) {
      rows.push({ section: s.title, itemKey: it.key, label: it.label, order: order++ });
    }
  }
  return rows;
}

/* ── Wording helpers (shared by inspector app and customer report) ─────── */

/** Pre-October-2026 jobs rated points Good/Fair/Poor/Fail/N-A; reword neutrally. */
const LEGACY_CONDITIONS: Record<string, string> = {
  Good: "No obvious issue observed",
  Fair: "Wear or damage observed",
  Poor: "Wear or damage observed",
  Fail: "Wear or damage observed",
  "N/A": NOT_ASSESSED,
};

export function isLegacyCondition(condition: string | null | undefined): boolean {
  return !!condition && condition in LEGACY_CONDITIONS;
}

export function neutralCondition(condition: string | null | undefined): string | null {
  if (!condition) return null;
  return LEGACY_CONDITIONS[condition] ?? condition;
}

export type ItemValue = Record<string, string>;

/** Human-readable measurement text, e.g. "DOT 23/2023 · Tread 6.5 mm". */
export function formatValue(type: ItemType, value: ItemValue | null | undefined): string | null {
  if (!value) return null;
  if (type === "tyre") {
    const parts: string[] = [];
    const dot = [value.dotWeek, value.dotYear].filter(Boolean).join("/");
    if (dot) parts.push(`DOT ${dot}`);
    if (value.treadMm) parts.push(`Tread ${value.treadMm} mm`);
    return parts.length ? parts.join(" · ") : null;
  }
  if (type === "paint") {
    return value.thicknessUm ? `${value.thicknessUm} µm` : null;
  }
  return null;
}

/**
 * The "Observation / Record" cell for the customer report: the neutral
 * observation plus any measurement, or the standard not-recorded wording.
 */
export function describeObservation(
  itemKey: string,
  condition: string | null | undefined,
  value: ItemValue | null | undefined,
): string {
  const type = itemType(itemKey);
  const obs = neutralCondition(condition);
  const measured = formatValue(type, value);
  if (obs && measured) return obs === NOT_ASSESSED ? obs : `${obs} — ${measured}`;
  return obs ?? measured ?? "Not recorded";
}
