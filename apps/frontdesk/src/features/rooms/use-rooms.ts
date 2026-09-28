"use client";

import { useQuery } from "@tanstack/react-query";
import { CROSS_DESK_POLL, deskTrpc } from "@/lib/trpc/desk";

/**
 * The rooms feature's server-cache hook. The room grid renders ONLY what the
 * server reports (spec/domain-rules.md §4): no client path updates room
 * status — check-in, the scheduled escalation job, and the checkout
 * transaction are the only writers (vault-15). The 15-second poll is the
 * cross-desk freshness mechanism (spec/offline-sync.md §5).
 */
export function useRooms() {
  return useQuery({
    queryKey: ["rooms"],
    queryFn: () => deskTrpc().rooms.listRooms.query({}),
    refetchInterval: CROSS_DESK_POLL,
  });
}
