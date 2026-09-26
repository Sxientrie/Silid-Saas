import { ImageResponse } from "next/og";
import { IconArt } from "../icon-art";

/**
 * HARNESS-FREE, but generated rather than checked in.
 *
 * `ImageResponse` from `next/og` rasterises the JSX at request time, which is
 * the sanctioned generator for app icons in this version of the framework
 * (`node_modules/next/dist/docs/.../app-icons.md`, `image-response.md`). A
 * hand-encoded PNG would be a binary in the diff with no reviewable source.
 *
 * The URL is explicit — `/icons/icon-192`, not the metadata convention's
 * generated `/icon?<hash>` form — so the manifest names a stable path and the
 * cache can be reasoned about.
 */
export function GET(): Response {
  return new ImageResponse(<IconArt size={192} maskable={false} />, {
    width: 192,
    height: 192,
    headers: { "cache-control": "public, max-age=31536000, immutable" },
  });
}
