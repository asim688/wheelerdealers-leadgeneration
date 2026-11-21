/** Partner "Service Type" shown at registration → how it maps onto the partner account. */
export const ACCESSORIES_MARK = "accessories";

export const SERVICE_TYPES = [
  { id: "inspection", label: "Car Inspections", partnerType: "inspection", careServices: [] as string[] },
  { id: "towing", label: "Towing", partnerType: "care", careServices: ["scheduled_tow", "emergency_tow"] },
  { id: "battery", label: "Battery", partnerType: "care", careServices: ["jump_start"] },
  { id: "fuel", label: "Fuel", partnerType: "care", careServices: ["fuel_delivery"] },
  { id: "accessories", label: "Accessories", partnerType: "care", careServices: [ACCESSORIES_MARK] },
] as const;

export type ServiceTypeId = (typeof SERVICE_TYPES)[number]["id"];

export const serviceTypeById = (id: string) => SERVICE_TYPES.find((s) => s.id === id) ?? SERVICE_TYPES[0];
