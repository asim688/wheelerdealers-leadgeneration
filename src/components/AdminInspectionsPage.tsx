"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import AdminInspectionsPanel, { AccountManagersPanel, STATUS_TABS } from "./AdminInspectionsPanel";
import AdminCompaniesList from "./AdminCompaniesList";
import { LoginForm } from "./AdminDashboard";

/**
 * Super Admin inspections console. A left sidebar holds the filters:
 *   1. Jobs (click → status list pops out)   2. Manage Companies
 *   3. Account Managers                       4. Payment Management (coming soon)
 * The old summary cards and status chips at the top are gone.
 */

export type Section = "jobs" | "companies" | "managers";

export default function AdminInspectionsPage({ initialSection = "jobs" }: { initialSection?: Section }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>(initialSection);
  const [status, setStatus] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [flyout, setFlyout] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/admin/inspections?pageSize=1")
      .then(async (r) => {
        setAuthed(r.ok);
        if (r.ok) setCounts((await r.json()).statusCounts ?? {});
      })
      .catch(() => setAuthed(false));
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
  }, []);
  const onUnauthorized = useCallback(() => setAuthed(false), []);
  const onCounts = useCallback((c: Record<string, number>) => setCounts(c), []);
  const closeFlyout = useCallback(() => setFlyout(false), []);

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

  const statusLabel = STATUS_TABS.find((t) => t.key === status)?.label ?? "All";
  const go = (s: Section) => {
    setSection(s);
    setFlyout(false);
    setMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-neutral-100">
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setMenuOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-neutral-200 bg-white transition-transform md:static md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <BrandLogo size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">Inspections</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Super Admin</p>
          </div>
        </div>

        <nav className="relative flex-1 px-3 pb-4">
          <p className="mb-2 mt-2 px-2 text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-400">Filters</p>

          <div className="relative">
            <NavItem active={section === "jobs"} open={flyout} onClick={() => setFlyout((v) => !v)} chevron>
              <span>1. Jobs</span>
              {section === "jobs" && status && <span className="ml-1.5 text-xs font-normal text-red-600">· {statusLabel}</span>}
            </NavItem>
            {flyout && (
              <StatusFlyout
                status={status}
                counts={counts}
                onPick={(k) => {
                  setStatus(k);
                  go("jobs");
                }}
                onClose={closeFlyout}
              />
            )}
          </div>

          <NavItem active={section === "companies"} onClick={() => go("companies")}>
            2. Manage Companies
          </NavItem>
          <NavItem active={section === "managers"} onClick={() => go("managers")}>
            3. Account Managers
          </NavItem>
          <NavItem disabled>
            <span>4. Payment Management</span>
            <span className="ml-2 rounded-full bg-neutral-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neutral-500">Soon</span>
          </NavItem>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button onClick={() => setMenuOpen(true)} className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 md:hidden" aria-label="Open menu">
            ☰
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/admin" className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">
              ← Admin console
            </Link>
            <button onClick={signOut} className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100">
              Sign out
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          {section === "jobs" && (
            <>
              <h1 className="mb-3 text-lg font-semibold text-neutral-900">
                Jobs <span className="font-normal text-neutral-400">· {statusLabel}</span>
                {typeof (status ? counts[status] : counts.all) === "number" && (
                  <span className="ml-1.5 text-sm font-normal text-neutral-400">({status ? counts[status] : counts.all})</span>
                )}
              </h1>
              <AdminInspectionsPanel status={status} onCounts={onCounts} onUnauthorized={onUnauthorized} />
            </>
          )}
          {section === "companies" && <AdminCompaniesList onUnauthorized={onUnauthorized} />}
          {section === "managers" && <AccountManagersPanel onChanged={() => undefined} onUnauthorized={onUnauthorized} />}
        </main>
      </div>
    </div>
  );
}

function NavItem({
  active,
  open,
  disabled,
  chevron,
  onClick,
  children,
}: {
  active?: boolean;
  open?: boolean;
  disabled?: boolean;
  chevron?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={chevron ? !!open : undefined}
      className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[15px] transition-colors ${
        disabled
          ? "cursor-not-allowed text-neutral-400"
          : active
            ? "bg-red-50 font-semibold text-red-700"
            : open
              ? "bg-neutral-100 font-medium text-neutral-900"
              : "font-medium text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      <span className="flex min-w-0 items-center">{children}</span>
      {chevron && <span className={`text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>›</span>}
    </button>
  );
}

/** Status list that pops out next to "1. Jobs" (click outside or Esc closes it). */
function StatusFlyout({
  status,
  counts,
  onPick,
  onClose,
}: {
  status: string;
  counts: Record<string, number>;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className={`absolute left-full top-0 z-50 ml-2 w-64 rounded-xl border border-neutral-200 bg-white p-2 shadow-xl transition-all duration-150 max-md:left-3 max-md:right-3 max-md:top-full max-md:ml-0 max-md:mt-1 max-md:w-auto ${
        shown ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0"
      }`}
    >
      {STATUS_TABS.map((t) => {
        const n = t.key ? counts[t.key] : counts.all;
        const on = status === t.key;
        return (
          <button
            key={t.key || "all"}
            role="menuitem"
            onClick={() => onPick(t.key)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              on ? "bg-red-50 font-semibold text-red-700" : "text-neutral-800 hover:bg-neutral-100"
            }`}
          >
            <span>
              {t.key ? t.label : "All jobs"}
              {typeof n === "number" && <span className={`ml-1 ${on ? "text-red-500" : "text-neutral-500"}`}>({n})</span>}
            </span>
            <span className="text-neutral-300" aria-hidden>›</span>
          </button>
        );
      })}
    </div>
  );
}
