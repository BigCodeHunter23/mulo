/* eslint-disable @next/next/no-img-element -- the image renderer needs <img> */
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { OG, ogFonts } from "@/lib/og";

/**
 * Phone-screen share images: 1080 × 1920, the shape Instagram and TikTok
 * stories use, so a milestone, a list or a GOAT fills the screen instead of
 * sitting as a small strip in the middle of it.
 *
 * Every story shares one frame: a kicker at the top, the content, and MULO at
 * the foot. Like the link previews, every box says how it lays out its
 * children, including the ones holding only text: the renderer insists.
 */

export const STORY = { width: 1080, height: 1920 } as const;

export function short(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function storyResponse({
  kicker,
  children,
  center = false,
}: {
  kicker: string;
  children: ReactNode;
  /** Sit the content in the middle of the screen rather than under the kicker. */
  center?: boolean;
}) {
  const fonts = await ogFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "150px 90px 130px",
          background: `linear-gradient(180deg, #1c1410 0%, ${OG.bg} 45%, ${OG.bg} 100%)`,
          fontFamily: "Inter",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 800,
            color: OG.accent,
            letterSpacing: "0.25em",
          }}
        >
          {kicker.toUpperCase()}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            marginTop: 40,
            marginBottom: 40,
            justifyContent: center ? "center" : "flex-start",
          }}
        >
          {children}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: OG.muted }}>
            Rate it on MULO
          </div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: OG.accent, letterSpacing: "-0.03em" }}>
            MULO
          </div>
        </div>
      </div>
    ),
    {
      ...STORY,
      fonts,
      headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" },
    },
  );
}

/** A cover or photo, or a plain tile when there isn't one. */
export function Tile({
  src,
  size,
  round = false,
  radius = 20,
}: {
  src: string | null;
  size: number;
  round?: boolean;
  radius?: number;
}) {
  const borderRadius = round ? size / 2 : radius;
  return src ? (
    <img src={src} alt="" width={size} height={size} style={{ borderRadius, objectFit: "cover" }} />
  ) : (
    <div style={{ display: "flex", width: size, height: size, borderRadius, background: OG.surface }} />
  );
}
