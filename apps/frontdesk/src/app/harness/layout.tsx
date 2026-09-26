import { Badge } from "@/components/ui/badge";

/**
 * HARNESS-ONLY. The banner every harness route renders under, so a clipped
 * proof of the offline contract can never be mistaken for a screenshot of the
 * product. The harness is exempt from the session guard
 * (`src/lib/supabase/proxy.ts`); this is what the exemption looks like to a
 * human.
 */
export default function HarnessLayout({ children }: LayoutProps<"/harness">) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 border-b bg-amber-50 px-6 py-2 dark:bg-amber-950/40">
        <Badge variant="destructive">HARNESS-ONLY</Badge>
        <p className="text-sm">
          Offline-contract proof rig. No business data, no money, no session required.
        </p>
      </div>
      {children}
    </div>
  );
}
