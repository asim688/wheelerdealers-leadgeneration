"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuctionListing, DealerProfile } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import BrandLogo from "./BrandLogo";

const POLL_INTERVAL_MS = 4000;

export default function DealerPortal() {
  const [dealer, setDealer] = useState<DealerProfile | null>(null);
  const [checking, setChecking] = useState(true);

  // Check for an existing session on mount.
  useEffect(() => {
    let active = true;
    fetch("/api/dealer/me")
      .then((r) => r.json())
      .then((d) => {
        if (active) setDealer(d.dealer ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return (
      <Shell>
        <div className="flex h-40 items-center justify-center text-neutral-400">
          Loading…
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {dealer ? (
        <Dashboard dealer={dealer} onLogout={() => setDealer(null)} />
      ) : (
        <AuthForm onAuthed={setDealer} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-200 via-neutral-100 to-neutral-300 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col items-center gap-3">
          <BrandLogo />
          <a
            href="/"
            className="text-xs text-neutral-500 underline-offset-2 hover:text-red-600 hover:underline"
          >
            ← Back to marketplace
          </a>
        </div>
        {children}
      </div>
    </main>
  );
}

// --- Authentication ----------------------------------------------------------

function AuthForm({ onAuthed }: { onAuthed: (d: DealerProfile) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/dealer/login" : "/api/dealer/register";
      const payload =
        mode === "login" ? { email, password } : { name, email, password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      onAuthed(data.dealer);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-xl ring-1 ring-black/5">
      <div className="mb-6 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
        <h1 className="text-lg font-semibold text-neutral-900">
          Dealer Core {mode === "login" ? "sign in" : "registration"}
        </h1>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <Field
            label="Dealership name"
            value={name}
            onChange={setName}
            placeholder="Acme Motors"
            autoComplete="organization"
          />
        )}
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@dealership.com"
          autoComplete="email"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
        >
          {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-neutral-500">
        {mode === "login" ? "New dealer?" : "Already registered?"}{" "}
        <button
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
          className="font-medium text-red-600 hover:underline"
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </button>
      </p>

      {process.env.NODE_ENV !== "production" && (
        <p className="mt-6 rounded-md bg-neutral-50 px-3 py-2 text-center text-xs text-neutral-400">
          Demo login: dealer@wheelerdealers.test / dealer1234
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500"
      />
    </label>
  );
}

// --- Dashboard ---------------------------------------------------------------

function Dashboard({
  dealer,
  onLogout,
}: {
  dealer: DealerProfile;
  onLogout: () => void;
}) {
  const [auctions, setAuctions] = useState<AuctionListing[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dealer/auctions");
      if (!res.ok) return;
      const data = await res.json();
      setAuctions(data.auctions ?? []);
    } catch {
      // ignore transient polling errors
    } finally {
      setLoaded(true);
    }
  }, []);

  // Poll for live auction/bid updates.
  useEffect(() => {
    void load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function logout() {
    await fetch("/api/dealer/logout", { method: "POST" });
    onLogout();
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between rounded-xl bg-white px-5 py-3 shadow-sm ring-1 ring-black/5">
        <div>
          <p className="text-sm font-semibold text-neutral-900">{dealer.name}</p>
          <p className="text-xs text-neutral-500">{dealer.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Live
          </span>
          <button
            onClick={logout}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            Sign out
          </button>
        </div>
      </div>

      {dealer.approved === false && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
          <p className="text-sm font-semibold text-amber-800">
            Your dealer account is pending approval
          </p>
          <p className="mt-0.5 text-xs text-amber-700">
            You can browse live auctions now, but bidding unlocks once our team
            verifies your dealership.
          </p>
        </div>
      )}

      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Live seller auctions</h2>
        <span className="text-xs text-neutral-500">
          {auctions.length} open {auctions.length === 1 ? "lot" : "lots"}
        </span>
      </div>

      {!loaded ? (
        <div className="flex h-32 items-center justify-center text-neutral-400">
          Loading auctions…
        </div>
      ) : auctions.length === 0 ? (
        <div className="rounded-xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
          <p className="text-neutral-600">No open auctions right now.</p>
          <p className="mt-1 text-sm text-neutral-400">
            New seller leads appear here automatically as they come in.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {auctions.map((a) => (
            <AuctionCard
              key={a.id}
              auction={a}
              onBid={load}
              canBid={dealer.approved !== false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AuctionCard({
  auction,
  onBid,
  canBid,
}: {
  auction: AuctionListing;
  onBid: () => void;
  canBid: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cur = auction.currency;

  const suggested =
    (auction.highestBid ?? auction.estimateMin ?? 0) + 100;

  async function placeBid(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dealer/auctions/${auction.id}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Bid failed.");
        return;
      }
      setAmount("");
      onBid();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-900">
          {auction.car.year} {auction.car.make} {auction.car.model}
        </h3>
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-500">
          {auction.leadType}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        <Tag>{auction.car.mileage.toLocaleString()} mi</Tag>
        {auction.car.condition && <Tag className="capitalize">{auction.car.condition}</Tag>}
        {auction.estimateMin != null && auction.estimateMax != null && (
          <Tag>
            Est. {formatCurrency(auction.estimateMin, cur)}–
            {formatCurrency(auction.estimateMax, cur)}
          </Tag>
        )}
      </div>

      <div className="mt-auto space-y-3 border-t border-neutral-100 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">
            Highest bid
            <span className="ml-1 text-[11px] text-neutral-400">
              ({auction.bidCount})
            </span>
          </span>
          <span className="font-bold text-neutral-900">
            {auction.highestBid != null
              ? formatCurrency(auction.highestBid, cur)
              : "No bids yet"}
          </span>
        </div>

        {auction.yourBid != null && (
          <p className="text-xs text-neutral-500">
            Your current bid: {formatCurrency(auction.yourBid, cur)}
            {auction.highestBid === auction.yourBid && (
              <span className="ml-1 font-semibold text-green-600">· leading</span>
            )}
          </p>
        )}

        <form onSubmit={placeBid} className="flex items-center gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`${suggested}`}
            min={0}
            disabled={!canBid}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500 disabled:bg-neutral-100"
          />
          <button
            type="submit"
            disabled={submitting || !canBid}
            title={canBid ? undefined : "Bidding unlocks once your account is approved"}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            Bid
          </button>
        </form>

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function Tag({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 ${className}`}
    >
      {children}
    </span>
  );
}
