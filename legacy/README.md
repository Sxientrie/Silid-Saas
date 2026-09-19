# MotelTrack

**MotelTrack** is a real-time motel front-desk management system built for cashier-operated short-time and overnight booking workflows. It handles room sessions, check-in/check-out flows, canteen POS, grace-period billing, audit logging, and offline-first resilience — all from a single browser tab.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Directory Structure](#directory-structure)
- [Layer-by-Layer Breakdown](#layer-by-layer-breakdown)
- [Architectural Rules](#architectural-rules)
- [Design System](#design-system)
- [Routing & Auth](#routing--auth)
- [Feature Modules](#feature-modules)
- [State Management](#state-management)
- [Offline-First & Sync](#offline-first--sync)
- [Supabase Backend](#supabase-backend)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Dev Login Bypass](#dev-login-bypass)

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Runtime** | React | 19.2 |
| **Language** | TypeScript | 6.0 |
| **Bundler** | Vite | 8.0 |
| **Styling** | Tailwind CSS (v4, CSS-first) | 4.2 |
| **UI Primitives** | Radix UI | Latest |
| **Routing** | React Router | 7.14 |
| **Server State** | TanStack Query | 5.99 |
| **Client State** | Zustand | 5.0 |
| **Local DB** | Dexie.js (IndexedDB) | 4.4 |
| **Backend** | Supabase (Postgres + Auth + Edge Functions) | 2.103 |
| **Animation** | Motion (formerly Framer Motion) | 12.38 |
| **Icons** | Lucide React | 0.477 |


---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                        PAGES                             │
│  Pure shells — import components, zero logic             │
├──────────────────────┬──────────────────────────────────┤
│     FEATURE          │          SHARED                   │
│     COMPONENTS       │          COMPONENTS               │
│  UI + call hooks     │  AppShell, Dialog, etc.           │
├──────────────────────┴──────────────────────────────────┤
│                       HOOKS                              │
│  useAuth, useSyncQueue, feature-specific hooks           │
│  Call services ← never Supabase/Dexie directly           │
├─────────────────────────────────────────────────────────┤
│                      SERVICES                            │
│  The ONLY layer that touches Supabase or Dexie           │
│  sessions.service.ts, sessions.local.ts, etc.            │
├─────────────────────────────────────────────────────────┤
│           SUPABASE (Postgres)  ←→  DEXIE (IndexedDB)    │
│           Remote truth             Local cache/queue     │
└─────────────────────────────────────────────────────────┘
```

Data flows **down** through this stack and never skips layers. A page never imports from `lib/`. A component never calls `supabase.from()`. A hook never writes SQL.

---

## Directory Structure

```
MotelTrack/
├── docs/                                # Architecture docs & guides
│   ├── moteltrack-architecture (1).md   #   Full architecture spec
│   ├── moteltrack-overview (1).md       #   Product & feature overview
│   ├── implementation_plan.md           #   Phase-by-phase build plan
│   ├── Motion Library & Radix Integration Guide.md
│   └── Tailwind V4 Custom Utilities_ CSS-First.md
│
├── public/                              # Static assets (served as-is)
│
├── supabase/                            # Backend infrastructure
│   ├── migrations/                      #   Sequential DB schema
│   │   ├── 0001_create_branches.sql
│   │   ├── 0002_create_users.sql
│   │   ├── 0003_create_rooms.sql
│   │   ├── 0004_create_sessions.sql
│   │   ├── 0005_create_session_addons.sql
│   │   ├── 0006_create_canteen_sales.sql
│   │   ├── 0007_create_audit_log.sql
│   │   ├── 0008_rls_policies.sql
│   │   └── 0009_pg_cron_grace_job.sql
│   ├── functions/                       #   Supabase Edge Functions (Deno)
│   │   ├── apply-grace-charge/index.ts  #     Auto-charge overtime sessions
│   │   └── calculate-charge/index.ts    #     Compute booking rates + surcharges
│   └── seed.sql                         #   Dev seed data
│
├── src/
│   ├── main.tsx                         # App entrypoint + theme flash prevention
│   │
│   ├── app/                             # Application bootstrap
│   │   ├── App.tsx                      #   Root component (wraps providers)
│   │   ├── providers.tsx                #   React Query + Tooltip provider tree
│   │   └── router.tsx                   #   All route definitions + AuthGuard wiring
│   │
│   ├── pages/                           # Route-level page shells (NO logic)
│   │   ├── auth/
│   │   │   └── LoginPage.tsx            #   Secure entry with identifier mapping
│   │   ├── cashier/
│   │   │   ├── DashboardPage.tsx        #   Cashier home — room grid overview
│   │   │   ├── CheckInPage.tsx          #   New session creation form
│   │   │   ├── CheckOutPage.tsx         #   Session close + billing
│   │   │   ├── CanteenPage.tsx          #   Food/drink POS
│   │   │   └── ShiftSummaryPage.tsx     #   End-of-shift report
│   │   └── admin/
│   │       ├── DashboardPage.tsx        #   Admin analytics overview
│   │       ├── AuditLogPage.tsx         #   Tamper-proof session history
│   │       ├── RateConfigPage.tsx       #   Booking rate management
│   │       └── StaffPage.tsx            #   User & passcode management

│   │
│   ├── features/                        # Feature modules (vertical slices)
│   │   ├── sessions/                    #   Core check-in/check-out logic
│   │   │   ├── types.ts                 #     Session, CreateSessionPayload
│   │   │   ├── services/
│   │   │   │   ├── sessions.service.ts  #     Supabase CRUD (remote)
│   │   │   │   └── sessions.local.ts    #     Dexie cache (local)
│   │   │   ├── hooks/                   #     useSessions, useCreateSession, etc.
│   │   │   ├── components/              #     SessionCard, RoomGrid, etc.
│   │   │   └── utils/                   #     Duration formatters, rate calculators
│   │   ├── rooms/                       #   Room status & management
│   │   │   ├── types.ts
│   │   │   ├── services/
│   │   │   ├── hooks/
│   │   │   └── components/
│   │   ├── addons/                      #   Session add-ons (towels, etc.)
│   │   │   ├── types.ts
│   │   │   ├── services/
│   │   │   ├── hooks/
│   │   │   └── components/
│   │   ├── canteen/                     #   Canteen POS feature
│   │   │   ├── types.ts
│   │   │   ├── services/
│   │   │   ├── hooks/
│   │   │   └── components/
│   │   ├── audit/                       #   Audit trail & void operations
│   │   │   ├── types.ts
│   │   │   ├── services/
│   │   │   │   └── audit.service.ts     #     Append-only audit log queries
│   │   │   ├── hooks/
│   │   │   └── components/
│   │   ├── rates/                       #   Rate configuration management
│   │   │   ├── types.ts
│   │   │   ├── services/
│   │   │   ├── hooks/
│   │   │   └── components/
│   │   ├── shift/                       #   Shift summary & handoff
│   │   │   ├── types.ts
│   │   │   ├── services/
│   │   │   ├── hooks/
│   │   │   └── components/
│   │   └── dashboard/                   #   Dashboard analytics
│   │       ├── types.ts
│   │       ├── hooks/
│   │       └── components/
│   │
│   ├── components/
│   │   ├── ui/                          # Design system primitives (Radix wrappers)
│   │   │   ├── Badge.tsx
│   │   │   ├── Button.tsx               #   CVA-powered variant button
│   │   │   ├── Card.tsx
│   │   │   ├── Dialog.tsx               #   Motion-animated dialog (spring physics)
│   │   │   ├── Input.tsx
│   │   │   ├── Label.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Separator.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── Tooltip.tsx
│   │   └── shared/                      # App-level shared components
│   │       ├── AppShell.tsx             #   Sidebar + topbar layout shell
│   │       ├── AuthGuard.tsx            #   Role-based route protection
│   │       ├── ConfirmDialog.tsx        #   Confirm/cancel modal (motion-animated)
│   │       ├── CountdownTimer.tsx       #   Session time-remaining display
│   │       ├── CurrencyDisplay.tsx      #   Formatted ₱ currency output
│   │       ├── EmptyState.tsx           #   "No data" placeholder
│   │       ├── ErrorBoundary.tsx        #   React error catch boundary
│   │       ├── HeaderGreeting.tsx       #   Time-of-day greeting + role label
│   │       ├── LoadingSpinner.tsx       #   Full-page loading state
│   │       ├── OfflineBanner.tsx        #   "You are offline" indicator
│   │       ├── PageHeader.tsx           #   Page title + description
│   │       ├── SettingsDialog.tsx       #   Settings modal (theme toggle + about)
│   │       ├── StatusDot.tsx            #   Online/offline colored dot
│   │       ├── SystemClock.tsx          #   Live date | time | status widget
│   │       └── ThemeToggle.tsx          #   Dark/light mode switch button
│   │
│   ├── hooks/                           # App-level React hooks
│   │   ├── useAuth.ts                   #   Supabase auth session listener
│   │   ├── useOnlineStatus.ts           #   useSyncExternalStore for navigator.onLine
│   │   └── useSyncQueue.ts              #   Offline queue drain + online detection
│   │
│   ├── services/                        # App-level services
│   │   └── sync-worker.ts               #   Offline queue processor (Dexie → Supabase)
│   │
│   ├── store/                           # Zustand global stores
│   │   ├── auth.store.ts                #   User session, role, login/logout
│   │   ├── sync.store.ts                #   Online status, queue length, sync state
│   │   └── ui.store.ts                  #   Sidebar state, theme, localStorage persistence
│   │
│   ├── lib/                             # Third-party client wrappers
│   │   ├── supabase.ts                  #   Supabase client singleton
│   │   ├── dexie.ts                     #   IndexedDB schema (offline_queue, sessions_cache, etc.)
│   │   ├── query-client.ts              #   TanStack Query client config
│   │   ├── motion.ts                    #   GPU-accelerated animation presets
│   │   └── utils.ts                     #   cn() — clsx + tailwind-merge utility
│   │
│   ├── constants/                       # All magic values live here
│   │   ├── booking.constants.ts         #   SHORT_TIME, OVERNIGHT durations & rates
│   │   ├── room.constants.ts            #   Room statuses (available, occupied, etc.)
│   │   ├── roles.constants.ts           #   USER_ROLE.CASHIER, USER_ROLE.ADMIN
│   │   ├── routes.constants.ts          #   All route paths as constants
│   │   ├── addon.constants.ts           #   Add-on items & prices
│   │   ├── canteen.constants.ts         #   Canteen menu items & categories
│   │   ├── grace.constants.ts           #   Grace period duration
│   │   └── query-keys.constants.ts      #   TanStack Query key factories
│   │
│   ├── types/                           # Shared TypeScript types
│   │   ├── auth.types.ts                #   AuthUser interface
│   │   └── common.types.ts              #   ApiResponse, PaginatedResponse, SyncQueueItem
│   │
│   └── styles/
│       └── globals.css                  #   Tailwind v4 config, CSS variables, design tokens
│
├── .env.example                         # Required environment variables
├── eslint.config.js                     # ESLint flat config (TS + React + Refresh)
├── vite.config.ts                       # Vite config with React plugin + @ alias
├── tsconfig.json                        # TypeScript project references
├── tsconfig.app.json                    # App-specific TS config
├── tsconfig.node.json                   # Node/Vite TS config
└── package.json                         # Dependencies & scripts
```

---

## Layer-by-Layer Breakdown

### Pages (`src/pages/`)

Pages are **empty shells**. They import a `<PageHeader>` and feature components, nothing else. They contain zero business logic, no `useEffect`, no `fetch`, no imports from `lib/`.

```tsx
// Example: pages/cashier/DashboardPage.tsx
export function CashierDashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Room overview" />
      {/* Feature components go here */}
    </>
  )
}
```

### Features (`src/features/`)

Vertically sliced by domain. Each feature owns its own `types.ts`, `services/`, `hooks/`, and `components/`.

| Feature | Purpose |
|---|---|
| `sessions` | Core check-in/check-out lifecycle |
| `rooms` | Room status grid & management |
| `addons` | Per-session add-ons (towels, etc.) |
| `canteen` | Food/drink point-of-sale |
| `audit` | Append-only audit trail |
| `rates` | Booking rate configuration |
| `shift` | End-of-shift cashier reports |
| `dashboard` | Analytics & overview stats |

### Services (`src/features/*/services/`)

The **only** code that touches Supabase or Dexie. Two flavors:

- `*.service.ts` — Remote (Supabase): `supabase.from('sessions').select(...)` 
- `*.local.ts` — Local (Dexie): `db.sessions_cache.put(...)` for offline cache

### Hooks (`src/features/*/hooks/` and `src/hooks/`)

Hooks call services. Components call hooks. Never the reverse.

### Components (`src/components/`)

- **`ui/`** — Radix-based design system primitives (Button, Dialog, Select, etc.). Styled via Tailwind with `class-variance-authority` for variants.
- **`shared/`** — App-level components used across multiple pages (AppShell, AuthGuard, ConfirmDialog, etc.).

---

## Architectural Rules

These are **hard rules** — not guidelines. The codebase is audited against them.

| # | Rule | Enforcement |
|---|---|---|
| 1 | Pages are shells only | No logic, no data fetching, no `lib/` imports in `src/pages/` |
| 2 | Feature components call hooks only | Never `supabase` or `dexie` directly in components |
| 3 | Services are the only DB layer | Only `src/**/services/` may import from `lib/supabase` or `lib/dexie` |
| 4 | No magic values | Everything from `src/constants/` |
| 5 | No inline styles | Tailwind utilities only, zero `style=` attributes |
| 6 | Sessions are immutable | No `UPDATE` on the sessions table from the frontend. Status changes go through `supabase.rpc()` |
| 7 | Audit log is append-only | Only `INSERT` and `SELECT` — no `UPDATE`, no `DELETE` |

---

## Design System

### Color Palette

The app uses a warm-toned bento-style palette with full dark/light mode support. All values are CSS custom properties in `src/styles/globals.css`.

| Token | Light | Dark |
|---|---|---|
| Background | `#f5f2ee` | `#0c0c0b` |
| Card surface | `#ffffff` | `#111110` |
| Input | `#faf8f5` | `#131311` |
| CTA / Primary | `#cc5a2e` | `#cc5a2e` |
| Border | `#dedad4` | `#2a2927` |
| Text primary | `#1a1916` | `#f0ebe2` |
| Text muted | `#7a756e` | `#7a756e` |

### Typography

- **Font**: Nunito (sans-serif)
- **Body**: 14px / weight 400
- **Labels**: 11px
- **Headings**: weight 500

### Dimensions

- **Border radius**: 8px inputs/buttons, 10px cards
- **Border width**: 0.5px (global override)
- **Default theme**: Light mode

### Theme Switching

Managed by `ui.store.ts` → persisted to `localStorage` → applied via `.dark` class on `<html>`. Flash-prevention script in `main.tsx` applies the class before React hydrates.

All elements use a global 150ms color transition for smooth theme switching.

---

## Routing & Auth

### Route Map

| Path | Page | Role |
|---|---|---|
| `/login` | LoginPage | Public |
| `/cashier` | CashierDashboardPage | `cashier` |
| `/cashier/check-in` | CheckInPage | `cashier` |
| `/cashier/check-out/:sessionId` | CheckOutPage | `cashier` |
| `/cashier/canteen` | CanteenPage | `cashier` |
| `/cashier/shift` | ShiftSummaryPage | `cashier` |
| `/admin` | AdminDashboardPage | `admin` |
| `/admin/audit` | AuditLogPage | `admin` |
| `/admin/rates` | RateConfigPage | `admin` |
| `/admin/staff` | StaffPage | `admin` |

### Auth Guard

`AuthGuard.tsx` wraps route groups. It reads `useAuthStore` to check if the user is authenticated and has the required role. Unauthorized access redirects to `/login`.

---

## Feature Modules

### Sessions

The core domain. A **session** represents a guest's stay in a room.

- **Lifecycle**: `active` → `closed` (or `voided`)
- **Types**: `SHORT_TIME` (3 hours), `OVERNIGHT` (12 hours)
- **Immutability**: Sessions are never `UPDATE`d from the frontend. Closing is done via `supabase.rpc('close_session')`.
- **Offline**: Active sessions are cached to Dexie's `sessions_cache` table for offline access.

### Grace Period

When a session exceeds its booked end time by 25 minutes, a `pg_cron` job (via the `apply-grace-charge` Edge Function) automatically inserts an extension charge into `session_addons`.

### Canteen

A standalone POS for food/drink sales. Can optionally be linked to a session or sold independently.

### Audit Log

Every sensitive operation (void, rate change, etc.) is logged to `audit_log` with `actor_id`, `old_data`, `new_data`, and a timestamp. The table is append-only.

---

## State Management

| Store | File | Purpose |
|---|---|---|
| **Auth** | `auth.store.ts` | Current user, role, login/logout |
| **UI** | `ui.store.ts` | Sidebar open/close, theme (light/dark), `localStorage` persistence |
| **Sync** | `sync.store.ts` | Online/offline status, sync queue length, last sync timestamp |

All stores are Zustand with no middleware. The UI store syncs to `localStorage` and applies the theme class to `document.documentElement`.

---

## Offline-First & Sync

### Architecture

```
Online:   Component → Hook → Service → Supabase (direct)
Offline:  Component → Hook → Service → Dexie (enqueue) → sync-worker → Supabase (later)
```

### Dexie Tables

| Table | Purpose |
|---|---|
| `offline_queue` | Pending writes to sync (keyed by `id`, indexed by `synced`) |
| `sessions_cache` | Local copy of active sessions for offline display |
| `rates_cache` | Cached rate configs per branch |
| `grace_timers` | Local grace period tracking |

### Sync Flow

1. `useOnlineStatus` uses `useSyncExternalStore` to track `navigator.onLine`
2. When offline, writes go to `offline_queue` via `enqueueOfflineWrite()`
3. When back online, `useSyncQueue` drains the queue via `supabase.upsert()` with `onConflict: 'id'`
4. Duplicate detection prevents double entries from network hiccups

---

## Supabase Backend

### Database Schema (9 migrations)

| Migration | Table/Feature |
|---|---|
| 0001 | `branches` — Multi-location support |
| 0002 | `users` — Staff accounts with roles |
| 0003 | `rooms` — Room inventory per branch |
| 0004 | `sessions` — Booking sessions (core table) |
| 0005 | `session_addons` — Per-session charges |
| 0006 | `canteen_sales` — Canteen POS records |
| 0007 | `audit_log` — Append-only audit trail |
| 0008 | RLS policies — Row-level security per role |
| 0009 | `pg_cron` — Auto grace-period billing job |

### Edge Functions

| Function | Trigger | Purpose |
|---|---|---|
| `calculate-charge` | On demand (API call) | Computes base rate + surcharges for a booking |
| `apply-grace-charge` | `pg_cron` (every 5 min) | Finds overtime sessions and inserts extension charges |

### Row-Level Security

All tables enforce RLS. Cashiers can only read/write within their assigned branch. Admins have read access to all branches.

---

## Environment Variables

Copy `.env.example` to `.env.local`:

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

The Supabase client in `lib/supabase.ts` falls back to placeholder values in dev mode, so the app boots without a real backend.

---

## Scripts

```bash
npm run dev       # Start Vite dev server (HMR)
npm run build     # TypeScript check + production bundle
npm run lint      # ESLint (TS + React Hooks + React Refresh)
npm run preview   # Preview production build locally
```

### Build Output

```
dist/
├── index.html        0.46 kB
├── assets/
│   ├── index-*.css   36.90 kB (7.38 kB gzip)
│   └── index-*.js   400.27 kB (127.37 kB gzip)
```

---

## QA Status

| Check | Status |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run lint` | ✅ 0 errors |
| `npm run build` | ✅ Passes |
| Architecture audit | ✅ All 7 rules pass |
