import { ImageResponse } from "next/og";
import { OG, ogFonts } from "@/lib/og";

const SIZES = [32, 192, 512] as const;

/** A browser-tab icon plus the sizes phones use for a home-screen app. */
export function generateImageMetadata() {
  return SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  const size = Number(await id) || 32;
  const fonts = await ogFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: OG.bg,
          borderRadius: Math.round(size * 0.22),
        }}
      >
        <div
          style={{
            fontFamily: "Inter",
            fontSize: Math.round(size * 0.66),
            fontWeight: 800,
            color: OG.accent,
            lineHeight: 1,
            letterSpacing: "-0.04em",
          }}
        >
          M
        </div>
      </div>
    ),
    { width: size, height: size, fonts },
  );
}
