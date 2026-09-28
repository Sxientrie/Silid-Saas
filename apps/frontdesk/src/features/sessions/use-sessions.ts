"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { SessionView } from "@silid/schemas";
import { CROSS_DESK_POLL, deskTrpc, useDeskConnectivity } from "@/lib/trpc/desk";
import { deskDb } from "@/lib/offline/desk-db";
import { createDeskWriteSender, submitCheckIn, submitCheckOut } from "./sessions.remote";

/**
 * The sessions feature's server-cache hooks (spec/offline-sync.md §5): the
 * transactional views poll at the 15-second design interval so sessions other
 * cashiers create or close appear, and every confirmed write invalidates rooms
 * and sessions together — the server's write spans both (vault-10's
 * invalidation pairing, restated as a rule).
 */

export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: () => deskTrpc().sessions.listSessions.query({}),
    refetchInterval: CROSS_DESK_POLL,
  });
}

/** The caller's branch row — for a cashier the claim scope holds exactly one. */
export function useBranchRateConfig() {
  const query = useQuery({
    queryKey: ["branches"],
    // listBranches is a no-input procedure: the scope is claim-derived.
    queryFn: () => deskTrpc().branches.listBranches.query(undefined),
    refetchInterval: CROSS_DESK_POLL,
    staleTime: CROSS_DESK_POLL,
  });
  return query.data?.[0];
}

export interface CheckInRequestState {
  status: "idle" | "confirmed" | "queued" | "error";
  message?: string;
}

/**
 * The check-in mutation through the offline write contract: online first, a
 * durable outbox entry on transport failure. On confirmation, rooms and
 * sessions invalidate together (the server's write spans both).
 */
export function useCheckIn() {
  const queryClient = useQueryClient();
  const connectivity = useDeskConnectivity();
  const [state, setState] = useState<CheckInRequestState>({ status: "idle" });

  const sender = useMemo(() => createDeskWriteSender(deskTrpc()), []);

  const mutation = useMutation({
    mutationFn: async (input: { roomId: string; bookingType: "short_time" | "overnight"; pax: number }) =>
      submitCheckIn(input, {
        db: deskDb(),
        send: sender,
        isOnline: () => connectivity.online,
      }),
    onSuccess: async (result) => {
      if (result.status === "confirmed") {
        setState({ status: "confirmed", message: "checked in — the room is now occupied" });
      } else {
        setState({ status: "queued", message: "queued — will replay when the branch link returns" });
      }
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (error: Error) => {
      setState({ status: "error", message: error.message });
    },
  });

  useEffect(() => () => setState({ status: "idle" }), []);

  return {
    checkIn: mutation.mutateAsync,
    state,
    reset: () => setState({ status: "idle" }),
  };
}

export interface CheckOutRequestState {
  status: "idle" | "sealed" | "queued" | "error";
  sealedTotal?: string;
  message?: string;
}

/**
 * The check-out mutation: the sealing transaction runs once; the desk then
 * displays the sealed total the server returned (display-only, vault-11).
 */
export function useCheckOut() {
  const queryClient = useQueryClient();
  const connectivity = useDeskConnectivity();
  const [state, setState] = useState<CheckOutRequestState>({ status: "idle" });

  const sender = useMemo(() => createDeskWriteSender(deskTrpc()), []);

  const mutation = useMutation({
    mutationFn: async (input: { sessionId: string }) =>
      submitCheckOut(input, {
        db: deskDb(),
        send: sender,
        isOnline: () => connectivity.online,
      }),
    onSuccess: async (result) => {
      if (result.status === "confirmed") {
        setState({ status: "sealed", sealedTotal: result.total, message: "sealed by the server" });
      } else {
        setState({ status: "queued", message: "queued — will replay when the branch link returns" });
      }
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (error: Error) => {
      setState({ status: "error", message: error.message });
    },
  });

  return {
    checkOut: mutation.mutateAsync,
    state,
    reset: () => setState({ status: "idle" }),
  };
}

/** The active sessions, in the order the server returned (newest first). */
export function activeSessions(sessions: SessionView[] | undefined): SessionView[] {
  return (sessions ?? []).filter((session) => session.status === "active");
}
