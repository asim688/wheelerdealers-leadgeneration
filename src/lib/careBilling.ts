import { getBaseUrl } from "@/lib/inspection";
import { CARE_SERVICES } from "@/lib/care";
import type { TamaraJob } from "@/lib/tamara";

/** Tamara order_reference_id for a care payment attempt: care_<requestId>_<attempt>. */
export const careTamaraRef = (requestId: string, attempt: string) => `care_${requestId}_${attempt}`;

/** Parses care_<requestId>_<attempt> back to the request id (null for inspection orders). */
export const careRequestIdFromRef = (ref: string | null | undefined): string | null => {
  const m = /^care_([a-z0-9]+)_[a-z0-9]+$/i.exec(ref ?? "");
  return m ? m[1] : null;
};

/** URL the gateways send the customer back to after paying for a towing offer. */
export const careReturnUrl = (requestId: string, result: "paid" | "cancelled", provider: "stripe" | "tamara") =>
  `${getBaseUrl()}/care/requests/${requestId}?${result}=1&provider=${provider}${provider === "stripe" && result === "paid" ? "&session_id={CHECKOUT_SESSION_ID}" : ""}`;

/** Shapes a care request + chosen bid into the Tamara order payload. */
export function careTamaraJob(
  r: { id: string; code: string; service: string; customerName: string; customerEmail: string | null; customerMobile: string; pickupAddress: string; pickupEmirate: string | null; make: string | null; model: string | null; year: number | null; destAddress: string | null },
  bid: { priceFils: number; partnerName: string },
  reference: string,
): TamaraJob {
  const label = CARE_SERVICES[r.service as keyof typeof CARE_SERVICES]?.label ?? "Vehicle towing";
  return {
    id: reference,
    jobCode: r.code,
    fee: bid.priceFils / 100,
    currency: "AED",
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    customerMobile: r.customerMobile,
    address: r.pickupAddress,
    city: r.pickupEmirate,
    emirate: r.pickupEmirate,
    make: r.make,
    model: r.model,
    year: r.year,
    itemName: `${label} ${r.code} — ${bid.partnerName}`,
    description: `The Wheeler Dealers Care: ${label} ${r.code}${r.destAddress ? ` to ${r.destAddress}` : ""}`,
    returnUrls: {
      success: careReturnUrl(r.id, "paid", "tamara"),
      failure: careReturnUrl(r.id, "cancelled", "tamara"),
      cancel: careReturnUrl(r.id, "cancelled", "tamara"),
    },
  };
}
