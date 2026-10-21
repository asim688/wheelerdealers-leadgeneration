"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminAuction,
  AdminDealer,
  AdminOverview,
} from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import BrandLogo from "./BrandLogo";
import AdminLeadsPanel from "./AdminLeadsPanel";
import AdminInspectionsPanel from "./AdminInspectionsPanel";
import AdminMarketPanel from "./AdminMarketPanel";

export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  // Probe the protected endpoint to learn whether we already have a session.
  useEffect(() => {
    let active = true;
    fetch("/api/admin/auctions")
      .then((r) => {
        if (active) setAuthed(r.ok);
      })
      .catch(() => {
        if (active) setAuthed(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (authed === null) {
    return (
      <Shell>
        <div className="flex h-40 items-center justify-center text-neutral-400">
          Loading…
        </div>
      </Shell>
    );
  }

  // Authed users get the full sidebar dashboard; guests get the centered login.
  if (authed) {
    return <Dashboard onLogout={() => setAuthed(false)} />;
  }

  return (
    <Shell>
      <LoginForm onAuthed={() => setAuthed(true)} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-200 via-neutral-100 to-neutral-300 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col items-center gap-3">
          <BrandLogo />
          <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white">
            Admin console
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}

function LoginForm({ onAuthed }: { onAuthed: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }
      onAuthed();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-2xl bg-white p-8 shadow-xl ring-1 ring-black/5">
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">
        Operator sign in
      </h1>
      <p className="mb-5 text-sm text-neutral-500">
        Sign in to manage leads, auctions and dealers.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@thewheelerdealers.com"
            autoComplete="email"
            className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500"
          />
        </label>
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
        >
          {loading ? "Please wait…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

type AdminTab = "overview" | "leads" | "inspections" | "market" | "auctions" | "dealers";

const TAB_META: Record<AdminTab, { label: string; icon: string }> = {
  overview: { label: "Overview", icon: "📊" },
  leads: { label: "Leads", icon: "👥" },
  inspections: { label: "Inspections", icon: "🔧" },
  market: { label: "Market Data", icon: "🚗" },
  auctions: { label: "Auctions", icon: "🔨" },
  dealers: { label: "Dealers", icon: "🏢" },
};

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [auctions, setAuctions] = useState<AdminAuction[]>([]);
  const [dealers, setDealers] = useState<AdminDealer[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [oRes, aRes, dRes] = await Promise.all([
        fetch("/api/admin/overview"),
        fetch("/api/admin/auctions"),
        fetch("/api/admin/dealers"),
      ]);
      if ([oRes, aRes, dRes].some((r) => r.status === 401)) {
        onLogout();
        return;
      }
      if (oRes.ok) setOverview(await oRes.json());
      if (aRes.ok) setAuctions((await aRes.json()).auctions ?? []);
      if (dRes.ok) setDealers((await dRes.json()).dealers ?? []);
    } catch {
      // ignore
    } finally {
      setLoaded(true);
    }
  }, [onLogout]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    onLogout();
  }

  const open = auctions.filter((a) => a.status === "open");
  const closed = auctions.filter((a) => a.status === "closed");

  const counts: Record<AdminTab, number | null> = {
    overview: null,
    leads: overview?.counts.leads ?? null,
    inspections: null,
    market: overview?.counts.carListings ?? null,
    auctions: auctions.length,
    dealers: dealers.length,
  };

  return (
    <div className="flex min-h-screen bg-neutral-100">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — slide-in drawer on mobile, static on md+ */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col border-r border-neutral-200 bg-white transition-transform duration-200 md:sticky md:top-0 md:z-auto md:w-56 md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-neutral-100 px-4 py-4">
          <div>
            <BrandLogo size="sm" />
            <span className="mt-2 inline-block rounded-full bg-neutral-900 px-2.5 py-0.5 text-[10px] font-semibold text-white">
              Admin console
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 md:hidden"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {(Object.keys(TAB_META) as AdminTab[]).map((t) => (
            <SideLink
              key={t}
              active={tab === t}
              onClick={() => {
                setTab(t);
                setSidebarOpen(false);
              }}
              icon={TAB_META[t].icon}
              label={TAB_META[t].label}
              count={counts[t]}
            />
          ))}
        </nav>
        <div className="border-t border-neutral-100 p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
          >
            <span>↩</span> Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 md:hidden"
            aria-label="Open menu"
          >
            ☰
          </button>
          <h1 className="text-base font-semibold text-neutral-900 sm:text-lg">
            {TAB_META[tab].label}
          </h1>
        </header>

        <div className="w-full p-4 sm:p-6">
          {tab === "leads" ? (
            <AdminLeadsPanel onUnauthorized={onLogout} />
          ) : tab === "inspections" ? (
            <AdminInspectionsPanel onUnauthorized={onLogout} />
          ) : tab === "market" ? (
            <AdminMarketPanel onUnauthorized={onLogout} />
          ) : !loaded ? (
            <div className="flex h-32 items-center justify-center text-neutral-400">
              Loading…
            </div>
          ) : tab === "overview" ? (
            <OverviewPanel overview={overview} />
          ) : tab === "dealers" ? (
            <DealersPanel dealers={dealers} onChange={load} />
          ) : auctions.length === 0 ? (
            <EmptyState
              title="No auctions yet."
              subtitle="Seller and trade leads are offered to dealers here."
            />
          ) : (
            <div className="space-y-4">
              {open.length > 0 && (
                <Section title="Open auctions">
                  {open.map((a) => (
                    <AdminAuctionRow key={a.id} auction={a} onChange={load} />
                  ))}
                </Section>
              )}
              {closed.length > 0 && (
                <Section title="Finalised deals">
                  {closed.map((a) => (
                    <AdminAuctionRow key={a.id} auction={a} onChange={load} />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function SideLink({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  count: number | null;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-red-600 text-white"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
      ].join(" ")}
    >
      <span className="text-base">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {count != null && (
        <span
          className={[
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            active ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-600",
          ].join(" ")}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// --- Overview panel -------------------------------------------------------

const CARD_ICONS: Record<string, string> = {
  Leads: "👥",
  "Inspections booked": "🗓",
  Dealers: "🏢",
  "Open auctions": "🔨",
  "Market listings": "🚗",
  "Price groups": "📊",
  Inventory: "🅿️",
  "Total bids": "💰",
};

function OverviewPanel({ overview }: { overview: AdminOverview | null }) {
  if (!overview) {
    return <EmptyState title="No data yet." subtitle="Stats will appear here." />;
  }
  const c = overview.counts;
  const cards: Array<[string, number, string]> = [
    ["Leads", c.leads, `${c.inspectionsBooked} booked inspection`],
    ["Inspections booked", c.inspectionsBooked, "home / branch / expert"],
    ["Dealers", c.dealers, `${c.dealersApproved} approved · ${c.dealersPending} pending`],
    ["Open auctions", c.auctionsOpen, `${c.auctionsClosed} closed`],
    ["Market listings", c.carListings, "real UAE cars for pricing"],
    ["Price groups", c.marketPrices, "make/model/year averages"],
    ["Inventory", c.cars, `${c.carsSold} sold`],
    ["Total bids", c.bids, "across all auctions"],
  ];

  const maxMake = Math.max(1, ...overview.topMakes.map((m) => m.count));

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([label, value, sub]) => (
          <div
            key={label}
            className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500">{label}</span>
              <span className="text-lg">{CARD_ICONS[label] ?? "•"}</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-neutral-900">
              {value.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-400">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Leads by intent */}
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">
            Leads by type
          </h3>
          {overview.leadsByIntent.length === 0 ? (
            <p className="text-sm text-neutral-400">No leads yet.</p>
          ) : (
            <div className="space-y-2">
              {overview.leadsByIntent.map((r) => (
                <div key={r.intent} className="flex items-center gap-3">
                  <span
                    className={`w-16 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold uppercase ${
                      INTENT_STYLES[r.intent] ?? "bg-neutral-200 text-neutral-700"
                    }`}
                  >
                    {r.intent}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full bg-red-500"
                      style={{
                        width: `${(r.count / overview.counts.leads) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm font-medium text-neutral-700">
                    {r.count}
                  </span>
                </div>
              ))}
              <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                Avg. valuation:{" "}
                <span className="font-semibold text-neutral-800">
                  {formatCurrency(overview.avgEstimate.min, overview.currency)} –{" "}
                  {formatCurrency(overview.avgEstimate.max, overview.currency)}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Top makes in market data */}
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h3 className="mb-3 text-sm font-semibold text-neutral-900">
            Top makes in market data
          </h3>
          <div className="space-y-2">
            {overview.topMakes.map((m) => (
              <div key={m.make} className="flex items-center gap-3">
                <span className="w-28 truncate text-sm text-neutral-700">
                  {m.make}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-neutral-800"
                    style={{ width: `${(m.count / maxMake) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-right text-sm font-medium text-neutral-700">
                  {m.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent leads */}
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h3 className="mb-3 text-sm font-semibold text-neutral-900">
          Recent leads
        </h3>
        {overview.recentLeads.length === 0 ? (
          <p className="text-sm text-neutral-400">No leads yet.</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {overview.recentLeads.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      INTENT_STYLES[l.intent] ?? "bg-neutral-200 text-neutral-700"
                    }`}
                  >
                    {l.intent}
                  </span>
                  <span className="text-sm text-neutral-800">
                    {l.car || "—"}{" "}
                    <span className="text-neutral-400">· {l.name}</span>
                  </span>
                </div>
                <span className="text-sm font-medium text-red-700">
                  {l.estimateMin != null && l.estimateMax != null
                    ? `${formatCurrency(l.estimateMin, l.currency)} – ${formatCurrency(
                        l.estimateMax,
                        l.currency,
                      )}`
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Dealers panel --------------------------------------------------------

function DealersPanel({
  dealers,
  onChange,
}: {
  dealers: AdminDealer[];
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function setApproved(dealerId: string, approved: boolean) {
    setBusy(dealerId);
    try {
      await fetch("/api/admin/dealers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealerId, approved }),
      });
      onChange();
    } finally {
      setBusy(null);
    }
  }

  if (dealers.length === 0) {
    return (
      <EmptyState
        title="No dealers registered."
        subtitle="Dealers who register on the portal appear here for approval."
      />
    );
  }

  return (
    <div className="space-y-3">
      {dealers.map((d) => (
        <div
          key={d.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5"
        >
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-neutral-900">{d.name}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  d.approved
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {d.approved ? "Approved" : "Pending"}
              </span>
            </div>
            <a
              href={`mailto:${d.email}`}
              className="text-sm text-neutral-500 hover:text-red-600"
            >
              {d.email}
            </a>
          </div>
          <button
            disabled={busy === d.id}
            onClick={() => setApproved(d.id, !d.approved)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              d.approved
                ? "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                : "bg-green-600 text-white hover:bg-green-700"
            }`}
          >
            {busy === d.id ? "…" : d.approved ? "Revoke" : "Approve"}
          </button>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
      <p className="text-neutral-600">{title}</p>
      <p className="mt-1 text-sm text-neutral-400">{subtitle}</p>
    </div>
  );
}

const INTENT_STYLES: Record<string, string> = {
  sell: "bg-red-100 text-red-700",
  trade: "bg-amber-100 text-amber-700",
  buy: "bg-blue-100 text-blue-700",
  dealer: "bg-neutral-200 text-neutral-700",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function AdminAuctionRow({
  auction,
  onChange,
}: {
  auction: AdminAuction;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cur = auction.currency;
  const isClosed = auction.status === "closed";

  async function accept(bidId: string) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/auctions/${auction.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bidId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not accept this bid.");
        return;
      }
      onChange();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">
            {auction.car.year} {auction.car.make} {auction.car.model}
          </h3>
          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-500">
            {auction.leadType}
          </span>
          {isClosed && (
            <span className="rounded-md bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">
              Deal finalised
            </span>
          )}
        </div>
        <div className="text-xs text-neutral-500">
          {auction.car.mileage.toLocaleString()} mi · {auction.car.condition}
          {auction.estimateMin != null && auction.estimateMax != null && (
            <>
              {" "}
              · Est. {formatCurrency(auction.estimateMin, cur)}–
              {formatCurrency(auction.estimateMax, cur)}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 px-4 py-3 sm:grid-cols-[1fr_1.4fr]">
        {/* Seller (admin-only) */}
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Seller contact
          </p>
          <p className="text-sm font-medium text-neutral-900">
            {auction.seller.name || "—"}
          </p>
          <p className="text-xs text-neutral-600">{auction.seller.mobile || "—"}</p>
          <p className="text-xs text-neutral-600">{auction.seller.email || "—"}</p>
        </div>

        {/* Bids */}
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Dealer bids ({auction.bids.length})
          </p>
          {auction.bids.length === 0 ? (
            <p className="text-sm text-neutral-400">No bids yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {auction.bids.map((b) => {
                const isWinner = auction.winningBidId === b.id;
                return (
                  <li
                    key={b.id}
                    className={[
                      "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                      isWinner ? "bg-green-50 ring-1 ring-green-300" : "bg-neutral-50",
                    ].join(" ")}
                  >
                    <span className="min-w-0">
                      <span className="font-semibold text-neutral-900">
                        {formatCurrency(b.amount, cur)}
                      </span>{" "}
                      <span className="text-xs text-neutral-500">
                        · {b.dealerName}
                      </span>
                    </span>
                    {isClosed ? (
                      isWinner ? (
                        <span className="text-xs font-semibold text-green-700">
                          Winner
                        </span>
                      ) : null
                    ) : (
                      <button
                        onClick={() => accept(b.id)}
                        disabled={busy}
                        className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60"
                      >
                        Accept
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
