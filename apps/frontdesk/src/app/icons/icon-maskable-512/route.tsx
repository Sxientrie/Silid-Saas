import { ImageResponse } from "next/og";
import { IconArt } from "../icon-art";

/**
 * The maskable icon. A launcher may crop this to a circle, a squircle, or a
 * rounded square, so the mark sits inside the platform's safe zone and the
 * background fills the frame edge to edge.
 */
export function GET(): Response {
  return new ImageResponse(<IconArt size={512} maskable />, {
    width: 512,
    height: 512,
    headers: { "cache-control": "public, max-age=31536000, immutable" },
  });
}
