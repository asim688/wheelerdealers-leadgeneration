# Client Call Requirements — Inspection Marketplace (Multi-Tenant)

_Source: client call video, 2026-08-13 (~17 min, Urdu). Transcribed & analyzed 2026-08-14._

This document captures **everything the client asked for**, the **full process flow**,
the **gaps vs the current codebase**, and the **research items** agreed on the call.

---

## 1. The Big Picture

The client wants to convert the inspection module from a **single-team tool**
(admin assigns jobs to our own inspectors) into an **Uber-style marketplace**:

> Customers post inspection jobs → jobs broadcast to ALL registered inspection
> companies → first company to accept wins → that company assigns its own inspector.

Roles (client's own words):
- **Super Admin / Supervisor** = "grandparent" — sees and controls everything, never logs into anyone's account.
- **Inspection Company** = "parent" — has its own admin panel.
- **Inspector** = "child" — created and managed by their company.
- **Customer** — books and pays for inspections on our website.

---

## 2. Process Flow (step by step)

### Step A — Inspection Company Onboarding
1. Company gets a **login** created (email + mobile number). If they have a company
   email use that; otherwise whatever email they give.
2. We **assist** them creating username/password (many workshop owners are less
   literate — we help over phone / at their office).
3. After login, a **"Register" option** appears. Registration form collects:
   - Company **name**
   - Company **details**
   - Company **location** — current location OR pick via **Google Maps embed**
4. A second small form: **Point of Contact (PoC)** — the person we deal with:
   - Name, **mobile number**, **email address**
5. Company is now registered and visible in Super Admin.

### Step B — Company Admin Panel
- Each company gets its **own admin page** ("workshop admin page").
- Company admin creates **Inspector logins** itself:
  - Prefer company email for inspector; else inspector's **personal email + mobile**.
  - Inspector account is created **under the company** (parent → child).
- When an inspection job comes to the company, the **company admin assigns it to
  one of its own inspectors** (the work our admin used to do manually).

### Step C — Customer Journey
1. Customer lands on our website.
2. **Login is REQUIRED before booking** — mobile **OTP** or any method.
   - Reason (client): "we're using paid APIs, why give it free — login, then pay."
3. Customer fills booking details (existing wizard) → **pays** → booking is logged.
4. Booking instantly **shows to Super Admin** ("Kashif booked an inspection").

### Step D — Job Dispatch (Uber / InDrive style) ⭐ core feature
1. A paid booking becomes a **LIVE job**.
2. Job is **broadcast to ALL registered inspection companies** (NOT manually
   assigned — client: manual clicking for 1000 jobs is "donkey work").
3. **First company to accept wins** the job.
4. Rules the client explicitly stated:
   - **No double acceptance** — race-safe: if two accept together, whoever clicked
     first gets it (client warned this is a "programming error" area).
   - If the winning company **cancels** → job goes **LIVE again**, but the
     **canceller can never re-accept that same job** ("your loss").
   - Job stays open for a **limited time window** (duration TBD — research).
   - An **inspection date** is fixed on/with acceptance.

### Step E — WhatsApp Notification
- The moment a job goes live, send a **WhatsApp message to every company's
  Point of Contact**: e.g. *"There is a job live."*
- Client confirmed using a **third-party WhatsApp service** is fine.

### Step F — Super Admin Dashboard (tabs the client listed)
| Tab | Contents |
|-----|----------|
| **1. Companies** | Excel-like **rows view**: company → PoC → status. Per company: **jobs assigned vs jobs completed**. Click a company → full job history. Plus a **List ⇄ Map toggle**: Google Map with **pins of all companies** (like searching "hotels" on Google Maps). |
| **2. Bookings** | Every customer booking, live, as it happens. |
| **3. Customers / Jobs** | Customer-posted inspection jobs and their status. |
- Super Admin has **super rights** over everything but does **not** log into
  company/inspector accounts.

---

## 3. Gap Analysis vs Current Codebase

| # | Requirement (video) | Current state | Work needed |
|---|---------------------|---------------|-------------|
| 1 | `InspectionCompany` entity + PoC | Only `Inspector` model | New Prisma models: `InspectionCompany`, PoC fields, `Inspector.companyId` FK |
| 2 | Company admin portal | Single `/admin` + `/inspector` | New `/company` portal: register, manage inspectors, accept/assign jobs |
| 3 | Uber-style broadcast/accept | Admin assign/reassign only | Job states `LIVE → ACCEPTED → ASSIGNED → DONE`; atomic first-accept; cancel → relist + canceller exclusion list; expiry timer |
| 4 | Customer OTP login before booking | No customer accounts | Customer auth (mobile OTP) — now a MUST-have, moved up from "nice to have" |
| 5 | Payment before booking | No gateway | **BLOCKED on client's bank/payment API** (raised on call) |
| 6 | WhatsApp job-live alerts to PoC | Twilio coded, log-only | Real keys + new trigger on job-live broadcast |
| 7 | Super Admin companies tab + map view | Admin console, no companies/map | Companies stats view + Google Maps pins (client agreed: **do map LAST**) |
| 8 | Bookings visible to Super Admin | Mostly exists | Extend to new multi-tenant model |

---

## 4. Research Items (agreed on the call)

1. **Uber / InDrive dispatch formula** — how they decide which drivers see a ride
   (radius / location-based filtering) and how acceptance works. Client asked us
   to study this and report back; he suggested "show all jobs to everyone, first
   accept wins" as the baseline.
2. **Job open-time window** — how long a job stays live before expiring (TBD).
3. **Google Maps** — which API (Embed vs JavaScript vs Places), pricing/quota;
   verify before building the map view. Build **last**.
4. **WhatsApp Business API provider** — Twilio vs alternatives for PoC alerts.
5. **Race-safe acceptance** — DB-level guarantee against double-accept
   (transaction / unique constraint on job acceptance).

---

## 5. Developer Commitments & Blockers (from the call)

- ✅ Login work estimate: **1–2 days**.
- ✅ UI decisions: "leave the UI to me" (dev) — client agreed.
- ✅ Google Maps view will be done **at the end**, after core flow.
- ⛔ **Main blocker:** client's **payment / bank API** — payment flow cannot
  proceed until the client provides it (client acknowledged, said process on his
  side is strict/slow).
- 📞 Call ended mid-way ("registration part done — we'll continue next call"),
  so flows after job acceptance (inspection execution, report, payouts) follow
  the existing module until further calls.

---

## 6. What the Client Actually Said (key quotes from the video)

Timestamps = seconds into the video. Translated from Urdu.

| Time | Client's words (translated) |
|------|------------------------------|
| 01:15 | "An inspection company will have a login — email address and mobile number; whatever email they give, we create their login with it." |
| 01:37 | "Whoever their person is, consider him the company's **admin** — an admin page for that workshop." |
| 01:48 | "When an inspection comes in, **he will assign it to his own inspector** — the work we were doing before, now he does it himself." |
| 02:12 | "No sir, we will NOT log into their accounts — we do everything **from the Supervisor**. No loose ends; nobody goes into anyone's account." |
| 02:29 | "Supervisor should have a view — how many jobs were assigned, how many completed." |
| 02:39 | "The inspectors under each organization — **they hire their own**. Not our headache." |
| 02:53 | "Allow the company to **create its inspector logins itself** — company email if they have one, otherwise the inspector's personal email + mobile." |
| 03:28 | "Inspector company is the **parent**, the Supervisor above them — call it the **grandparent**. Supervisor can do anything." |
| 03:56 | "First we create their username/password with them — many people are less literate, **we'll help them**, sitting in their office or on a call." |
| 04:10 | "Then a **Register** option: company name, company location — current location or **embed Google Maps** with it." |
| 05:33 | "In registration there's a **point of contact** — which person do we contact when an inspection comes: name, mobile number, email address." |
| 07:01 | "When I click Company A, I should see **how many inspection jobs went to it** — how much work we sent, how many jobs it completed." |
| 07:26 | "Super Admin needs a **List view** and a **Map view** — like when you type 'hotels' in Google Maps and pins appear here, here, here." |
| 08:33 | "Now the **customer**: he comes from our marketing to our website, fills in his details, his **inspection gets booked**." |
| 09:11 | "When a customer books, it should **display to us** — Super Admin should see that a customer made a booking." |
| 10:12 | "**Without login we will NOT accept a booking.** Get him logged in — mobile OTP or however. We're paying for APIs; why give it free? Login, then **he pays**, payment accepted, then his booking is logged." |
| 11:10 | *(Developer)* "My **main blocker is your payment API** — the bank one. Give me that and I can process payments. Login etc. will take me 1–2 days." |
| 12:18 | "**Tab number 3** — Super Admin sees the customer put his job on my website; the inspection job has come to me." |
| 13:01 | "You've used InDrive/these apps — 'I need a ride' — **what formula do they use**: who sees the ride, and people choose to accept it. Research that." |
| 13:29 | "I think we should **show the job to everyone** — all our people and inspection companies — whoever clicks first, accepts." |
| 13:37 | "In shaa Allah our business will grow — 1000 people will come. Will you keep clicking manually for 1000? That's **donkey work** ('gadhe wala kaam')." |
| 14:05 | "Client comes, books an inspection — someone selects it, then **no one else can take it — it's fixed**. They set a date too." |
| 15:12 | "How long does the job stay **open** — number one. And **no double acceptance** — number one." |
| 15:28 | "If somebody **cancels**, the job goes **live again**." |
| 15:44 | "If two accept at the same moment — that's a **programming error** area — whoever clicked first gets it." |
| 16:08 | "You accepted then cancelled? **Your loss** — after cancelling, the **same job never comes back to you**." |
| 16:37 | "When a job comes to us, can you **integrate WhatsApp**? The point of contact they gave at registration time gets a WhatsApp message: '**There is a job live**'." |
| 16:52 | *(Developer)* "Can't send it ourselves, so we'll use a **third-party service** — the message will definitely go." — Client: "OK." |
| 17:05 | "Registration part is done up to here — **we'll connect again** for the rest." |

Full timestamped Urdu transcript: `docs/client-call-transcript-urdu.txt`

---

## 7. Suggested Build Order

1. Data model: `InspectionCompany` + PoC + `Inspector.companyId` + job states.
2. Company onboarding: login creation + registration form (+ location).
3. Company portal: inspector management + job accept/assign.
4. Customer OTP login gate before booking.
5. Job broadcast engine: live jobs, first-accept (atomic), cancel/relist +
   exclusion, expiry window.
6. WhatsApp job-live alerts to PoCs.
7. Super Admin: Companies tab (rows + stats), Bookings tab, Customers tab.
8. Payment integration (when client provides API).
9. Google Maps pins view (last).
