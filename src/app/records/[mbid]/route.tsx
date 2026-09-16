/* eslint-disable @next/next/no-img-element -- the image renderer needs <img> */
import { ImageResponse } from "next/og";
import { coverSrc } from "@/lib/cover-url";
import { loadImage, OG } from "@/lib/og";
import { RECORD_SIZES, type RecordSize } from "@/lib/record-avatar";
import { createPublicClient } from "@/lib/supabase/public";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Rings pressed into the disc, as fractions of its width. */
const GROOVES = [0.92, 0.82, 0.72, 0.62, 0.52];

function Disc({ cover, size }: { cover: string | null; size: number }) {
  const unit = size / 512;
  const circle = (diameter: number) => ({
    position: "absolute" as const,
    display: "flex",
    width: diameter,
    height: diameter,
    top: (size - diameter) / 2,
    left: (size - diameter) / 2,
    borderRadius: diameter / 2,
  });

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: size,
        height: size,
        background: OG.bg,
      }}
    >
      {/* The cover, printed across the whole disc. */}
      {cover ? (
        <img
          src={cover}
          alt=""
          width={size}
          height={size}
          style={{ ...circle(size), objectFit: "cover" }}
        />
      ) : (
        <div style={{ ...circle(size), background: OG.surface }} />
      )}

      {GROOVES.map((fraction) => (
        <div
          key={fraction}
          style={{
            ...circle(size * fraction),
            border: `${Math.max(1, 2 * unit)}px solid rgba(0, 0, 0, 0.2)`,
          }}
        />
      ))}

      {/* Light catching the vinyl. */}
      <div
        style={{
          ...circle(size),
          backgroundImage:
            "linear-gradient(135deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 64%, rgba(255,255,255,0.14) 100%)",
        }}
      />
      <div style={{ ...circle(size), border: `${10 * unit}px solid rgba(11, 11, 14, 0.9)` }} />

      {/* The centre label and spindle hole. */}
      <div
        style={{
          ...circle(size * 0.2),
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(11, 11, 14, 0.6)",
          border: `${3 * unit}px solid rgba(255, 255, 255, 0.4)`,
        }}
      >
        <div
          style={{
            display: "flex",
            width: size * 0.045,
            height: size * 0.045,
            borderRadius: size * 0.0225,
            background: OG.bg,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Somebody's Raised On album as a picture disc, for their avatar. The same
 * record looks the same for everyone, so each size is made once and cached.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ mbid: string }> },
) {
  const { mbid } = await params;
  if (!UUID.test(mbid)) return new Response("Not found", { status: 404 });

  const asked = Number(new URL(request.url).searchParams.get("s"));
  const size: RecordSize = RECORD_SIZES.includes(asked as RecordSize)
    ? (asked as RecordSize)
    : 512;

  const { data: release } = await createPublicClient()
    .from("releases")
    .select("cover_art_url")
    .eq("mbid", mbid)
    .maybeSingle();
  if (!release) return new Response("Not found", { status: 404 });

  const cover = await loadImage(coverSrc(release.cover_art_url, size <= 128 ? 250 : 500));

  return new ImageResponse(<Disc cover={cover} size={size} />, {
    width: size,
    height: size,
    headers: {
      // A record never changes, but a cover that didn't load gets another go soon.
      "Cache-Control": cover
        ? "public, max-age=604800, s-maxage=31536000, immutable"
        : "public, max-age=300",
    },
  });
}
