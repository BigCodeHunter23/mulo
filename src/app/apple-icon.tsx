import { ImageResponse } from "next/og";
import { OG, ogFonts } from "@/lib/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS rounds the corners itself, so this one is a full square.
export default async function AppleIcon() {
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
        }}
      >
        <div
          style={{
            fontFamily: "Inter",
            fontSize: 118,
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
    { ...size, fonts },
  );
}
