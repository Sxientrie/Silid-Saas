"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * The server-cache provider for the desk's client features. A fresh
 * QueryClient per browser session: the transactional views poll at the
 * 15-second design interval and invalidate on confirmed writes
 * (spec/offline-sync.md §5), so no persistence layer is needed here.
 */
export function DeskQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: {
            // The desk's write contract (spec/offline-sync.md §2) owns the
            // offline path: online first, durable outbox entry on transport
            // failure. TanStack's own network gating must never intercept a
            // mutation — a paused mutation is a cashier staring at a form
            // that will not submit, and the outbox would stay empty.
            networkMode: "always",
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
