# MotelTrack — Software Architecture

> A real-time financial transparency system for five motel branches under one admin. Every transaction is sealed, timestamped, and made visible across all branches the moment it is recorded.

---

## Overview

MotelTrack is built as a web application backed by Supabase as the cloud database and Dexie.js as the local IndexedDB layer. An online-first strategy is followed throughout: every write is sent directly to Supabase, and Dexie is used as a read cache and an offline safety queue. The cloud database is always treated as the source of truth.

Given that each cashier station is equipped with a UPS and a backup generator is required to be activated within 15 minutes of any power failure, true offline operation is expected to be rare. The offline queue exists as a safeguard — not as a primary data path.

Real-time updates are delivered to all connected clients via Supabase Realtime over WebSocket. No page reload is required. When a check-in is recorded at any branch, the admin dashboard and all other desks subscribed to that branch are updated within approximately 200 milliseconds.

---

## Tech Stack

### Frontend — Cashier & Admin Desktops

The user interface is built with **React + Vite** and **TypeScript**. Tailwind CSS v4 is used for all styling — utility classes only, no inline styles, no hardcoded color or spacing values. Component primitives are provided by **Radix UI** (unstyled, accessible) and composed into a shared design system through **shadcn/ui**. State is managed through **Zustand** for global application state and **TanStack React Query** for server-state caching and invalidation. Date calculations are handled by **date-fns**. An Electron wrapper may optionally be applied to produce a native desktop application feel on fixed cashier stations.

### Local Database — Dexie.js (IndexedDB)

**Dexie.js v4.4** is used as the local IndexedDB wrapper. The following tables are maintained locally:

- `offline_queue` — entries queued when connectivity is unavailable
- `sessions_cache` — a local mirror of active room sessions
- `rates_cache` — branch rate configuration for offline charge calculation
- Grace-period timer state — countdown data for each active session

### Sync Layer

Connectivity is monitored via the browser's `navigator.onLine` event listener. When the connection is confirmed online, all writes are routed directly to Supabase. When connectivity is lost, writes are stored in the Dexie `offline_queue` table and the UI displays an "Offline — queued" indicator to the cashier.

A sync queue worker is responsible for draining the offline queue in order once connectivity is restored. Conflict resolution is handled through idempotent upserts keyed on `session_id`, ensuring that network hiccups do not result in duplicate entries.

### Cloud — Supabase

The cloud layer is built on **Supabase**, which provides the following:

- **PostgreSQL 15** as the primary relational database
- **Row-Level Security (RLS)** for branch isolation and role enforcement at the database level
- **Supabase Realtime** for live WebSocket broadcasts to all subscribed clients
- **Edge Functions (Deno)** for server-side charge calculation and business logic
- **pg_cron** for scheduled grace-period auto-charge jobs as a server-side backstop
- **Supabase Auth** for JWT-based authentication of cashier and admin sessions

---

## Online-First Sync Strategy

### Write Path — Online

1. A check-in, check-out, canteen sale, or add-on is submitted from the cashier desk.
2. The Supabase JS client sends an `INSERT` directly to Postgres. A server-side trigger assigns the timestamp via `now()` — no client-supplied timestamp is accepted.
3. Supabase Realtime broadcasts the new row to all clients subscribed to that branch's channel.
4. The confirmed row is upserted into the local Dexie cache. React Query invalidates the relevant queries, and the UI is updated without a page reload.

### Write Path — Offline Fallback

1. The Supabase call fails, or `navigator.onLine` is detected as `false`.
2. The row is written to the Dexie `offline_queue` table with a `client_timestamp`. The UI marks the entry as "pending sync" and the cashier is able to continue working normally.
3. Once connectivity is restored, the sync worker drains the queue in order. Each queued row is replayed to Supabase, which overwrites the `client_timestamp` with its own `now()`.
4. Duplicate detection is performed on `session_id`. If a row already exists (caused by a network hiccup), the upsert is treated as a no-op. No double entries are created.

> **Note:** Grace-period countdowns are run locally in Dexie even when the connection is unavailable. When the 25-minute timer fires, the ₱150 extension charge is queued and synced the moment connectivity is restored.

---

## Data Model

### `branches`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | TEXT | Branch name (e.g. Idol Motel) |
| `rate_config` | JSONB | Full rate table, independently configurable per branch |

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Managed by Supabase Auth |
| `email` | TEXT | Login credential |
| `role` | TEXT | `cashier` or `admin` |
| `branch_id` | UUID | Null for admin; required for cashiers |

### `rooms`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `branch_id` | UUID | Foreign key to `branches` |
| `room_number` | TEXT | Room identifier |
| `status` | TEXT | `vacant`, `occupied`, or `grace` |

### `sessions`

The core transaction table. All columns are set at creation time and are immutable thereafter.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `branch_id` | UUID | FK to `branches` |
| `room_id` | UUID | FK to `rooms` |
| `cashier_id` | UUID | FK to `users` |
| `booking_type` | TEXT | `12hr` or `3hr` |
| `pax` | INTEGER | Guest count |
| `base_rate` | NUMERIC | Calculated from rate config |
| `surcharges` | NUMERIC | Additional guest surcharges |
| `checked_in_at` | TIMESTAMPTZ | Server-assigned via trigger |
| `booked_end_at` | TIMESTAMPTZ | Calculated from check-in time + booking type |
| `checked_out_at` | TIMESTAMPTZ | Server-assigned at check-out |
| `total` | NUMERIC | Final charge including all surcharges |
| `status` | TEXT | `active`, `closed`, or `voided` |
| `void_reason` | TEXT | Populated only on admin void |

### `session_addons`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `session_id` | UUID | FK to `sessions` |
| `item` | TEXT | e.g. Towel, Pillow, Big Foam |
| `qty` | INTEGER | Quantity |
| `unit_price` | NUMERIC | From rate config at time of logging |
| `total` | NUMERIC | `unit_price × qty` |
| `added_at` | TIMESTAMPTZ | Server-assigned |
| `cashier_id` | UUID | FK to `users` |

### `canteen_sales`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `branch_id` | UUID | FK to `branches` |
| `cashier_id` | UUID | FK to `users` |
| `item` | TEXT | Product name |
| `qty` | INTEGER | Quantity sold |
| `unit_price` | NUMERIC | From rate config |
| `total` | NUMERIC | `unit_price × qty` |
| `sold_at` | TIMESTAMPTZ | Server-assigned |

### `audit_log`

An append-only table. No `UPDATE` or `DELETE` is permitted on this table for any role.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `actor_id` | UUID | The user who performed the action |
| `action` | TEXT | e.g. `void_session`, `update_rate_config` |
| `target_table` | TEXT | Affected table |
| `target_id` | UUID | Affected row |
| `old_data` | JSONB | Snapshot before the action |
| `new_data` | JSONB | Snapshot after the action |
| `ts` | TIMESTAMPTZ | Server-assigned |

### `offline_queue` (Dexie / IndexedDB only)

This table exists only in the local browser database. It is never replicated to Supabase.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Local primary key |
| `table` | TEXT | Target Supabase table |
| `payload` | JSON | Full row payload |
| `client_timestamp` | ISO string | Recorded at time of queuing |
| `synced` | BOOLEAN | Marked true after successful replay |

---

## Real-Time Flows

### Supabase Realtime Channels

Each client subscribes to a Realtime channel filtered by `branch_id`. When any row is inserted or updated in `sessions`, `canteen_sales`, `session_addons`, or `rooms`, the payload is broadcast to all subscribers on that branch channel. The admin is subscribed to all five branch channels simultaneously.

### Check-In Flow

1. A new session is submitted from the cashier desk.
2. An `INSERT` is issued into `sessions`. A Postgres trigger fires and assigns `checked_in_at = now()`. An Edge Function recalculates the total server-side — the client-supplied total is discarded.
3. The room's `status` is updated to `occupied`.
4. Supabase Realtime broadcasts the `INSERT` event to all subscribers of that branch.
5. The admin dashboard and any other subscribed desks receive the update. The room card is flipped to "Occupied" without a page reload.
6. A grace-period countdown is initialized locally in Dexie from the session's `booked_end_at`.

### Grace-Period Auto-Charge Flow

1. The Dexie timer fires at `booked_end_at + 25 minutes`.
2. An alert banner is shown to the cashier. If the guest has not yet checked out, a ₱150 extension charge is inserted into `session_addons`.
3. A `pg_cron` job running on Supabase performs the same check as a server-side backstop, ensuring the charge is applied even if the client is temporarily disconnected.
4. Supabase Realtime broadcasts the addon insert. The extension charge appears on the admin's dashboard in real time.

### Check-Out Flow

1. Check-out is initiated from the cashier desk.
2. The current time is compared against `booked_end_at`. If the grace period has not expired, no extension charge is applied. If it has expired and the charge has not yet been applied, it is applied at this point.
3. `checked_out_at` is assigned server-side. The session `status` is set to `closed`.
4. The room's `status` is returned to `vacant`.
5. Supabase Realtime broadcasts both updates. The admin's revenue total is updated instantly.

---

## Security & Roles

### Role-Based Access via Supabase RLS

Every database table is protected by Row-Level Security policies. These policies are enforced at the Postgres level — bypassing them through the frontend is not possible.

**Cashier role:**
- The JWT contains a `branch_id` claim.
- Every RLS policy on transaction tables includes a condition of `branch_id = auth.jwt()->>'branch_id'`.
- Only `SELECT` and `INSERT` operations are permitted. No `UPDATE` or `DELETE` is allowed.
- Cross-branch data is never returned, regardless of what is requested.

**Admin role:**
- The JWT contains a `role = admin` claim.
- RLS policies grant full read access across all branches when this claim is present.
- Voids are performed by inserting into `audit_log` — the original session row is not modified.
- Rate configuration may be updated per branch.

### Tamper-Proof Guarantees

| Guarantee | Enforcement |
|---|---|
| Server timestamps | A Postgres trigger sets `checked_in_at = now()` at INSERT time. Client-supplied timestamps are ignored. |
| Immutable sessions | `UPDATE` is denied for all roles on `sessions` via RLS. Sessions are write-once. |
| No deletions | `DELETE` is revoked from all roles on all transaction tables. |
| Voids are inserts | Admin voiding a session inserts a new row into `audit_log` with a mandatory written reason. The original row is unchanged. |
| Audit log permanence | `UPDATE` and `DELETE` are revoked from the admin role on `audit_log`. It is append-only. |
| Server-side charge calculation | An Edge Function recalculates the total from the branch rate config. Client-supplied totals are discarded. |

---

## Development Phases

### Phase 1 — MVP (Single Branch First)

All features below are required to be live and validated on one branch before rollout to the remaining four.

- Room check-in and check-out from a fixed desktop station
- Automatic room charge and surcharge calculation
- 25-minute grace-period countdown and auto-charge on expiry
- Canteen sales entry with item selection and quantity support
- Guest room add-on logging linked to active sessions
- Admin live dashboard across all five branches
- Per-cashier audit log with server-assigned timestamps
- Shift summary for cashier handover (room revenue, canteen, add-ons, expected cash)
- Role-based access control — admin and cashier
- Multi-branch support with per-branch rate configuration
- Offline queue and auto-sync with conflict-safe upserts

### Phase 2 — Post Stable Rollout

Once Phase 1 is stable and trusted across all five branches:

- Automated anomaly detection and alerts (activity gaps, mismatched check-in/out pairs, unusual void patterns)
- Canteen inventory tracking and low-stock alerts per branch
- Exportable reports in CSV and PDF format for accounting
- Printable shift summaries and transaction receipts
- Guest history and visit profiles
- AI-powered natural language queries (e.g. "How much did Lucky Star make last weekend?")

---

## Hardware Notes

Each cashier station is a fixed desktop computer running MotelTrack full-time. Each machine is connected to a UPS to sustain operation during the gap between a power failure and generator activation. The facility generator is required to be running within 15 minutes of any outage. Between the two layers, no station is expected to be without power long enough to lose data or interrupt operations.

---

## Directory Structure & Separation of Concerns

The codebase is organized around a strict separation of concerns. Each layer is responsible for exactly one thing: data fetching, business logic, state, or presentation. No layer is permitted to reach into another layer's responsibility. Magic numbers, hardcoded strings, and inline configuration are not permitted anywhere in the source — all values are sourced from typed constants.

### Guiding Rules

- **Pages** are routing shells only. They compose layouts and feature modules. No logic lives in a page file.
- **Features** own everything related to one domain (sessions, canteen, rooms). Each feature is self-contained: it holds its own components, hooks, services, and types.
- **Components** in `src/components/ui` are purely presentational, driven entirely by props. They have no knowledge of Supabase, Dexie, or domain types.
- **Hooks** contain all data-fetching, subscription, and derived-state logic. Components never call Supabase or Dexie directly.
- **Services** contain all read/write operations against Supabase and Dexie. Hooks call services; components never do.
- **Constants** are the single source of truth for every value that would otherwise be a magic number or hardcoded string.
- **Types** are co-located with the feature they describe. Shared types live in `src/types`.

### Full Directory Tree

```
moteltrack/
├── public/
│   └── favicon.ico
│
├── src/
│   │
│   ├── app/                          # App shell — routing, providers, global layout
│   │   ├── App.tsx                   # Root component, router outlet
│   │   ├── router.tsx                # React Router route definitions
│   │   └── providers.tsx             # QueryClientProvider, AuthProvider, ThemeProvider
│   │
│   ├── pages/                        # Route-level shells — composition only, no logic
│   │   ├── cashier/
│   │   │   ├── DashboardPage.tsx     # Cashier main view
│   │   │   ├── CheckInPage.tsx       # Check-in flow entry point
│   │   │   ├── CheckOutPage.tsx      # Check-out flow entry point
│   │   │   ├── CanteenPage.tsx       # Canteen sale entry
│   │   │   └── ShiftSummaryPage.tsx  # Pre-handover summary
│   │   ├── admin/
│   │   │   ├── DashboardPage.tsx     # Admin multi-branch live view
│   │   │   ├── AuditLogPage.tsx      # Full audit trail
│   │   │   └── RateConfigPage.tsx    # Per-branch rate management
│   │   └── auth/
│   │       └── LoginPage.tsx
│   │
│   ├── features/                     # Domain modules — one folder per bounded context
│   │   │
│   │   ├── sessions/                 # Check-in, check-out, grace period
│   │   │   ├── components/
│   │   │   │   ├── CheckInForm.tsx
│   │   │   │   ├── CheckOutConfirm.tsx
│   │   │   │   ├── GracePeriodBanner.tsx
│   │   │   │   ├── SessionCard.tsx
│   │   │   │   └── ActiveRoomGrid.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useCheckIn.ts         # Mutation: submit check-in
│   │   │   │   ├── useCheckOut.ts        # Mutation: submit check-out
│   │   │   │   ├── useActiveSessions.ts  # Query: live session list
│   │   │   │   └── useGracePeriod.ts     # Local countdown, auto-charge trigger
│   │   │   ├── services/
│   │   │   │   ├── sessions.service.ts   # Supabase reads/writes for sessions
│   │   │   │   └── sessions.local.ts     # Dexie cache ops for sessions
│   │   │   ├── utils/
│   │   │   │   └── charge.calculator.ts  # Pure fn: computes total from rate config
│   │   │   └── types.ts
│   │   │
│   │   ├── canteen/                  # Canteen sales
│   │   │   ├── components/
│   │   │   │   ├── CanteenSaleForm.tsx
│   │   │   │   ├── CanteenItemPicker.tsx
│   │   │   │   └── CanteenSaleList.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useLogCanteenSale.ts
│   │   │   │   └── useCanteenSales.ts
│   │   │   ├── services/
│   │   │   │   └── canteen.service.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── rooms/                    # Room status display
│   │   │   ├── components/
│   │   │   │   ├── RoomStatusBadge.tsx
│   │   │   │   └── RoomGrid.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useRooms.ts
│   │   │   ├── services/
│   │   │   │   └── rooms.service.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── addons/                   # Guest room add-ons
│   │   │   ├── components/
│   │   │   │   ├── AddonForm.tsx
│   │   │   │   └── AddonList.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useLogAddon.ts
│   │   │   ├── services/
│   │   │   │   └── addons.service.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── audit/                    # Audit log & void management
│   │   │   ├── components/
│   │   │   │   ├── AuditLogTable.tsx
│   │   │   │   └── VoidSessionDialog.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useAuditLog.ts
│   │   │   │   └── useVoidSession.ts
│   │   │   ├── services/
│   │   │   │   └── audit.service.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── dashboard/                # Admin live multi-branch dashboard
│   │   │   ├── components/
│   │   │   │   ├── BranchSummaryCard.tsx
│   │   │   │   ├── LiveRevenueWidget.tsx
│   │   │   │   └── CashierActivityFeed.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useBranchSummaries.ts
│   │   │   │   └── useRealtimeSubscription.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── shift/                    # Shift summary & handover
│   │   │   ├── components/
│   │   │   │   └── ShiftSummaryTable.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useShiftSummary.ts
│   │   │   ├── services/
│   │   │   │   └── shift.service.ts
│   │   │   └── types.ts
│   │   │
│   │   └── rates/                    # Per-branch rate config (admin only)
│   │       ├── components/
│   │       │   └── RateConfigForm.tsx
│   │       ├── hooks/
│   │       │   ├── useRateConfig.ts
│   │       │   └── useUpdateRateConfig.ts
│   │       ├── services/
│   │       │   └── rates.service.ts
│   │       └── types.ts
│   │
│   ├── components/                   # Shared, reusable, domain-agnostic UI
│   │   ├── ui/                       # shadcn/ui primitives (generated + customised)
│   │   │   ├── Button.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Dialog.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Label.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Separator.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── Tooltip.tsx
│   │   └── shared/                   # Composed shared components built on top of ui/
│   │       ├── AppShell.tsx          # Sidebar + topbar layout wrapper
│   │       ├── PageHeader.tsx        # Consistent page title + breadcrumb
│   │       ├── StatusDot.tsx         # Colored presence indicator (online/offline/grace)
│   │       ├── CurrencyDisplay.tsx   # Always renders ₱ with correct formatting
│   │       ├── CountdownTimer.tsx    # Generic countdown, used for grace period
│   │       ├── EmptyState.tsx        # Zero-data placeholder
│   │       ├── ErrorBoundary.tsx
│   │       ├── LoadingSpinner.tsx
│   │       ├── OfflineBanner.tsx     # Shown when navigator.onLine is false
│   │       └── ConfirmDialog.tsx     # Generic destructive-action confirmation
│   │
│   ├── hooks/                        # App-wide shared hooks
│   │   ├── useOnlineStatus.ts        # Wraps navigator.onLine + event listeners
│   │   ├── useAuth.ts                # Current user, role, branch_id from Supabase session
│   │   └── useSyncQueue.ts           # Drains offline_queue on reconnect
│   │
│   ├── lib/                          # Third-party client initialisation — one file per lib
│   │   ├── supabase.ts               # createClient — single export, used everywhere
│   │   ├── dexie.ts                  # MotelTrackDB class — schema, version, table defs
│   │   └── query-client.ts           # TanStack QueryClient instance with default options
│   │
│   ├── store/                        # Zustand global stores — one file per slice
│   │   ├── auth.store.ts             # Authenticated user, role, branch
│   │   ├── ui.store.ts               # Sidebar open, active modal, toast queue
│   │   └── sync.store.ts             # Online status, queue length, last synced at
│   │
│   ├── services/                     # App-wide service utilities (not feature-specific)
│   │   └── sync-worker.ts            # Queue drain logic, conflict resolution, retry
│   │
│   ├── constants/                    # Single source of truth — no magic values anywhere
│   │   ├── booking.constants.ts      # Booking types, durations, surcharge rules
│   │   ├── rates.constants.ts        # Default rate table (fallback before remote loads)
│   │   ├── grace.constants.ts        # Grace period duration, extension charge amount
│   │   ├── addon.constants.ts        # Addon item catalogue with prices
│   │   ├── canteen.constants.ts      # Full canteen catalogue with categories and prices
│   │   ├── roles.constants.ts        # Role string literals: CASHIER, ADMIN
│   │   ├── room.constants.ts         # Room status literals: VACANT, OCCUPIED, GRACE
│   │   ├── query-keys.constants.ts   # React Query key factory for all queries
│   │   └── routes.constants.ts       # All app route path strings
│   │
│   ├── types/                        # Shared TypeScript types used across features
│   │   ├── supabase.types.ts         # Auto-generated from Supabase CLI (`supabase gen types`)
│   │   ├── auth.types.ts             # UserRole, AuthUser, JwtClaims
│   │   └── common.types.ts           # Pagination, ApiResponse, SyncStatus
│   │
│   ├── styles/
│   │   └── globals.css               # Tailwind v4 @import, CSS custom properties, base resets
│   │
│   └── main.tsx                      # Vite entry point
│
├── supabase/
│   ├── functions/                    # Edge Functions (Deno)
│   │   ├── calculate-charge/
│   │   │   └── index.ts
│   │   └── apply-grace-charge/
│   │       └── index.ts
│   ├── migrations/                   # Versioned SQL migration files
│   │   ├── 0001_create_branches.sql
│   │   ├── 0002_create_users.sql
│   │   ├── 0003_create_rooms.sql
│   │   ├── 0004_create_sessions.sql
│   │   ├── 0005_create_session_addons.sql
│   │   ├── 0006_create_canteen_sales.sql
│   │   ├── 0007_create_audit_log.sql
│   │   ├── 0008_rls_policies.sql
│   │   └── 0009_pg_cron_grace_job.sql
│   └── seed.sql                      # Dev seed: branches, test users, sample rates
│
├── .env.local                        # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├── components.json                   # shadcn/ui config
├── tailwind.config.ts                # Tailwind v4 config (design tokens only)
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Naming Conventions

Consistent naming is enforced across the entire codebase. Deviations require an explicit comment explaining the exception.

### Files & Folders

| Kind | Convention | Example |
|---|---|---|
| React component file | `PascalCase.tsx` | `SessionCard.tsx` |
| Hook file | `camelCase.ts`, prefixed `use` | `useCheckIn.ts` |
| Service file | `camelCase.service.ts` | `sessions.service.ts` |
| Local DB service file | `camelCase.local.ts` | `sessions.local.ts` |
| Constants file | `camelCase.constants.ts` | `grace.constants.ts` |
| Utility / pure function file | `camelCase.ts` | `charge.calculator.ts` |
| Type file | `camelCase.types.ts` | `auth.types.ts` |
| Zustand store file | `camelCase.store.ts` | `auth.store.ts` |
| Folder names | `kebab-case` | `session-addons/` |

### TypeScript

| Kind | Convention | Example |
|---|---|---|
| React component | `PascalCase` function | `export function SessionCard()` |
| Hook | `camelCase`, `use` prefix | `export function useCheckIn()` |
| Type / Interface | `PascalCase` | `type BookingType`, `interface Session` |
| Enum | `SCREAMING_SNAKE_CASE` values inside `PascalCase` name | `enum RoomStatus { VACANT = 'vacant' }` |
| Constant (module-level) | `SCREAMING_SNAKE_CASE` | `export const GRACE_PERIOD_MINUTES = 25` |
| Zustand store selector | `use` + noun + `Store` | `useAuthStore`, `useSyncStore` |
| React Query key factory | `queryKeys.domain.scope()` | defined in `query-keys.constants.ts` |

### Component Props

All component props are defined as a named `type` or `interface` immediately above the component. Prop types are never inlined. Every prop that accepts a domain value (status, role, booking type) is typed against a constant or enum — never a bare `string`.

```ts
// Correct — typed against a constant enum
type RoomStatusBadgeProps = {
  status: RoomStatus        // RoomStatus.VACANT | RoomStatus.OCCUPIED | RoomStatus.GRACE
  size?: 'sm' | 'md' | 'lg'
}

// Incorrect — magic string, no type safety
type RoomStatusBadgeProps = {
  status: string            // ❌ accepts anything
}
```

---

## Separation of Concerns

Each layer has a defined responsibility. Crossing these boundaries is not permitted.

| Layer | Responsibility | Must not |
|---|---|---|
| **Page** | Compose layout + feature modules, handle route params | Contain logic, fetch data, or import from `lib/` |
| **Feature component** | Render domain UI, call feature hooks | Call services directly, import Supabase or Dexie |
| **Shared component** | Accept props, render markup with Tailwind classes | Know about domain types or Supabase |
| **Hook** | Fetch data, subscribe to Realtime, derive state | Render JSX, import from `components/` |
| **Service** | Read/write to Supabase or Dexie | Know about React, hooks, or UI state |
| **Store** | Hold global client state | Fetch data or call services |
| **Constants** | Export typed literal values | Import from any other `src/` module |
| **Types** | Define shapes, enums, unions | Contain runtime logic |

---

## Constants — No Magic Values

All values that could otherwise appear as a literal in source code are declared in `src/constants/`. Nothing is hardcoded at the point of use.

### `grace.constants.ts`

```ts
export const GRACE_PERIOD_MINUTES = 25
export const GRACE_EXTENSION_CHARGE_PHP = 150
export const GRACE_ALERT_THRESHOLD_MINUTES = 25
```

### `booking.constants.ts`

```ts
export const BOOKING_DURATION_HOURS = {
  SHORT_TIME: 3,
  OVERNIGHT:  12,
} as const

export type BookingType = keyof typeof BOOKING_DURATION_HOURS

export const PAX_SURCHARGE_RULES = {
  SHORT_TIME: {
    base_pax:                    2,
    surcharge_per_extra_pax_php: 200,
  },
  OVERNIGHT: {
    base_pax:                    4,
    surcharge_per_extra_pax_php: 300,
  },
} as const
```

### `room.constants.ts`

```ts
export const ROOM_STATUS = {
  VACANT:   'vacant',
  OCCUPIED: 'occupied',
  GRACE:    'grace',
} as const

export type RoomStatus = typeof ROOM_STATUS[keyof typeof ROOM_STATUS]
```

### `roles.constants.ts`

```ts
export const USER_ROLE = {
  CASHIER: 'cashier',
  ADMIN:   'admin',
} as const

export type UserRole = typeof USER_ROLE[keyof typeof USER_ROLE]
```

### `addon.constants.ts`

```ts
export const ADDON_ITEMS = [
  { id: 'towel',      label: 'Towel',      price_php: 20  },
  { id: 'bed_sheet',  label: 'Bed Sheet',  price_php: 20  },
  { id: 'blanket',    label: 'Blanket',    price_php: 20  },
  { id: 'pillow',     label: 'Pillow',     price_php: 50  },
  { id: 'big_foam',   label: 'Big Foam',   price_php: 300 },
  { id: 'small_foam', label: 'Small Foam', price_php: 200 },
] as const

export type AddonItemId = typeof ADDON_ITEMS[number]['id']
```

### `canteen.constants.ts`

```ts
export const CANTEEN_CATEGORIES = {
  DRINKS:  'Drinks & Beers',
  SNACKS:  'Snacks',
  NOODLES: 'Cup Noodles',
  CIGARS:  'Cigars',
  OTHERS:  'Others',
} as const

export const CANTEEN_ITEMS = [
  { id: 'bottled_water',     label: 'Bottled Water',        category: 'DRINKS',  price_php: 30  },
  { id: 'bottled_softdrink', label: 'Bottled Soft Drinks',  category: 'DRINKS',  price_php: 40  },
  { id: 'coffee',            label: 'Coffee',               category: 'DRINKS',  price_php: 30  },
  { id: 'juice_can',         label: 'Juice in Can',         category: 'DRINKS',  price_php: 70  },
  { id: 'red_bull',          label: 'Red Bull',             category: 'DRINKS',  price_php: 80  },
  { id: 'gatorade_500',      label: 'Gatorade 500ml',       category: 'DRINKS',  price_php: 80  },
  { id: 'pale_pilsen',       label: 'Pale Pilsen Bottled',  category: 'DRINKS',  price_php: 80  },
  { id: 'san_mig_light',     label: 'San Mig Light',        category: 'DRINKS',  price_php: 80  },
  { id: 'red_horse_500',     label: 'Red Horse 500ml',      category: 'DRINKS',  price_php: 90  },
  { id: 'red_horse_1l',      label: 'Red Horse 1L',         category: 'DRINKS',  price_php: 170 },
  { id: 'big_curls',         label: 'Big Curls',            category: 'SNACKS',  price_php: 60  },
  { id: 'biscuits',          label: 'Biscuits',             category: 'SNACKS',  price_php: 20  },
  { id: 'fudge_bar',         label: 'Fudge Bar',            category: 'SNACKS',  price_php: 20  },
  { id: 'spicy_bulalo',      label: 'Spicy Bulalo / Bulalo',category: 'NOODLES', price_php: 75  },
  { id: 'jiampong',          label: 'Jiampong',             category: 'NOODLES', price_php: 75  },
  { id: 'sotanghon',         label: 'Sotanghon',            category: 'NOODLES', price_php: 60  },
  { id: 'marlboro',          label: 'Marlboro',             category: 'CIGARS',  price_php: 250 },
  { id: 'trust_condom',      label: 'Trust Condom',         category: 'OTHERS',  price_php: 70  },
  { id: 'lighter',           label: 'Lighter',              category: 'OTHERS',  price_php: 20  },
  { id: 'safeguard',         label: 'Safeguard',            category: 'OTHERS',  price_php: 25  },
  { id: 'shampoo',           label: 'Shampoo / Conditioner',category: 'OTHERS',  price_php: 25  },
  { id: 'toothbrush',        label: 'Toothbrush',           category: 'OTHERS',  price_php: 30  },
  { id: 'toothpaste',        label: 'Toothpaste',           category: 'OTHERS',  price_php: 20  },
  { id: 'napkin',            label: 'Napkin',               category: 'OTHERS',  price_php: 20  },
  { id: 'drivemax_coffee',   label: 'Drivemax Coffee',      category: 'OTHERS',  price_php: 120 },
  { id: 'drivemax_capsule',  label: 'Drivemax Capsule',     category: 'OTHERS',  price_php: 170 },
] as const

export type CanteenItemId = typeof CANTEEN_ITEMS[number]['id']
```

### `query-keys.constants.ts`

```ts
export const queryKeys = {
  sessions: {
    all:    (branchId: string) => ['sessions', branchId]                    as const,
    active: (branchId: string) => ['sessions', branchId, 'active']         as const,
    byId:   (id: string)       => ['sessions', id]                         as const,
  },
  rooms: {
    all:    (branchId: string) => ['rooms', branchId]                       as const,
  },
  canteen: {
    sales:  (branchId: string) => ['canteen_sales', branchId]              as const,
  },
  shift: {
    summary: (branchId: string, cashierId: string) =>
                                  ['shift', branchId, cashierId]            as const,
  },
  rates: {
    config: (branchId: string) => ['rates', branchId]                      as const,
  },
  audit: {
    log:    (branchId: string) => ['audit_log', branchId]                  as const,
  },
}
```

### `routes.constants.ts`

```ts
export const ROUTES = {
  LOGIN:          '/login',
  CASHIER: {
    DASHBOARD:    '/cashier',
    CHECK_IN:     '/cashier/check-in',
    CHECK_OUT:    '/cashier/check-out/:sessionId',
    CANTEEN:      '/cashier/canteen',
    SHIFT:        '/cashier/shift',
  },
  ADMIN: {
    DASHBOARD:    '/admin',
    AUDIT_LOG:    '/admin/audit',
    RATE_CONFIG:  '/admin/rates',
  },
} as const
```

---

## UI Component System — Radix UI + shadcn/ui + Tailwind v4

### Philosophy

Radix UI primitives are used for all interactive elements that require accessibility (dialogs, selects, tooltips, dropdowns). shadcn/ui provides the styled layer on top of Radix — these components live in `src/components/ui/` and are treated as owned source code, not a dependency. Tailwind v4 utility classes are applied directly in the component markup. No `style={{}}` props, no CSS modules, and no hardcoded hex or pixel values outside of `tailwind.config.ts`.

### Tailwind v4 Configuration

All design tokens are declared once in `tailwind.config.ts` and referenced as utilities throughout the codebase. Raw values appear only in the config and in `globals.css`.

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'hsl(var(--color-brand))',
          muted:   'hsl(var(--color-brand-muted))',
        },
        surface: {
          DEFAULT: 'hsl(var(--color-surface))',
          raised:  'hsl(var(--color-surface-raised))',
        },
        status: {
          vacant:   'hsl(var(--color-vacant))',
          occupied: 'hsl(var(--color-occupied))',
          grace:    'hsl(var(--color-grace))',
          offline:  'hsl(var(--color-offline))',
        },
      },
      borderRadius: {
        card: 'var(--radius-card)',
      },
    },
  },
}

export default config
```

```css
/* src/styles/globals.css */
@import "tailwindcss";

:root {
  --color-brand:          220 90% 56%;
  --color-brand-muted:    220 90% 94%;
  --color-surface:        0 0% 100%;
  --color-surface-raised: 0 0% 97%;
  --color-vacant:         142 72% 45%;
  --color-occupied:       217 91% 60%;
  --color-grace:          38 92% 50%;
  --color-offline:        0 72% 51%;
  --radius-card:          0.75rem;
}
```

### Reusable Component Examples

Components are generic and prop-driven. Domain values are always passed in — never hardcoded inside the component body.

#### `RoomStatusBadge.tsx`

```tsx
import { Badge } from '@/components/ui/Badge'
import { ROOM_STATUS, type RoomStatus } from '@/constants/room.constants'

const STATUS_CONFIG: Record<RoomStatus, { label: string; className: string }> = {
  [ROOM_STATUS.VACANT]: {
    label:     'Vacant',
    className: 'bg-status-vacant/10 text-status-vacant border-status-vacant/20',
  },
  [ROOM_STATUS.OCCUPIED]: {
    label:     'Occupied',
    className: 'bg-status-occupied/10 text-status-occupied border-status-occupied/20',
  },
  [ROOM_STATUS.GRACE]: {
    label:     'Grace',
    className: 'bg-status-grace/10 text-status-grace border-status-grace/20 animate-pulse',
  },
}

type RoomStatusBadgeProps = {
  status: RoomStatus
}

export function RoomStatusBadge({ status }: RoomStatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge className={config.className}>
      {config.label}
    </Badge>
  )
}
```

#### `CurrencyDisplay.tsx`

```tsx
const PHP_LOCALE   = 'fil-PH'
const PHP_CURRENCY = 'PHP'

type CurrencyDisplayProps = {
  amount:     number
  className?: string
}

export function CurrencyDisplay({ amount, className }: CurrencyDisplayProps) {
  const formatted = new Intl.NumberFormat(PHP_LOCALE, {
    style:    'currency',
    currency: PHP_CURRENCY,
  }).format(amount)

  return <span className={className}>{formatted}</span>
}
```

#### `CountdownTimer.tsx`

```tsx
import { useEffect, useState } from 'react'

type CountdownTimerProps = {
  targetDate:  Date
  onExpire?:   () => void
  className?:  string
}

export function CountdownTimer({ targetDate, onExpire, className }: CountdownTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(
    Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000))
  )

  useEffect(() => {
    if (secondsLeft <= 0) { onExpire?.(); return }

    const interval = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { onExpire?.(); clearInterval(interval); return 0 }
        return s - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [targetDate, onExpire, secondsLeft])

  const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const seconds = (secondsLeft % 60).toString().padStart(2, '0')

  return <span className={className}>{minutes}:{seconds}</span>
}
```

#### `OfflineBanner.tsx`

```tsx
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useSyncStore }    from '@/store/sync.store'

export function OfflineBanner() {
  const isOnline    = useOnlineStatus()
  const queueLength = useSyncStore(s => s.queueLength)

  if (isOnline) return null

  return (
    <div className="flex items-center gap-2 bg-status-offline/10 border border-status-offline/20 text-status-offline text-sm px-4 py-2 rounded-card">
      <span className="size-2 rounded-full bg-status-offline" />
      <span>
        Offline — {queueLength} {queueLength === 1 ? 'entry' : 'entries'} queued for sync
      </span>
    </div>
  )
}
```

#### `ConfirmDialog.tsx`

```tsx
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Button }        from '@/components/ui/Button'

type ConfirmDialogProps = {
  open:          boolean
  onOpenChange:  (open: boolean) => void
  title:         string
  description:   string
  confirmLabel:  string
  onConfirm:     () => void
  destructive?:  boolean
}

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, onConfirm, destructive = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface rounded-card p-6 shadow-lg w-full max-w-md">
          <AlertDialog.Title className="text-base font-semibold mb-1">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-gray-500 mb-6">
            {description}
          </AlertDialog.Description>
          <div className="flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={destructive ? 'destructive' : 'default'}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
```

#### `EmptyState.tsx`

```tsx
type EmptyStateProps = {
  title:        string
  description?: string
  action?:      React.ReactNode
  className?:   string
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className ?? ''}`}>
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && (
        <p className="text-sm text-gray-500 max-w-xs">{description}</p>
      )}
      {action}
    </div>
  )
}
```

### Import Alias

All internal imports use the `@/` alias mapped to `src/`. Relative imports (`../../`) are not used outside of a feature's own folder.

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

---

*Document version 2.0 — MotelTrack Architecture — Idol Motel · Double-B · Lucky Star · Happy Nest · Bulls Eye*
