"use client";

import { useEffect } from "react";

/**
 * Sign In / Sign Up chooser on the main page (white card, two columns):
 * MOTORISTS and EXPERTS (Inspection Partner, Pro Dealer — coming soon).
 * Inspection Partner sign-in is one page (/manage-inspections) that routes
 * companies, inspectors and account managers to their own portal.
 */

type Mode = "signin" | "signup";
type IconKey = "motorist" | "partner" | "dealer" | "inspector";

interface Option {
  title: string;
  body: string;
  href?: string;
  comingSoon?: boolean;
  icon: IconKey;
}

const SIGN_UP = {
  motorist: {
    title: "Smart Motorists",
    body: "Make the smart decision every time: book a vehicle checkup for pre-purchase peace of mind or preventive care against a breakdown.",
    href: "/account?signup=1",
    icon: "motorist",
  } as Option,
  experts: [
    { title: "Inspection Partner", body: "Accept live jobs and grow your business with a steady stream of inspection requests.", href: "/company?register=1", icon: "partner" },
    { title: "Pro Dealer", body: "Access live auctions and increase your inventory with transparent vehicle reports you can trust.", comingSoon: true, icon: "dealer" },
  ] as Option[],
};

const SIGN_IN = {
  motorist: {
    title: "Smart Motorists",
    body: "Manage your bookings and view inspection reports.",
    href: "/account",
    icon: "motorist",
  } as Option,
  experts: [
    { title: "Inspection Partner", body: "Manage inspections: jobs, inspectors, report reviews and payouts.", href: "/manage-inspections", icon: "partner" },
    { title: "Pro Dealer", body: "Access live auctions and increase your inventory.", comingSoon: true, icon: "dealer" },
  ] as Option[],
};

export default function AuthChooser({ mode, onClose, onSwitch }: { mode: Mode; onClose: () => void; onSwitch: (m: Mode) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cfg = mode === "signup" ? SIGN_UP : SIGN_IN;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/5 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="auth-title" className="text-2xl font-bold tracking-tight text-neutral-900">{mode === "signup" ? "Sign up" : "Sign in"}</h2>
            <p className="mt-1 text-sm text-neutral-500">{mode === "signup" ? "How would you like to join The Wheeler Dealers?" : "Choose your account type."}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-800" aria-label="Close">✕</button>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 sm:gap-0">
          <div className="sm:pr-6">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-400">Smart Motorists</p>
            <MotoristCard o={cfg.motorist} />
          </div>
          <div className="sm:border-l sm:border-neutral-200 sm:pl-6">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-400">Experts</p>
            <div className="space-y-3">{cfg.experts.map((o) => <ExpertCard key={o.title} o={o} />)}</div>
          </div>
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-5 text-center text-sm text-neutral-500">
          {mode === "signup" ? "Already have an account? " : "New to The Wheeler Dealers? "}
          <button type="button" onClick={() => onSwitch(mode === "signup" ? "signin" : "signup")} className="font-semibold text-red-600 transition-colors hover:text-red-700 hover:underline">
            {mode === "signup" ? "Sign in" : "Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MotoristCard({ o }: { o: Option }) {
  return (
    <a
      href={o.href}
      className="group relative flex h-full min-h-[200px] flex-col justify-between overflow-hidden rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 via-white to-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-400 hover:shadow-md"
    >
      <span className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-white shadow-md shadow-red-600/30">
        <Icon k={o.icon} size={26} />
      </span>
      <span className="relative mt-6 block">
        <span className="flex items-center justify-between gap-2 text-xl font-bold text-neutral-900">
          {o.title}
          <span className="text-2xl text-neutral-300 transition-transform group-hover:translate-x-1 group-hover:text-red-600" aria-hidden>›</span>
        </span>
        <span className="mt-1.5 block text-[13px] leading-snug text-neutral-600">{o.body}</span>
      </span>
    </a>
  );
}

function ExpertCard({ o }: { o: Option }) {
  const disabled = !!o.comingSoon || !o.href;
  const inner = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${disabled ? "bg-neutral-200 text-neutral-400" : "bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white"}`} aria-hidden>
        <Icon k={disabled ? "lock" : o.icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-center gap-2 text-[15px] font-semibold ${disabled ? "text-neutral-500" : "text-neutral-900"}`}>
          {o.title}
          {o.comingSoon && (
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neutral-500">Coming soon</span>
          )}
        </span>
        <span className={`mt-0.5 block text-xs leading-snug ${disabled ? "text-neutral-400" : "text-neutral-500"}`}>{o.body}</span>
      </span>
      {!disabled && <span className="text-xl text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-red-600" aria-hidden>›</span>}
    </>
  );
  const cls = "group flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all";
  if (disabled) {
    return (
      <div aria-disabled className={`${cls} cursor-not-allowed border-neutral-200 bg-neutral-50`}>
        {inner}
      </div>
    );
  }
  return (
    <a href={o.href} className={`${cls} border-neutral-200 bg-white shadow-sm hover:border-red-300 hover:shadow-md`}>
      {inner}
    </a>
  );
}

function Icon({ k, size = 24 }: { k: IconKey | "lock"; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (k) {
    case "motorist":
      return (
        <svg {...p}>
          <path d="M5 17H3.5v-4.5l2-5.2A2 2 0 0 1 7.4 6h9.2a2 2 0 0 1 1.9 1.3l2 5.2V17H19" />
          <path d="M3.5 12.5h17M8 17h8" />
          <circle cx="6.5" cy="17" r="1.8" />
          <circle cx="17.5" cy="17" r="1.8" />
        </svg>
      );
    case "partner":
      return (
        <svg {...p}>
          <path d="M14.7 6.3a4 4 0 0 0 5 5l-9.6 9.6a2.1 2.1 0 0 1-3-3l9.6-9.6a4 4 0 0 0-1.1-3.3 4 4 0 0 0-.9-.7z" />
        </svg>
      );
    case "dealer":
      return (
        <svg {...p}>
          <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M2.5 21h19" />
          <path d="M8 8h2M8 12h2M8 16h2M17 13h.01M17 17h.01" />
        </svg>
      );
    case "inspector":
      return (
        <svg {...p}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4.5h6M9 13l2 2 4-4" />
        </svg>
      );
    case "lock":
      return (
        <svg {...p}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
  }
}
