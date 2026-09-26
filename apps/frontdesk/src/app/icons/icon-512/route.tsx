import { ImageResponse } from "next/og";
import { IconArt } from "../icon-art";

/** The 512 "any" icon the manifest names; see `icon-192/route.tsx`. */
export function GET(): Response {
  return new ImageResponse(<IconArt size={512} maskable={false} />, {
    width: 512,
    height: 512,
    headers: { "cache-control": "public, max-age=31536000, immutable" },
  });
}
