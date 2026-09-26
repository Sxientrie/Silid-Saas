/**
 * The bare staff identifier mapping (spec/authentication.md §5, vault-19).
 *
 * Legacy let staff type a bare identifier that mapped to an internal address.
 * That is kept as presentation ergonomics only: this function rewrites the
 * string the sign-in form hands to Supabase's standard password sign-in and
 * nothing else. No role, no scope, and no claim is ever derived from it —
 * authorization reads `app_metadata` (spec/authentication.md §2) and RLS is
 * the boundary.
 */
export type StaffIdentifierResult =
  | { ok: true; email: string; expanded: boolean }
  | { ok: false; reason: string };

export function mapStaffIdentifier(
  identifier: string,
  staffEmailDomain: string | null | undefined,
): StaffIdentifierResult {
  const typed = identifier.trim();
  if (typed.length === 0) {
    return { ok: false, reason: "Enter your staff identifier." };
  }

  if (typed.includes("@")) {
    // Already an address. An "@" with nothing after it is a typo, not an
    // address, and is not something to guess at.
    if (!typed.endsWith("@") && typed.split("@").length === 2) {
      return { ok: true, email: typed, expanded: false };
    }
    return { ok: false, reason: "That does not look like a valid email address." };
  }

  const domain = staffEmailDomain?.trim().toLowerCase();
  if (!domain) {
    return {
      ok: false,
      reason: "This deployment has no staff email domain configured — sign in with your full email address.",
    };
  }

  return { ok: true, email: `${typed.toLowerCase()}@${domain}`, expanded: true };
}
