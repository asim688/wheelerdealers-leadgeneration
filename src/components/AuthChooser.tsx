"use client";

import { useEffect } from "react";

/**
 * Sign In / Sign Up chooser on the main page.
 * Sign Up: Become a Partner (Inspection Company; Car Dealer coming soon) or
 * Become a Customer. Sign In: Customer, Partner (Inspection Company) or Inspector.
 */

type Mode = "signin" | "signup";

interface Option {
  title: string;
  body: string;
  href?: string;
  comingSoon?: boolean;
  icon: string;
}

const SIGN_UP: Array<{ heading: string; options: Option[] }> = [
  {
    heading: "Become a Partner",
    options: [
      { title: "Inspection Company", body: "Register your company to receive and accept live inspection jobs.", href: "/company?register=1", icon: "🔧" },
      { title: "Car Dealer", body: "Dealer partnership for buying and auction access.", comingSoon: true, icon: "🏢" },
    ],
  },
  {
    heading: "Become a Customer",
    options: [
      { title: "Customer", body: "Book inspections and see all your bookings and reports in one place.", href: "/account?signup=1", icon: "🙋" },
    ],
  },
];

const SIGN_IN: Option[] = [
  { title: "Customer", body: "Your bookings and inspection reports.", href: "/account", icon: "🙋" },
  { title: "Inspection Company", body: "Partner portal: live jobs, inspectors and payouts.", href: "/company", icon: "🔧" },
  { title: "Car Dealer", body: "Dealer partner portal.", comingSoon: true, icon: "🏢" },
  { title: "Inspector", body: "Run the inspections assigned to you.", href: "/inspector", icon: "📋" },
];

export default function AuthChooser({ mode, onClose, onSwitch }: { mode: Mode; onClose: () => void; onSwitch: (m: Mode) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="auth-title" className="text-lg font-bold text-neutral-900">{mode === "signup" ? "Sign up" : "Sign in"}</h2>
            <p className="mt-0.5 text-sm text-neutral-500">{mode === "signup" ? "How would you like to join The Wheeler Dealers?" : "Choose your account type."}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700" aria-label="Close">✕</button>
        </div>

        {mode === "signup" ? (
          <div className="mt-5 space-y-5">
            {SIGN_UP.map((g) => (
              <div key={g.heading}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">{g.heading}</p>
                <div className="space-y-2">{g.options.map((o) => <OptionCard key={o.title} o={o} />)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 space-y-2">{SIGN_IN.map((o) => <OptionCard key={o.title} o={o} />)}</div>
        )}

        <p className="mt-5 text-center text-sm text-neutral-500">
          {mode === "signup" ? "Already have an account? " : "New to The Wheeler Dealers? "}
          <button type="button" onClick={() => onSwitch(mode === "signup" ? "signin" : "signup")} className="font-semibold text-red-600 hover:underline">
            {mode === "signup" ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>
    </div>
  );
}

function OptionCard({ o }: { o: Option }) {
  const inner = (
    <>
      <span className="text-2xl" aria-hidden>{o.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-semibold text-neutral-900">
          {o.title}
          {o.comingSoon && (
            <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neutral-400">Coming soon</span>
          )}
        </span>
        <span className="block text-xs text-neutral-500">{o.body}</span>
      </span>
      {!o.comingSoon && <span className="text-neutral-300" aria-hidden>›</span>}
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors";
  if (o.comingSoon || !o.href) {
    return (
      <div aria-disabled className={`${cls} cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60`}>
        {inner}
      </div>
    );
  }
  return (
    <a href={o.href} className={`${cls} border-neutral-200 hover:border-red-300 hover:bg-red-50/40`}>
      {inner}
    </a>
  );
}
