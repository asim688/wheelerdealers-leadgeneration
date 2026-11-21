"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SERVICE_TYPES, serviceTypeById, type ServiceTypeId } from "@/lib/serviceType";
import Link from "next/link";

/**
 * User Management (Super Admin): every login on the platform in one place, and the Admin can create a user
 * for any role. Customers are not listed — they sign themselves up with their mobile number.
 */

type Role = "admin" | "account_manager" | "company" | "inspector";

interface User {
  id: string;
  role: Role;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  status: string;
  detail: string;
  companyId?: string | null;
  createdAt: string;
}

const ROLES: Array<{ key: Role; label: string; plural: string; hint: string }> = [
  { key: "admin", label: "Admin", plural: "Admins", hint: "Staff with Super Admin access: payments, payouts, refunds, commission, users." },
  { key: "account_manager", label: "Account Manager", plural: "Account Managers", hint: "Verifies reports of the companies assigned to them and sets those companies' commission." },
  { key: "company", label: "Inspection Company", plural: "Inspection Companies", hint: "A partner that accepts jobs. Created as approved; it still needs payout details and a commission before it can accept jobs." },
  { key: "inspector", label: "Inspector", plural: "Inspectors", hint: "Belongs to one inspection company and runs the jobs assigned to them." },
];

const ROLE_STYLE: Record<Role, string> = {
  admin: "bg-neutral-900 text-white",
  account_manager: "bg-purple-100 text-purple-700",
  company: "bg-blue-100 text-blue-700",
  inspector: "bg-amber-100 text-amber-800",
};

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  approved: "bg-green-100 text-green-700",
  unverified: "bg-amber-100 text-amber-700",
  pending: "bg-amber-100 text-amber-700",
  inactive: "bg-neutral-100 text-neutral-500",
  suspended: "bg-red-100 text-red-700",
};

const input = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500";

export default function AdminUsersPanel({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | "">("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (role) p.set("role", role);
      if (dq) p.set("q", dq);
      const res = await fetch(`/api/admin/users?${p.toString()}`);
      if (res.status === 401) return onUnauthorized();
      if (res.ok) {
        const d = await res.json();
        setUsers(d.users);
        setCompanies(d.companies);
      }
    } finally {
      setLoading(false);
    }
  }, [role, dq, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(u: User, body: Record<string, unknown>) {
    setError("");
    setNotice("");
    const res = await fetch(`/api/admin/users/${u.role}/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 401) return onUnauthorized();
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || "Could not update this user.");
    if (body.password) setNotice(`Password changed for ${u.name}. Share it with them yourself.`);
    await load();
  }

  const roleLabel = (r: Role) => ROLES.find((x) => x.key === r)?.label ?? r;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">User Management</h1>
          <p className="text-xs text-neutral-500">All logins on the platform. Create a user for any role, reset passwords, or switch a login on or off. Customers sign up themselves.</p>
        </div>
        <button onClick={() => setCreating(true)} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">+ Create user</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[{ key: "" as const, plural: "All" }, ...ROLES].map((r) => (
          <button
            key={r.key || "all"}
            onClick={() => setRole(r.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${role === r.key ? "bg-red-600 text-white" : "border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"}`}
          >
            {r.plural}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, mobile…" className="ml-auto min-w-[220px] rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500" />
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Email / mobile</th>
              <th className="px-4 py-3">Details</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">No users match.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={`${u.role}-${u.id}`} className="border-b border-neutral-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {u.role === "company" ? <Link href={`/admin/inspections/companies/${u.id}`} className="hover:text-red-600 hover:underline">{u.name}</Link> : u.name}
                  </td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_STYLE[u.role]}`}>{roleLabel(u.role)}</span></td>
                  <td className="px-4 py-3 text-neutral-700"><p>{u.email}</p>{u.phone && <p className="text-xs text-neutral-400">{u.phone}</p>}</td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{u.detail}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[u.status] ?? "bg-neutral-100 text-neutral-600"}`}>{u.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => {
                          const pw = window.prompt(`New password for ${u.name} (min 8 characters):`);
                          if (pw) void patch(u, { password: pw });
                        }}
                        className="rounded-md border border-neutral-300 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        Reset password
                      </button>
                      <button
                        onClick={() => void patch(u, { active: !u.active })}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${u.active ? "border-neutral-300 text-neutral-600 hover:bg-neutral-100" : "border-green-300 bg-green-50 text-green-700"}`}
                      >
                        {u.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateDialog
          companies={companies}
          defaultRole={role || "admin"}
          onClose={() => setCreating(false)}
          onCreated={async (msg) => {
            setCreating(false);
            setNotice(msg);
            await load();
          }}
          onUnauthorized={onUnauthorized}
        />
      )}
    </div>
  );
}

const ALL_EMIRATES = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"];

export function CreateDialog({
  companies,
  defaultRole,
  defaultPartnerType = "inspection",
  onClose,
  onCreated,
  onUnauthorized,
}: {
  companies: Array<{ id: string; name: string }>;
  defaultRole: Role;
  defaultPartnerType?: "inspection" | "care";
  onClose: () => void;
  onCreated: (msg: string) => Promise<void>;
  onUnauthorized: () => void;
}) {
  const [role, setRole] = useState<Role>(defaultRole);
  const [serviceType, setServiceType] = useState<ServiceTypeId>(defaultPartnerType === "care" ? "towing" : "inspection");
  const { partnerType, careServices } = serviceTypeById(serviceType);
  const [careEmirates, setCareEmirates] = useState<string[]>([]);
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", companyId: "", pocName: "", pocMobile: "", pocEmail: "", city: "", emirate: "" });
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((c) => ({ ...c, [k]: v }));
  const meta = ROLES.find((r) => r.key === role)!;
  const needsPhone = role !== "admin";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, ...f, companyIds: role === "account_manager" ? companyIds : undefined, ...(role === "company" ? { partnerType, careServices: [...careServices], careEmirates } : {}) }),
      });
      if (res.status === 401) return onUnauthorized();
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setError(d.error || "Could not create the user.");
      await onCreated(`${meta.label} created. Share the password with them yourself.`);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-neutral-900">Create user</h3>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRole(r.key)}
              className={`rounded-lg border px-3 py-2 text-left text-sm font-medium ${role === r.key ? "border-red-600 bg-red-50 text-red-700" : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">{meta.hint}</p>

        <div className="mt-4 space-y-3">
          <input value={f.name} onChange={(e) => set("name", e.target.value)} required placeholder={role === "company" ? "Company name *" : "Full name *"} className={input} />
          <input value={f.email} onChange={(e) => set("email", e.target.value)} required type="email" placeholder="Login email *" className={input} />
          {needsPhone && <input value={f.phone} onChange={(e) => set("phone", e.target.value)} required placeholder={role === "company" ? "Company mobile * (UAE, 05X XXX XXXX)" : "Mobile * (UAE, 05X XXX XXXX)"} className={input} />}
          <input value={f.password} onChange={(e) => set("password", e.target.value)} required minLength={8} type="password" placeholder="Password * (min 8)" className={input} />

          {role === "inspector" && (
            <select value={f.companyId} onChange={(e) => set("companyId", e.target.value)} required className={input}>
              <option value="">Inspection company *</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {role === "company" && (
            <>
              <select value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceTypeId)} className={input} aria-label="Service Type">
                {SERVICE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>Service Type: {t.label}</option>
                ))}
              </select>
              {partnerType === "care" && (
                <div className="space-y-2 rounded-lg bg-neutral-50 p-3">
                  <p className="text-xs font-semibold text-neutral-600">Emirates covered <span className="font-normal text-neutral-400">(none = all)</span></p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_EMIRATES.map((em) => (
                      <button key={em} type="button" onClick={() => setCareEmirates((c) => toggle(c, em))} className={`rounded-full border px-3 py-1 text-xs font-medium ${careEmirates.includes(em) ? "border-red-600 bg-red-50 text-red-700" : "border-neutral-300 text-neutral-600"}`}>
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="pt-1 text-xs font-bold uppercase tracking-wide text-neutral-400">Point of contact (gets job alerts)</p>
              <input value={f.pocName} onChange={(e) => set("pocName", e.target.value)} required placeholder="Contact name *" className={input} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={f.pocMobile} onChange={(e) => set("pocMobile", e.target.value)} required placeholder="Contact mobile *" className={input} />
                <input value={f.pocEmail} onChange={(e) => set("pocEmail", e.target.value)} required type="email" placeholder="Contact email *" className={input} />
                <input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="City" className={input} />
                <input value={f.emirate} onChange={(e) => set("emirate", e.target.value)} placeholder="Emirate" className={input} />
              </div>
            </>
          )}

          {role === "account_manager" && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-neutral-600">Assign inspection companies (optional)</p>
              <div className="flex flex-wrap gap-2">
                {companies.length === 0 && <p className="text-xs text-neutral-400">No approved companies yet.</p>}
                {companies.map((c) => {
                  const on = companyIds.includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => setCompanyIds((cur) => (on ? cur.filter((x) => x !== c.id) : [...cur, c.id]))} className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-red-600 bg-red-50 text-red-700" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}>
                      {on ? "✓ " : ""}{c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {(role === "account_manager" || role === "inspector") && (
          <p className="mt-3 text-xs text-neutral-500">They verify their own email and mobile (6-digit codes) the first time they sign in.</p>
        )}
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-md bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{busy ? "Creating…" : `Create ${meta.label}`}</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
