import { fils } from "@/lib/care";

const CATEGORIES = ["battery", "oil", "accessory"];

/** Validates admin product input. `create` requires name, category and price. Prices arrive in AED. */
export function productInput(b: unknown, create: boolean): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  if (!b || typeof b !== "object") return { ok: false, error: "Invalid request" };
  const v = b as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const text = (k: string, max: number) => {
    if (v[k] === undefined) return;
    const s = (v[k] ?? "").toString().trim();
    data[k] = s ? s.slice(0, max) : null;
  };
  const money = (k: string, target: string, required: boolean): string | null => {
    if (v[k] === undefined || v[k] === "" || v[k] === null) {
      if (required) return "Enter the price (AED, VAT inclusive).";
      if (v[k] !== undefined) data[target] = null;
      return null;
    }
    const n = Number(v[k]);
    if (!Number.isFinite(n) || n < 0 || n > 100_000) return `Invalid amount for ${k}.`;
    data[target] = fils(n);
    return null;
  };
  if (v.category !== undefined) {
    if (!CATEGORIES.includes(String(v.category))) return { ok: false, error: "Choose a category." };
    data.category = String(v.category);
  } else if (create) return { ok: false, error: "Choose a category." };
  text("name", 160);
  if (create && !data.name) return { ok: false, error: "Enter the product name." };
  text("brand", 80);
  text("description", 600);
  text("imageUrl", 500);
  text("compatibility", 2000);
  for (const [k, t, req] of [["price", "priceFils", create], ["install", "installFils", false], ["delivery", "deliveryFils", false]] as const) {
    const err = money(k, t, req);
    if (err) return { ok: false, error: err };
  }
  if (typeof v.active === "boolean") data.active = v.active;
  if (typeof v.inStock === "boolean") data.inStock = v.inStock;
  return { ok: true, data };
}
