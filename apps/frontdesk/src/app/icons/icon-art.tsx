/**
 * The Frontdesk's icon artwork, shared by the three generated sizes.
 *
 * Satori's subset means no grid, no `gap` shorthand surprises, and every color
 * explicit — a property Satori ignores renders as nothing at all, which is the
 * kind of thing a checked-in PNG can never do. Two shapes only: the mark and
 * the safe area a maskable icon has to keep its content inside.
 */
export function IconArt({ size, maskable }: { size: number; maskable: boolean }) {
  // A maskable icon is cropped to whatever shape the launcher uses, so the
  // mark shrinks into the middle 60% — the platform's own safe zone — and the
  // background bleeds to every edge.
  const mark = maskable ? Math.round(size * 0.42) : Math.round(size * 0.66);
  const radius = maskable ? 0 : Math.round(size * 0.22);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#09090b",
        borderRadius: radius,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: mark,
          height: mark,
          borderRadius: Math.round(mark * 0.24),
          background: "#fafafa",
          color: "#09090b",
          fontSize: Math.round(mark * 0.56),
          fontWeight: 700,
          letterSpacing: Math.round(mark * -0.04),
        }}
      >
        S
      </div>
    </div>
  );
}
