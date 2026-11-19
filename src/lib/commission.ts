/**
 * Commission maths (Phase 1). Pure functions, integer fils only.
 *
 *   gross  = what the customer paid, 5% VAT included
 *   vat    = gross × 5/105   (extracted first)
 *   net    = gross − vat
 *   percentage: commission = net × rate        fixed: commission = min(net, fixed AED)
 *   partner = net − commission                 (the residual, so the three always reconcile)
 *
 * Example: gross 420.00 → VAT 20.00 → net 400.00; 15% → commission 60.00, partner 340.00;
 * fixed 50.00 → commission 50.00, partner 350.00.
 */

export const VAT_RATE_PERCENT = 5;

export type CommissionType = "percentage" | "fixed";

export interface CommissionSetting {
  type: CommissionType;
  /** percentage → basis points (1500 = 15.00%); fixed → fils (5000 = AED 50.00) */
  value: number;
}

export interface Split {
  grossFils: number;
  vatFils: number;
  netFils: number;
  commissionFils: number;
  partnerFils: number;
}

/** Integer division rounded half up (for non-negative numbers). */
function divRound(numerator: number, denominator: number): number {
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

export const aedToFils = (aed: number): number => Math.round(aed * 100);

export function vatFromGross(grossFils: number): { vatFils: number; netFils: number } {
  const vatFils = divRound(grossFils * VAT_RATE_PERCENT, 100 + VAT_RATE_PERCENT);
  return { vatFils, netFils: grossFils - vatFils };
}

export function isValidSetting(s: CommissionSetting): boolean {
  if (!Number.isInteger(s.value) || s.value < 0) return false;
  if (s.type === "percentage") return s.value <= 10000;
  return s.type === "fixed";
}

/** Returns the split, or an error when the setting would leave nothing for the partner. */
export function computeSplit(grossFils: number, setting: CommissionSetting): { ok: true; split: Split } | { ok: false; error: string } {
  if (!Number.isInteger(grossFils) || grossFils <= 0) return { ok: false, error: "Invalid customer amount." };
  if (!isValidSetting(setting)) return { ok: false, error: "Invalid commission setting." };

  const { vatFils, netFils } = vatFromGross(grossFils);
  const commissionFils =
    setting.type === "percentage" ? divRound(netFils * setting.value, 10000) : Math.min(netFils, setting.value);
  const partnerFils = netFils - commissionFils;
  if (partnerFils <= 0) {
    return { ok: false, error: "This commission leaves nothing for the inspection company. Lower it." };
  }
  return { ok: true, split: { grossFils, vatFils, netFils, commissionFils, partnerFils } };
}

/** "15%" or "AED 50.00" */
export function describeSetting(type: string | null | undefined, value: number | null | undefined): string {
  if (!type || value == null) return "—";
  return type === "percentage" ? `${(value / 100).toFixed(value % 100 === 0 ? 0 : 2)}%` : `AED ${(value / 100).toFixed(2)}`;
}

export const fmtAed = (fils: number | null | undefined): string =>
  fils == null ? "—" : (fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Hours between "report sent to customer" and the payout becoming due. */
export const PAYOUT_DELAY_HOURS = 3;
