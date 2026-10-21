kis # The Wheeler Dealers — Project Status & 1‑Month Plan

_Last updated: 2026-07-25_

This document explains, in plain language, **what is already built**, **what is still
missing**, and a **4‑week plan** to make the platform fully live and ready for real
customers. See `docs/platform-flow.png` for a one‑page visual of how everything works.

---

## 1. What the platform is

An **AI‑powered car marketplace + vehicle inspection service** for the UAE. Four kinds
of people use it:

| User | What they do |
|------|--------------|
| **Customer / car owner** | Get an instant AI valuation, sell, buy, trade, or book an inspection. |
| **Inspector** | Do a 148‑point vehicle inspection and generate a digital report. |
| **Dealer** | Bid on cars in private live auctions. |
| **You (Admin)** | See and control everything from one dashboard. |

---

## 2. What is already DONE ✅

The core product is built and working. This is a lot of value already delivered.

**Customer website**
- Redesigned landing page with the client’s new hero artwork.
- **AI valuation** (Sell): enter VIN → decodes the car (Vincario) → prices it against
  **37,000+ real market listings** → shows a fair price range, confidence score and
  market demand.
- Option to **upload an inspection report** to get a more accurate price (AI reads the PDF).
- **Buy** (AI finds matching cars) and **Trade** (value + replacement suggestion).

**Vehicle Inspection module (all 3 parts)**
- Customer **booking wizard** (details → vehicle → location → date/time → confirm).
- **Inspector portal**: dashboard, job details with maps, **148‑point checklist** with
  photos, autosave, and **offline mode**.
- **Digital report** page for the customer (score, flagged items, photos, print/PDF).
- **Admin jobs management**: assign/reassign inspectors, track status, revenue.

**Dealer + Admin**
- Dealer portal: register → admin approval → **live auctions** → bidding.
- Admin console: **leads table** (search, filter, export), auctions, dealers,
  inspections, overview & analytics.

**Data & infrastructure**
- Market price data collected from Dubizzle, buyanycar & yallamotor (**~37,900 cars**).
- Deployed on **Vercel + Neon** (the marketplace part is live).

---

## 3. What is MISSING ⚠️ (honest gap analysis)

### A. Launch blockers — must fix before real customers use it
1. **Latest code is not live yet.** The inspection module + new landing are on the
   `feature/kashif` branch. Production (master) is older. → Needs merge + deploy.
2. **Inspection database tables not on the live server** (only on the local machine).
3. **Real notifications are OFF.** Email / SMS / WhatsApp are coded but only *log* —
   they need Resend (email) and Twilio (SMS/WhatsApp) accounts/keys.
4. **Inspection photos need storage** (Vercel Blob token not connected).
5. **No online payment** for the inspection fee — needs a gateway (Stripe or a UAE
   gateway: Telr / PayTabs / Network International).
6. **No legal pages** — Privacy Policy & Terms are legally required when collecting
   personal data and taking payments.
7. **Leaked secrets must be rotated.** Some API keys were exposed in git history and
   must be regenerated for security.
8. **No custom domain** yet (running on a vercel.app address).

### B. Important — should have soon after launch
- **SEO basics**: social share image (OG tags), favicon, sitemap, robots.txt.
- **Error monitoring** (Sentry) so we know when something breaks.
- **Automated tests** — there are currently none; add tests for the critical flows.
- **Rate limiting** is per‑server (in‑memory); move to Upstash Redis for reliability.
- **Team alerts**: notify your team by email/WhatsApp when a new lead comes in.
- **PDF export** of inspection reports and lead lists.
- **Image performance**: use Next.js optimized images.

### C. Nice to have — growth & future (the AI roadmap)
- **Arabic + right‑to‑left** language support (important for the UAE).
- **Customer accounts** (save valuations, track inspection status).
- **AI from photos**: automatic damage detection, VIN/odometer reading, paint check.
- **Real‑time auctions** (instant bid updates instead of refresh every few seconds).
- Seller payouts, reviews/ratings, referral program.

---

## 4. The 1‑Month Plan (4 weeks)

### Week 1 — Go Live 🚀
- Merge latest branch and **deploy everything to production**.
- Push inspection tables to the live database; add real inspectors.
- Connect **photo storage** (Vercel Blob).
- Turn on **real Email + SMS + WhatsApp** notifications.
- **Rotate all secrets** (security).
- Add **Privacy Policy + Terms** pages.
- Connect a **custom domain** with SSL.

### Week 2 — Payments & Trust 💳
- Integrate **online payment** for the inspection fee (gateway of your choice).
- Payment receipts + basic refund handling.
- Polish all customer messages (booking, report ready, auction updates).
- Admin: **new‑lead alerts** to your team + **PDF export** of reports.

### Week 3 — Quality & Reliability 🛡️
- **Error monitoring** (Sentry) + uptime alerts.
- Move rate‑limiting to **Redis** (safe for serverless).
- **Automated tests** for valuation, booking, login, admin.
- **Analytics** (visitors, conversions, funnels).
- **Performance pass** (optimized images, caching, speed score).

### Week 4 — Growth Features 📈
- **Arabic / RTL** localization for the UAE market.
- **Customer accounts** (save valuations & track inspections).
- First **AI‑from‑photos** feature (damage detection *or* WhatsApp lead capture).
- Optional: **real‑time** auction updates.

---

## 5. What I need from you (client) to move fast

- Accounts / API keys: **Resend** (email), **Twilio** (SMS/WhatsApp), a **payment
  gateway**, and a **domain name**.
- Budget/top‑up for paid APIs: **Vincario** VIN credits and **Gemini** AI usage.
- Decisions: which **payment gateway**, and whether we add **Arabic** now or later.

---

## 6. Is the current work “okay”? — Short answer

**Yes — the core product is solid and feature‑complete for a first version.** What
remains is mostly **“go‑live plumbing”** (deploy, payments, notifications, legal,
domain) rather than new product building. Week 1 alone gets it in front of real
customers; Weeks 2–4 make it trustworthy, measurable and ready to grow.
