import type { AppClaims, AppRole } from "@silid/auth";

/**
 * The Frontdesk's surfaces and the roles that may open them
 * (spec/authentication.md §3, Layer 2). One table drives both the rendered
 * navigation and the proxy's route guard, so a link the guard would refuse is
 * never rendered in the first place. The guard is user experience; RLS stays
 * the boundary.
 */
export interface DeskSurface {
  href: string;
  label: string;
  roles: readonly AppRole[];
}

export interface DeskNavItem {
  href: string;
  label: string;
}

export const DESK_SURFACES: readonly DeskSurface[] = [
  { href: "/", label: "Desk", roles: ["cashier", "org_admin"] },
  { href: "/organization", label: "Organization", roles: ["org_admin"] },
];

function roleOpens(roles: readonly AppRole[], claims: AppClaims | null): boolean {
  return claims !== null && roles.includes(claims.role);
}

export function navItemsFor(claims: AppClaims | null): DeskNavItem[] {
  return DESK_SURFACES.filter((surface) => roleOpens(surface.roles, claims)).map((surface) => ({
    href: surface.href,
    label: surface.label,
  }));
}

/** A path belongs to a surface when it is that surface or lives under it. */
function belongsTo(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function canOpenSurface(pathname: string, claims: AppClaims | null): boolean {
  return DESK_SURFACES.some(
    (surface) => belongsTo(pathname, surface.href) && roleOpens(surface.roles, claims),
  );
}
