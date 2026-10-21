/**
 * ----------------------------------------------------------------------------
 * Vehicle inspection checklist template.
 * ----------------------------------------------------------------------------
 * The canonical list of inspection points, grouped into the nine sections the
 * client specified. When an inspector starts a job we materialise these into
 * per-job `InspectionItem` rows (each gets a stable id) so answers and photos
 * can attach to individual points. Edit freely — keys must stay unique.
 */

export interface ChecklistItem {
  /** Stable unique key, e.g. "exterior.front_bumper". */
  key: string;
  label: string;
}

export interface ChecklistSection {
  key: string;
  title: string;
  items: ChecklistItem[];
}

/** Condition ratings offered for each inspection point. */
export const CONDITION_OPTIONS = ["Good", "Fair", "Poor", "Fail", "N/A"] as const;
export type ConditionOption = (typeof CONDITION_OPTIONS)[number];

function section(key: string, title: string, pairs: [string, string][]): ChecklistSection {
  return {
    key,
    title,
    items: pairs.map(([k, label]) => ({ key: `${key}.${k}`, label })),
  };
}

export const INSPECTION_SECTIONS: ChecklistSection[] = [
  section("exterior", "Exterior", [
    ["front_bumper", "Front bumper"],
    ["rear_bumper", "Rear bumper"],
    ["bonnet", "Bonnet / hood"],
    ["roof", "Roof"],
    ["boot_lid", "Boot / tailgate"],
    ["fender_fl", "Front-left fender"],
    ["fender_fr", "Front-right fender"],
    ["fender_rl", "Rear-left fender"],
    ["fender_rr", "Rear-right fender"],
    ["door_fl", "Front-left door"],
    ["door_fr", "Front-right door"],
    ["door_rl", "Rear-left door"],
    ["door_rr", "Rear-right door"],
    ["windshield", "Front windshield"],
    ["rear_windshield", "Rear windshield"],
    ["windows_left", "Left windows"],
    ["windows_right", "Right windows"],
    ["headlight_left", "Left headlight"],
    ["headlight_right", "Right headlight"],
    ["taillight_left", "Left taillight"],
    ["taillight_right", "Right taillight"],
    ["fog_lights", "Fog lights"],
    ["side_mirrors", "Side mirrors"],
    ["exterior_trim", "Exterior trim & mouldings"],
    ["number_plates", "Number plates"],
    ["wiper_blades", "Wiper blades"],
    ["paint_condition", "Overall paint condition"],
    ["panel_gaps", "Panel gaps & alignment"],
  ]),
  section("interior", "Interior", [
    ["dashboard", "Dashboard"],
    ["steering_wheel", "Steering wheel"],
    ["driver_seat", "Driver seat"],
    ["passenger_seat", "Passenger seat"],
    ["rear_seats", "Rear seats"],
    ["seatbelts", "Seatbelts"],
    ["headliner", "Headliner"],
    ["carpets", "Carpets & mats"],
    ["door_panels", "Door panels"],
    ["center_console", "Center console"],
    ["glovebox", "Glovebox"],
    ["ac_cooling", "A/C cooling"],
    ["ac_heating", "Heater"],
    ["infotainment", "Infotainment / display"],
    ["speakers", "Speakers / audio"],
    ["instrument_cluster", "Instrument cluster"],
    ["interior_lights", "Interior lights"],
    ["sunroof", "Sunroof / moonroof"],
    ["cup_holders", "Cup holders & storage"],
    ["boot_interior", "Boot interior & tools"],
    ["rear_vents", "Rear A/C vents"],
    ["cabin_odor", "Cabin odour / cleanliness"],
  ]),
  section("mechanical", "Mechanical", [
    ["engine_start", "Engine start"],
    ["engine_idle", "Engine idle"],
    ["engine_noise", "Engine noise"],
    ["oil_level", "Engine oil level"],
    ["oil_condition", "Engine oil condition"],
    ["coolant_level", "Coolant level"],
    ["coolant_leaks", "Coolant leaks"],
    ["brake_fluid", "Brake fluid"],
    ["power_steering_fluid", "Power steering fluid"],
    ["transmission_fluid", "Transmission fluid"],
    ["transmission_shifting", "Transmission shifting"],
    ["drive_belts", "Drive belts"],
    ["hoses", "Hoses"],
    ["radiator", "Radiator"],
    ["water_pump", "Water pump"],
    ["engine_mounts", "Engine mounts"],
    ["oil_leaks", "Oil leaks"],
    ["exhaust_smoke", "Exhaust smoke"],
    ["timing_belt_chain", "Timing belt / chain"],
    ["air_filter", "Air filter"],
    ["throttle_body", "Throttle body"],
    ["turbo", "Turbo / supercharger"],
    ["clutch", "Clutch (if manual)"],
    ["engine_bay", "Engine bay cleanliness"],
  ]),
  section("tyres_brakes", "Tyres & Brakes", [
    ["tyre_fl_tread", "Front-left tyre tread"],
    ["tyre_fr_tread", "Front-right tyre tread"],
    ["tyre_rl_tread", "Rear-left tyre tread"],
    ["tyre_rr_tread", "Rear-right tyre tread"],
    ["tyre_fl_condition", "Front-left tyre condition"],
    ["tyre_fr_condition", "Front-right tyre condition"],
    ["tyre_rl_condition", "Rear-left tyre condition"],
    ["tyre_rr_condition", "Rear-right tyre condition"],
    ["spare_tyre", "Spare tyre"],
    ["brake_pads_front", "Front brake pads"],
    ["brake_pads_rear", "Rear brake pads"],
    ["brake_discs_front", "Front brake discs"],
    ["brake_discs_rear", "Rear brake discs"],
    ["handbrake", "Handbrake / parking brake"],
    ["abs", "ABS operation"],
    ["wheel_alignment", "Wheel alignment"],
  ]),
  section("underbody", "Underbody", [
    ["chassis_frame", "Chassis / frame"],
    ["subframe", "Subframe"],
    ["front_suspension", "Front suspension"],
    ["rear_suspension", "Rear suspension"],
    ["shock_absorbers", "Shock absorbers"],
    ["control_arms", "Control arms"],
    ["ball_joints", "Ball joints"],
    ["steering_rack", "Steering rack"],
    ["cv_joints", "CV joints & boots"],
    ["exhaust_system", "Exhaust system"],
    ["fuel_tank", "Fuel tank & lines"],
    ["underbody_corrosion", "Underbody corrosion"],
    ["engine_undertray", "Engine undertray"],
    ["differential", "Differential / axles"],
  ]),
  section("electrical", "Electrical", [
    ["battery_health", "Battery health"],
    ["battery_terminals", "Battery terminals"],
    ["alternator", "Alternator charging"],
    ["starter", "Starter motor"],
    ["headlights_op", "Headlights operation"],
    ["indicators", "Indicators"],
    ["hazard_lights", "Hazard lights"],
    ["brake_lights", "Brake lights"],
    ["reverse_lights", "Reverse lights"],
    ["interior_lighting", "Interior lighting"],
    ["power_windows", "Power windows operation"],
    ["central_locking", "Central locking"],
    ["wipers_front", "Front wipers"],
    ["wipers_rear", "Rear wiper"],
    ["washer_jets", "Washer jets"],
    ["warning_lights", "Sensors & warning lights"],
    ["reverse_camera", "Reverse camera / sensors"],
    ["key_fob", "Key fob / remote"],
  ]),
  section("road_test", "Road Test", [
    ["cold_start", "Cold start"],
    ["acceleration", "Acceleration"],
    ["engine_power", "Engine power"],
    ["gear_shifts", "Gear shifts"],
    ["clutch_engagement", "Clutch engagement"],
    ["braking", "Braking performance"],
    ["steering_response", "Steering response"],
    ["steering_noise", "Steering noise"],
    ["suspension_ride", "Suspension ride"],
    ["wheel_bearing", "Wheel bearing noise"],
    ["cruise_control", "Cruise control"],
    ["cabin_noise", "Cabin noise (NVH)"],
    ["vibrations", "Vibrations"],
    ["ac_drive", "A/C during drive"],
    ["warnings_drive", "Warning lights during drive"],
    ["parking_brake_hold", "Parking brake hold"],
  ]),
  section("photos", "Photos", [
    ["front", "Front photo"],
    ["rear", "Rear photo"],
    ["left", "Left side photo"],
    ["right", "Right side photo"],
    ["engine_bay", "Engine bay photo"],
    ["odometer", "Odometer photo"],
  ]),
  section("summary", "Summary", [
    ["overall_condition", "Overall condition"],
    ["major_findings", "Major findings"],
    ["recommended_repairs", "Recommended repairs"],
    ["inspector_notes", "Inspector notes"],
  ]),
];

/** Total number of inspection points across all sections. */
export const TOTAL_ITEMS = INSPECTION_SECTIONS.reduce((n, s) => n + s.items.length, 0);

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
