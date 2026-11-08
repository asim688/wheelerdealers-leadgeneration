"use client";

import { useState } from "react";
import Link from "next/link";
import BrandLogo from "./BrandLogo";

/** Single "Manage Inspections" sign-in for inspection companies, inspectors and account managers. */
export default function ManageInspectionsLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/partner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setError(data.error || "Sign in failed. Please try again.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mb-4 w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-red-500";

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="flex justify-center"><BrandLogo size="md" /></div>
          <h1 className="mt-4 text-xl font-bold text-neutral-900">Manage Inspections</h1>
          <p className="mt-1 text-sm text-neutral-500">Sign in with your email and password.</p>
        </div>
        <label htmlFor="mi-email" className="mb-1.5 block text-sm font-medium text-neutral-700">Email</label>
        <input id="mi-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="username" placeholder="you@company.ae" className={input} />
        <label htmlFor="mi-password" className="mb-1.5 block text-sm font-medium text-neutral-700">Password</label>
        <input id="mi-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="current-password" placeholder="••••••••" className={input} />
        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-4 text-center text-sm text-neutral-500">
          New inspection partner?{" "}
          <Link href="/company?register=1" className="font-semibold text-red-600 hover:underline">
            Apply to join
          </Link>
        </p>
        <p className="mt-3 text-center text-sm">
          <Link href="/" className="text-neutral-400 hover:text-neutral-600">← Back to site</Link>
        </p>
      </form>
    </div>
  );
}
