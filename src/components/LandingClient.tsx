"use client";

import { useState } from "react";
import type { TabId } from "@/lib/types";
import BrandLogo from "./BrandLogo";
import ChatPanel from "./ChatPanel";
import InspectionBookingChat from "./InspectionBookingChat";

/** The search tabs — the 4 chat intents plus the Inspection booking journey. */
type TabKey = TabId | "inspection";

interface TabConfig {
  id: TabKey;
  label: string;
  cta: string;
  placeholder: string;
  seed: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  {
    id: "buy",
    label: "Buy",
    cta: "Find Cars",
    placeholder: "Search make, model, year, trim, location or keyword...",
    seed: "I'm looking to buy a car.",
    icon: <CarIcon />,
  },
  {
    id: "sell",
    label: "Sell",
    cta: "Value My Car",
    placeholder: "Tell us about the car you want to sell...",
    seed: "I'd like to sell my car.",
    icon: <TagIcon />,
  },
  {
    id: "trade",
    label: "Trade",
    cta: "Start Trade-In",
    placeholder: "What do you want to sell, and what do you want next...",
    seed: "I want to trade in my car for another one.",
    icon: <SwapIcon />,
  },
  {
    id: "inspection",
    label: "Inspection",
    cta: "Book Inspection",
    placeholder: "Book a professional 300+ point vehicle inspection...",
    seed: "",
    icon: <SearchIcon />,
  },
  {
    id: "dealer",
    label: "Dealers Core",
    cta: "View Auctions",
    placeholder: "Dealer auction access — view live seller leads...",
    seed: "I'm a dealer interested in the live auction.",
    icon: <BuildingIcon />,
  },
];

export default function LandingClient() {
  const [activeTab, setActiveTab] = useState<TabKey>("buy");
  const [query, setQuery] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [initialMessage, setInitialMessage] = useState("");
  const [sessionKey, setSessionKey] = useState(0);
  const active = TABS.find((t) => t.id === activeTab)!;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (activeTab === "inspection") {
      // Open the AI booking assistant in the same in-page popup as the
      // Buy/Sell/Trade chats — no navigation to a separate page.
      setSessionKey((k) => k + 1);
      setChatOpen(true);
      return;
    }
    const seed = query.trim() || active.seed;
    setInitialMessage(seed);
    setSessionKey((k) => k + 1);
    setChatOpen(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Slim header (logo only) */}
      <header className="sticky top-0 z-30 border-b border-neutral-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2.5">
          <BrandLogo size="sm" />
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero artwork (client's bg-image mockup, cropped band) ────────── */}
        <section className="relative overflow-hidden border-b border-neutral-100 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-bg.jpg?v=2"
            alt="The Wheeler Dealers — Buy. Sell. Trade. Smarter. AI-powered car marketplace & inspection platform."
            className="w-full select-none"
            loading="eager"
            fetchPriority="high"
            draggable={false}
          />
        </section>

        {/* ── Search card (overlaps the art exactly like the mockup; 8vw ≈ the
             erased card pocket, proportional at every viewport width) ────── */}
        <div className="relative z-10 mx-auto -mt-[8vw] max-w-4xl px-5 pb-12">
            <div className="rounded-2xl border border-neutral-200 bg-white shadow-xl">
              {/* Tabs */}
              <div className="flex divide-x divide-neutral-100 overflow-x-auto border-b border-neutral-100">
                {TABS.map((tab) => {
                  const isActive = tab.id === activeTab;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={[
                        "relative flex min-w-fit flex-1 items-center justify-center gap-2 whitespace-nowrap px-4 py-3.5 text-sm font-semibold transition-colors sm:px-6",
                        isActive ? "text-red-600" : "text-neutral-700 hover:text-neutral-900",
                      ].join(" ")}
                    >
                      {tab.icon}
                      {tab.label}
                      {isActive && (
                        <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-t bg-red-600 sm:inset-x-6" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Search bar */}
              <form onSubmit={handleSubmit} className="flex items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-neutral-200 px-4 py-3 transition-colors focus-within:border-red-400">
                  <span className="text-neutral-400"><SearchIcon /></span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={active.placeholder}
                    aria-label="AI search"
                    className="min-w-0 flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400 sm:text-base"
                  />
                </div>
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 sm:px-8"
                >
                  {active.cta}
                </button>
              </form>
            </div>
          </div>

        {/* ── How It Works ────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-5 pb-12">
          <h2 className="text-center text-2xl font-bold tracking-tight text-neutral-900">
            How It Works
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3 sm:gap-4">
            <HowStep
              n={1}
              icon={<SearchIcon size={26} />}
              title="Search"
              body={"Tell us what you're looking for or what you want to do."}
              connector
            />
            <HowStep
              n={2}
              icon={<MatchIcon />}
              title="Get Matched"
              body="Get AI-powered results, matches or insights instantly."
              connector
            />
            <HowStep
              n={3}
              icon={<HandshakeIcon />}
              title="Close the Deal"
              body="Connect with the right people and close with confidence."
            />
          </div>
        </section>

        {/* ── Feature band ───────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-5 pb-14">
          <div className="grid divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white shadow-sm sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            <Feature
              icon={<ShieldIcon />}
              title="Trusted by Dealers"
              body={"Verified listings & inspections from trusted experts."}
            />
            <Feature
              icon={<BoltIcon />}
              title="Instant Results"
              body="AI-driven valuations in under a minute."
            />
            <Feature
              icon={<LockIcon />}
              title="No Obligation"
              body="100% free to use. No hidden fees."
            />
            <Feature
              icon={<BrainIcon />}
              title="AI Powered"
              body="Smarter insights. Better decisions."
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-neutral-500 sm:flex-row">
          <BrandLogo size="sm" />
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <a href="/inspection" className="font-medium text-neutral-600 hover:text-red-600">
              Car Inspection
            </a>
            <a href="/inspection/book" className="font-medium text-neutral-600 hover:text-red-600">
              Book Inspection
            </a>
            <a href="/blog" className="font-medium text-neutral-600 hover:text-red-600">
              Blog
            </a>
          </nav>
          <p>© {new Date().getFullYear()} The Wheeler Dealers. All rights reserved.</p>
        </div>
      </footer>

      {chatOpen && activeTab === "inspection" && (
        <InspectionBookingChat
          key={sessionKey}
          onClose={() => setChatOpen(false)}
          onFallback={() => {
            // AI unavailable or user prefers the form — use the full wizard page.
            window.location.href = "/inspection/book?mode=form";
          }}
        />
      )}

      {chatOpen && activeTab !== "inspection" && (
        <ChatPanel
          key={sessionKey}
          intent={activeTab as TabId}
          initialMessage={initialMessage}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Sections ─────────────────────────────────────────────────────────── */

function HowStep({
  n,
  icon,
  title,
  body,
  connector,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: string;
  connector?: boolean;
}) {
  return (
    <div className="relative flex items-start gap-4 sm:flex-col sm:items-center sm:text-center">
      {/* Icon with number badge */}
      <div className="relative shrink-0">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-50 text-neutral-800 ring-1 ring-neutral-200">
          {icon}
        </div>
        <span className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
          {n}
        </span>
      </div>
      {/* Dashed connector to the next step (desktop) */}
      {connector && (
        <span
          aria-hidden
          className="absolute left-[calc(50%+3.5rem)] top-8 hidden w-[calc(100%-7rem)] border-t-2 border-dashed border-neutral-300 sm:block"
        />
      )}
      <div className="sm:mt-3">
        <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
        <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-neutral-500">{body}</p>
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3.5 p-5">
      <span className="mt-0.5 shrink-0 text-red-600">{icon}</span>
      <div>
        <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{body}</p>
      </div>
    </div>
  );
}

/* ── Icons (outline, matching the artwork) ────────────────────────────── */

function CarIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
      <path d="M3 11h18v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z" />
      <circle cx="7.5" cy="13.5" r=".6" fill="currentColor" />
      <circle cx="16.5" cy="13.5" r=".6" fill="currentColor" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".8" fill="currentColor" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 3l4 4-4 4" />
      <path d="M20 7H7" />
      <path d="M8 21l-4-4 4-4" />
      <path d="M4 17h13" />
    </svg>
  );
}

function SearchIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
    </svg>
  );
}

function MatchIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="3" width="13" height="18" rx="2" />
      <path d="M8 8h5M8 12h5" />
      <circle cx="17.5" cy="16.5" r="3.5" />
      <path d="m16 16.5 1 1 2-2" />
    </svg>
  );
}

function HandshakeIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m11 17 2 2a1 1 0 1 0 3-3" />
      <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
      <path d="m21 3 1 11h-2M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3M3 4h8" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1" fill="currentColor" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0-1.32 4.24 3 3 0 0 0 .34 5.58 2.5 2.5 0 0 0 2.96 3.08A2.5 2.5 0 0 0 12 19.5Z" />
      <path d="M12 4.5a2.5 2.5 0 0 1 4.96-.46 2.5 2.5 0 0 1 1.98 3 2.5 2.5 0 0 1 1.32 4.24 3 3 0 0 1-.34 5.58 2.5 2.5 0 0 1-2.96 3.08A2.5 2.5 0 0 1 12 19.5Z" />
      <path d="M12 4.5v15" />
    </svg>
  );
}
