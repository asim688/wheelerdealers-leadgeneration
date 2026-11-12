"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Shared pieces for the Super Admin company screens (companies list and the company page). */

export interface CompanyActivityEvent {
  id: string;
  action: string;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  ip: string | null;
  note: string | null;
  createdAt: string;
}

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  account_manager: "Account Manager",
  company: "Company",
};

export const ACTION_LABEL: Record<string, string> = {
  registered: "Registered",
  approved: "Approved",
  reinstated: "Reinstated",
  suspended: "Suspended",
  pending: "Set to pending",
  activated: "Login activated",
  deactivated: "Login deactivated",
};

const ACTION_STYLE: Record<string, string> = {
  registered: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  reinstated: "bg-green-100 text-green-700",
  suspended: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-700",
  activated: "bg-green-50 text-green-700",
  deactivated: "bg-neutral-100 text-neutral-600",
};

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export interface AdminCompany {
  id: string;
  name: string;
  details: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  emirate: string | null;
  lat: number | null;
  lng: number | null;
  pocName: string | null;
  pocMobile: string | null;
  pocEmail: string | null;
  tradeLicense: string | null;
  areas: string | null;
  services: string | null;
  bankAccountTitle: string | null;
  bankAccountNumber: string | null;
  bankIban: string | null;
  bankName: string | null;
  bankBranch: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  pocEmailVerifiedAt: string | null;
  pocMobileVerifiedAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  verifiedByEmail: string | null;
  verifiedByRole: string | null;
  missingDocs: string[];
  payoutGaps: string[];
  approvalStatus: string;
  active: boolean;
  inspectorCount: number;
  jobsAssigned: number;
  jobsCompleted: number;
  documents: Array<{ id: string; kind: string; label: string | null; fileName: string; sizeBytes: number; createdAt: string }>;
  createdAt: string;
}

export const DOC_KIND_LABEL: Record<string, string> = {
  trade_license: "Trade License",
  vat_certificate: "VAT Certificate",
  iban_letter: "Bank IBAN Letter",
};

export function fmtBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}


/* ── Full registration record for one company (what the company filled in) ─ */

export function CompanyDetails({ company: c, activity }: { company: AdminCompany; activity?: CompanyActivityEvent[] }) {
  const mapUrl =
    c.lat != null && c.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
      : [c.address, c.city, c.emirate].some(Boolean)
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.address, c.city, c.emirate].filter(Boolean).join(", "))}`
        : null;
  const registered = new Date(c.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const hasBank = [c.bankAccountTitle, c.bankAccountNumber, c.bankIban, c.bankName, c.bankBranch].some(Boolean);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <DetailGroup title="Company">
        <DetailRow k="Company name" v={c.name} />
        <DetailRow k="Company details" v={c.details} />
        <DetailRow k="Company email" v={c.email} href={`mailto:${c.email}`} verifiedAt={c.emailVerifiedAt} />
        <DetailRow k="Company mobile" v={c.phone} href={c.phone ? `tel:${c.phone}` : undefined} verifiedAt={c.phoneVerifiedAt} />
        <DetailRow k="Trade license no." v={c.tradeLicense} />
        <DetailRow k="Services" v={c.services} />
        <DetailRow k="Registered" v={registered} />
        <DetailRow k="Account status" v={`${c.approvalStatus}${c.active ? "" : " · login inactive"}`} />
      </DetailGroup>

      <DetailGroup title="Company documents">
        {c.documents.length === 0 ? (
          <p className="text-xs text-amber-700">No documents uploaded.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {c.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-neutral-800">{DOC_KIND_LABEL[d.kind] ?? d.label ?? "Document"}</p>
                  <p className="truncate text-[11px] text-neutral-500">{d.fileName} · {fmtBytes(d.sizeBytes)}</p>
                </div>
                <a
                  href={`/api/admin/companies/${c.id}/documents/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        )}
        {c.missingDocs.map((m) => (
          <p key={m} className="mt-1 text-[11px] text-amber-700">{m} missing</p>
        ))}
      </DetailGroup>

      <DetailGroup title="Location">
        <DetailRow k="Address" v={c.address} />
        <DetailRow k="City" v={c.city} />
        <DetailRow k="Emirate" v={c.emirate} />
        <DetailRow k="Service areas" v={c.areas} />
        <DetailRow k="Map pin" v={c.lat != null && c.lng != null ? `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` : null} href={mapUrl ?? undefined} />
      </DetailGroup>

      <DetailGroup title="Point of Contact (gets job alerts)">
        <DetailRow k="PoC name" v={c.pocName} />
        <DetailRow k="PoC mobile (WhatsApp)" v={c.pocMobile} href={c.pocMobile ? `https://wa.me/${c.pocMobile.replace(/\D/g, "")}` : undefined} verifiedAt={c.pocMobileVerifiedAt} />
        <DetailRow k="PoC email" v={c.pocEmail} href={c.pocEmail ? `mailto:${c.pocEmail}` : undefined} verifiedAt={c.pocEmailVerifiedAt} />
      </DetailGroup>

      <DetailGroup title="Payout details">
        {c.payoutGaps.length > 0 && (
          <p className="mb-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
            Can&apos;t accept new jobs until complete. Missing: {c.payoutGaps.join(", ")}.
          </p>
        )}
        {hasBank ? (
          <>
            <DetailRow k="Account title" v={c.bankAccountTitle} />
            <DetailRow k="Account number" v={c.bankAccountNumber} mono />
            <DetailRow k="IBAN" v={c.bankIban} mono />
            <DetailRow k="Bank name" v={c.bankName} />
            <DetailRow k="Bank branch" v={c.bankBranch} />
          </>
        ) : (
          <p className="text-xs text-neutral-500">Not provided — commissions cannot be settled until the company adds bank details.</p>
        )}
      </DetailGroup>

      <DetailGroup title="Registration verified by">
        {c.verifiedAt ? (
          <>
            <DetailRow k="Verified by" v={c.verifiedByName} />
            <DetailRow k="Role" v={c.verifiedByRole ? ROLE_LABEL[c.verifiedByRole] ?? c.verifiedByRole : null} />
            <DetailRow k="Signed in as" v={c.verifiedByEmail} />
            <DetailRow k="Verified on" v={fmtDateTime(c.verifiedAt)} />
          </>
        ) : c.approvalStatus === "pending" ? (
          <p className="text-xs text-amber-700">Waiting for verification. The name of the person who approves it will be recorded here.</p>
        ) : (
          <p className="text-xs text-neutral-500">Not recorded — this company was approved before verifier tracking began.</p>
        )}
      </DetailGroup>

      <DetailGroup title="Marketplace activity">
        <DetailRow k="Inspectors" v={String(c.inspectorCount)} />
        <DetailRow k="Jobs assigned" v={String(c.jobsAssigned)} />
        <DetailRow k="Jobs completed" v={String(c.jobsCompleted)} />
      </DetailGroup>
      {activity && (
        <div className="md:col-span-2">
          <DetailGroup title="Track record">
            {activity.length === 0 ? (
              <p className="text-xs text-neutral-500">No activity recorded yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {activity.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-xs">
                    <span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ACTION_STYLE[a.action] ?? "bg-neutral-100 text-neutral-600"}`}>
                        {ACTION_LABEL[a.action] ?? a.action}
                      </span>
                      <span className="ml-2 font-medium text-neutral-800">{a.actorName || "—"}</span>
                      {a.actorRole && <span className="ml-1 text-neutral-500">({ROLE_LABEL[a.actorRole] ?? a.actorRole})</span>}
                      {a.actorEmail && <span className="ml-2 text-neutral-400">{a.actorEmail}</span>}
                      {a.ip && <span className="ml-2 font-mono text-[10px] text-neutral-400">IP {a.ip}</span>}
                      {a.note && <span className="mt-0.5 block text-neutral-600">“{a.note}”</span>}
                    </span>
                    <span className="text-neutral-500">{fmtDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </DetailGroup>
        </div>
      )}
    </div>
  );
}

export function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
      {children}
    </div>
  );
}

export function DetailRow({
  k,
  v,
  href,
  mono = false,
  verifiedAt,
}: {
  k: string;
  v: string | null | undefined;
  href?: string;
  mono?: boolean;
  /** When provided (even null), shows a Verified / Not verified badge. */
  verifiedAt?: string | null;
}) {
  const text = v && v.trim() ? v : null;
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-1 text-xs">
      <span className="text-neutral-500">
        {k}
        {verifiedAt !== undefined && text && (
          verifiedAt ? (
            <span className="ml-1 rounded bg-green-100 px-1 text-[10px] font-semibold text-green-700" title={`Verified ${new Date(verifiedAt).toLocaleString("en-GB")}`}>✓ verified</span>
          ) : (
            <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-700">not verified</span>
          )
        )}
      </span>
      {text ? (
        href ? (
          <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className={`break-words text-red-600 hover:underline ${mono ? "font-mono" : ""}`}>
            {text}
          </a>
        ) : (
          <span className={`break-words text-neutral-800 ${mono ? "font-mono" : ""}`}>{text}</span>
        )
      ) : (
        <span className="text-neutral-400">—</span>
      )}
    </div>
  );
}


/* ── Approve / Suspend / Reinstate with the verifier's name recorded ───────── */

const NAME_KEY = "wd_verifier_name";

type Decision = "approve" | "suspend" | "reinstate";

const DECISION_COPY: Record<Decision, { title: string; confirm: string; tone: string; body: string; nameRequired: boolean }> = {
  approve: {
    title: "Approve registration",
    confirm: "Approve company",
    tone: "bg-green-600 hover:bg-green-700",
    body: "Confirm you have checked this company's details and documents. Your name, sign-in and the time are saved as the verification record.",
    nameRequired: true,
  },
  suspend: {
    title: "Suspend company",
    confirm: "Suspend",
    tone: "bg-red-600 hover:bg-red-700",
    body: "The company will no longer be able to accept jobs. The decision is saved to its track record.",
    nameRequired: false,
  },
  reinstate: {
    title: "Reinstate company",
    confirm: "Reinstate",
    tone: "bg-green-600 hover:bg-green-700",
    body: "The company can accept jobs again. The decision is saved to its track record.",
    nameRequired: false,
  },
};

export function CompanyActionButtons({
  company: c,
  onPatch,
}: {
  company: Pick<AdminCompany, "id" | "name" | "approvalStatus" | "active">;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (decision) setName(localStorage.getItem(NAME_KEY) ?? "");
  }, [decision]);

  const copy = decision ? DECISION_COPY[decision] : null;

  async function confirm() {
    if (!decision) return;
    const approvalStatus = decision === "suspend" ? "suspended" : "approved";
    setBusy(true);
    try {
      if (name.trim()) localStorage.setItem(NAME_KEY, name.trim());
      await onPatch({ approvalStatus, verifierName: name.trim(), note: note.trim() });
      setDecision(null);
      setNote("");
    } finally {
      setBusy(false);
    }
  }

  const open = (d: Decision) => {
    setNote("");
    setDecision(d);
  };

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {c.approvalStatus === "pending" && (
          <button onClick={() => open("approve")} className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-green-700">
            Approve
          </button>
        )}
        {c.approvalStatus === "approved" && (
          <button onClick={() => open("suspend")} className="rounded-md border border-red-300 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50">
            Suspend
          </button>
        )}
        {c.approvalStatus === "suspended" && (
          <button onClick={() => open("reinstate")} className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700">
            Reinstate
          </button>
        )}
        <button
          onClick={() => void onPatch({ active: !c.active })}
          className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${
            c.active ? "border-neutral-300 text-neutral-600 hover:bg-neutral-100" : "border-green-300 bg-green-50 text-green-700"
          }`}
        >
          {c.active ? "Deactivate" : "Activate"}
        </button>
      </div>

      {decision && copy && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4" role="dialog" aria-modal="true" onClick={() => !busy && setDecision(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-neutral-900">{copy.title}</h3>
            <p className="mt-0.5 text-sm font-medium text-neutral-700">{c.name}</p>
            <p className="mt-2 text-sm text-neutral-500">{copy.body}</p>
            <label className="mt-4 block text-sm font-medium text-neutral-700">
              Your name{copy.nameRequired ? " *" : ""}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name of the person verifying"
                autoFocus
                className="mt-1.5 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-neutral-700">
              Note <span className="font-normal text-neutral-400">(optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="e.g. Documents checked, called the PoC"
                className="mt-1.5 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDecision(null)} disabled={busy} className="rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={busy || (copy.nameRequired && name.trim().length < 2)}
                className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${copy.tone}`}
              >
                {busy ? "Saving…" : copy.confirm}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
