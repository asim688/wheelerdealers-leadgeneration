"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import AdminInspectionsPanel from "./AdminInspectionsPanel";
import { LoginForm } from "./AdminDashboard";

/**
 * Separate super-admin page for inspections: the full summary list of every
 * inspection (all details, filters, export), report verification, inspection
 * companies and Account Managers.
 */
export default function AdminInspectionsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/inspections?pageSize=1")
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
  }, []);
  const onUnauthorized = useCallback(() => setAuthed(false), []);

  if (authed === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-sm text-neutral-400">Loading…</div>;
  }
  if (!authed) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-neutral-200 via-neutral-100 to-neutral-300 px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-col items-center gap-3">
            <BrandLogo />
            <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white">Super Admin · Inspections</span>
          </div>
          <LoginForm onAuthed={() => setAuthed(true)} />
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <div>
              <p className="text-sm font-semibold text-neutral-900">Inspections</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Super Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin" className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">
              ← Admin console
            </Link>
            <button onClick={signOut} className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="p-4 sm:p-6">
        <AdminInspectionsPanel onUnauthorized={onUnauthorized} />
      </main>
    </div>
  );
}
