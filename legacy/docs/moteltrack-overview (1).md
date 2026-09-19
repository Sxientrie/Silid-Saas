# MotelTrack — Project Overview

> A real-time financial transparency system for five motel branches under one admin — replacing handwritten ledgers with a tamper-resistant desktop platform that tracks every peso, every transaction, and every cashier in real time.

---

## What This Project Is

MotelTrack is an internal business tool built for a group of motels operating under one admin across five separate properties — each with its own name, staff, and front desk. It replaces the current practice of manually recording all transactions in physical notebooks with a desktop application installed at every cashier station, logging every check-in, check-out, canteen sale, and add-on in real time — tied to a specific cashier, branch, and server-verified timestamp.

The five branches are:

| Branch | Name |
|--------|------|
| Branch 1 | Idol Motel |
| Branch 2 | Double-B |
| Branch 3 | Lucky Star |
| Branch 4 | Happy Nest |
| Branch 5 | Bulls Eye |

Each branch operates independently day-to-day but all report into a single admin dashboard. Cashiers only see their own branch. The admin sees all five simultaneously.

---

## Hardware & Infrastructure

Each branch has a dedicated desktop computer at the front desk running MotelTrack. The machine is fixed, always on, and always logged in under that branch — removing any personal-device excuses and ensuring the app is the only way transactions get recorded.

Power continuity is addressed at two levels. Each desktop station will be equipped with a UPS (Uninterruptible Power Supply) to bridge short outages without interruption. At the facility level, the motel operates a backup generator that security guards are required to activate within 15 minutes of any power failure. Between the UPS and the generator, desktop stations remain online through any realistic outage — meaning there is no hardware justification for a missed or unrecorded transaction.

---

## The Problem It Solves

**Manual notebooks are fragile and easily manipulated.**
Any employee can alter, lose, backdate, or fabricate entries. There is no record of who wrote what or when. A dishonest employee faces almost zero risk of being caught under the current system.

**The admin has zero live visibility across branches.**
Revenue figures are only known at end-of-day, or when someone calls in. By the time a discrepancy is discovered, the shift is over and the money is gone. There is no way to catch problems as they happen.

**No refund policy means every transaction must be airtight.**
Because there are no refunds, every peso collected must be strictly accounted for the moment it is received. Without a sealed, timestamped log there is no way to prove what was collected, by whom, and at what time.

**Check-in and check-out timing is completely untracked.**
Rooms are priced by duration. Without automatic timestamps, overstays go undetected, undercharging is easy to get away with, and there is no baseline for what revenue should have been collected on any given shift.

**Manual calculation produces errors and opportunities for theft.**
Cashiers computing room charges by hand — especially during busy periods — will make mistakes. Whether these are honest errors or intentional undercharging, the business loses money either way.

---

## What It Does

- Cashiers log guest check-ins and check-outs from a dedicated desktop at their station
- The system automatically calculates room charges based on booking type, duration, and guest count
- Canteen sales and guest add-ons are recorded as separate line items with quantity support
- Every entry is assigned a server-side timestamp and permanently linked to the cashier who created it
- Cashiers cannot delete or edit any record — only the admin can void an entry, and must supply a written reason
- The admin monitors all five branches live from their own desktop dashboard
- Entries queue locally if the internet drops and sync automatically when connection is restored

---

## Who Uses It

### Admin
The business admin who oversees all five branches. Has full read access across every branch, can void transactions with a mandatory logged reason, and uses the live dashboard to monitor revenue, active rooms, and cashier activity from a single screen — without needing to be physically present at any branch.

### Cashier
The front-desk staff at each branch. Works exclusively from the fixed desktop at their station. Can only view and create transactions for their own branch. Has no delete or edit permissions. Their identity and timestamp are permanently attached to every entry they make. Because the machine never moves from the desk, there is no ambiguity about who was on duty when any transaction was entered.

### System
Enforces rules that neither user role can override — server-side timestamps, automatic charge and surcharge calculations, grace period countdowns, offline queuing, and audit trail integrity.

---

## User Stories

### Admin

**Live dashboard across all branches**
As the admin, I want to see every branch's revenue, active rooms, and cashier activity in real time from my desktop — so I can spot discrepancies the moment they happen, not hours later.

**Audit trail per cashier**
As the admin, I want every transaction to show which cashier entered it and the exact timestamp — so I can trace any shortfall or dispute to a specific person and shift without ambiguity.

**End-of-day cash reconciliation**
As the admin, I want the system to display the expected cash on hand per branch at any point in time — so I can compare it against what the cashier physically holds during shift handover.

**Anomaly visibility**
As the admin, I want the system to flag suspicious entries — such as a check-out with no matching check-in, a gap in activity during peak hours, or a voided transaction — so I can investigate before the shift ends.

**Historical revenue reports**
As the admin, I want to view daily, weekly, and monthly revenue summaries per branch — so I can compare performance across branches, identify trends, and make informed decisions about staffing and pricing.

---

### Cashier

**Fast check-in at the desk**
As a cashier, I want to log a guest check-in in under 10 seconds on the front-desk computer — so I do not slow down the queue and the record is created before any details are forgotten.

**Automatic charge calculation**
As a cashier, I want the system to calculate the room charge automatically at check-out — so I never make a manual math error and the guest always pays the correct amount.

**Grace period alert**
As a cashier, I want the system to visibly count down the guest's 25-minute grace period and alert me when it expires — so I never forget to apply an extension charge for an overstaying guest.

**Log canteen sales with quantity**
As a cashier, I want to record canteen sales by item and quantity at any point during my shift — so every peso from the canteen is accounted for independently from room revenue.

**View active rooms**
As a cashier, I want to see which rooms in my branch are currently occupied and when each guest checked in — so I can monitor overstays and quickly answer any guest queries.

**Shift summary before handover**
As a cashier, I want to see a complete summary of my total collections — room revenue, canteen, and add-ons — before handing over to the next cashier, so I can reconcile my cash on hand with the system total.

---

### System Requirements

**Tamper-proof logging**
Every entry must receive a server-side timestamp at the moment of creation. Cashiers have no edit or delete access. The admin can void entries only with a written reason, and all voids remain visible in the audit log permanently.

**Automatic charge calculation**
The system must calculate the correct total at check-in and check-out based on booking type, guest count, duration, surcharges, and applicable grace period or extension rules — with no manual input from the cashier beyond selecting the room type and entering the guest count.

**Grace period enforcement**
The system must track the countdown from the booked end time, display a visible alert at the 25-minute mark, and automatically apply the ₱150 extension charge if the guest has not checked out by the time the grace period expires.

**Power continuity (UPS + generator)**
Each cashier station must be connected to a UPS to sustain operation during the gap between a power failure and generator activation. The facility generator is required to be running within 15 minutes of any outage. These two layers combined ensure no station is ever without power long enough to lose data or interrupt operations.

**Offline queue and auto-sync**
The system must queue all entries locally when the internet connection drops and sync them automatically and in order when the connection is restored — so no outage at any branch creates a gap in the audit trail.

**Role-based access control**
Cashiers may only view and create data for their own assigned branch. The admin account has full access to all branches. Cross-branch data must never be visible to branch-level staff.

**Per-branch rate configuration**
Each branch must be able to maintain its own rate table independently so that pricing differences between branches — if any — can be configured without affecting other branches.

---

## Rate Structure & Policies

All charges are in Philippine Peso (₱). The rate card below is based on the current Idol Motel reference and applies as the working standard. Each branch can be configured independently if rates differ.

Full payment is collected before any guest is allowed to check in — no exceptions, no partial payments.

---

### Room Rates

#### 12 Hours — Overnight

| Guests | Rate |
|--------|------|
| 2 PAX | ₱1,100 |
| 3 PAX | ₱1,400 |
| 4 PAX | ₱1,700 |
| Each additional PAX beyond 4 | +₱300 per head |

#### 3 Hours — Short Time

| Guests | Rate |
|--------|------|
| 2 PAX | ₱450 |
| Each additional PAX beyond 2 | +₱200 per head |

Short time is a flat rate covering up to 2 persons. Any additional guests beyond 2 require the cashier to enter the actual guest count so the system can apply the surcharge automatically at check-in.

#### Extension

| Type | Rate |
|------|------|
| +1 Hour | ₱150 |

---

### House Policies

**25-minute grace period**
After the guest's booked time ends, there is a 25-minute grace window. If the guest has not checked out by the end of that window, a ₱150 extension charge is applied automatically. The system displays a countdown and alerts the cashier at the start of the grace period and again when it expires.

**Full payment before check-in**
No partial payments are accepted under any circumstances. The system requires the cashier to confirm full payment has been collected before a check-in can be completed. There is no deferred payment option.

**Strictly no refund**
Once a guest has checked in and payment is recorded, the transaction is final. The system has no refund function. Only the admin can void an entry, and doing so requires a written reason that is permanently stored in the audit log.

---

### Guest Room Add-Ons

Chargeable items a guest can request during their stay. Logged as separate line items under the guest's active session.

| Item | Price |
|------|-------|
| Towel | ₱20 |
| Bed Sheet | ₱20 |
| Blanket | ₱20 |
| Pillow | ₱50 |
| Big Foam | ₱300 |
| Small Foam | ₱200 |

---

### Canteen Price List

The canteen is managed by the cashier at each branch. Sales are logged independently from room sessions — a cashier can record a canteen sale at any point during their shift regardless of whether it is linked to a specific room or guest. Each sale records the item, quantity, unit price, total, cashier, branch, and timestamp.

#### Drinks & Beers

| Item | Price |
|------|-------|
| Bottled Water | ₱30 |
| Bottled Soft Drinks | ₱40 |
| Coffee | ₱30 |
| Juice in Can | ₱70 |
| Red Bull | ₱80 |
| Gatorade 500ml | ₱80 |
| Pale Pilsen Bottled | ₱80 |
| San Mig Light Bottled | ₱80 |
| Red Horse 500ml | ₱90 |
| Red Horse 1L | ₱170 |

#### Snacks

| Item | Price |
|------|-------|
| Big Curls | ₱60 |
| Biscuits | ₱20 |
| Fudge Bar | ₱20 |

#### Cup Noodles

| Item | Price |
|------|-------|
| Spicy Bulalo / Bulalo | ₱75 |
| Jiampong | ₱75 |
| Sotanghon | ₱60 |

#### Cigars (Sold by Pack)

| Item | Price |
|------|-------|
| Marlboro | ₱250 |

#### Others

| Item | Price |
|------|-------|
| Trust Condom | ₱70 |
| Lighter | ₱20 |
| Safeguard | ₱25 |
| Shampoo / Conditioner | ₱25 |
| Toothbrush | ₱30 |
| Toothpaste | ₱20 |
| Napkin | ₱20 |
| Drivemax Coffee | ₱120 |
| Drivemax Capsule | ₱170 |

---

## Core Transaction Flows

### Room Check-In

```
Guest arrives at the front desk
  → Cashier opens a new check-in on the desktop
  → Selects room number and booking type (12 hrs or 3 hrs)
  → Enters guest count
  → System calculates total due automatically (base rate + any surcharges)
  → Cashier collects full payment from guest
  → Cashier confirms payment received and completes check-in
  → Room marked active — timestamp sealed, cashier identity recorded
  → Admin dashboard updates in real time
```

### Room Check-Out

```
Guest is ready to leave
  → Cashier initiates check-out on the desktop
  → System checks current time against booked end time
  → If within grace period: no extra charge
  → If grace period has expired: ₱150 extension charge applied automatically
  → Cashier reviews final total with guest and confirms check-out
  → Session closed — log entry sealed and immutable
  → Admin revenue total updates in real time
```

### Canteen Sale

```
Guest or walk-in requests item from the canteen
  → Cashier opens canteen sale on the desktop
  → Selects item from the list and enters quantity
  → System calculates total
  → Cashier collects payment and confirms the sale
  → Sale logged with item, quantity, amount, cashier, branch, and timestamp
  → Admin canteen revenue updates in real time
```

---

## Project Scope

### Phase 1 — MVP

One branch, one desk, fully working — before rolling out to all five.

- Room check-in and check-out from a fixed desktop station
- Automatic room charge and surcharge calculation
- 25-minute grace period countdown and auto-charge on expiry
- Canteen sales entry with quantity support
- Guest room add-on logging
- Admin live dashboard across all five branches
- Per-cashier audit log with timestamps
- Shift summary for cashier handover
- Role-based access — admin and cashier
- Multi-branch support (Idol Motel, Double-B, Lucky Star, Happy Nest, Bulls Eye)
- Per-branch rate configuration
- Offline queue and auto-sync

### Phase 2 and Beyond

Once Phase 1 is stable and trusted across all five branches:

- Automated anomaly detection and alerts (gaps, mismatches, unusual patterns)
- Canteen inventory tracking and low-stock alerts
- Exportable reports (CSV and PDF) for accounting
- Printable shift summaries and transaction receipts
- Guest history and visit profiles
- AI-powered natural language queries (e.g. "How much did Lucky Star make last weekend?")

---

## Why This Matters

The notebook does not just create inefficiency — it creates a trust problem between the admin and every cashier across all five branches. Even honest employees cannot prove their honesty under the current system. MotelTrack does not assume anyone is dishonest. It simply makes honesty the default by removing the conditions that allow dishonesty to go undetected.

Every feature in this system exists to answer one question the admin should always be able to answer:

**Where is every peso, who collected it, and when?**

---

*Document version 2.0 — MotelTrack — Idol Motel · Double-B · Lucky Star · Happy Nest · Bulls Eye*
