/* eslint-disable @next/next/no-img-element -- the image renderer needs <img> */
import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { brandCard, loadImage, OG, ogFonts, Star, Wordmark } from "@/lib/og";

export const alt = "An album on MULO";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card shown when an album link is pasted into a message or social post:
 * cover, title, artist and MULO's overall score.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;
  const supabase = createPublicClient();

  const [{ data: release }, { data: totals }, fonts] = await Promise.all([
    supabase
      .from("releases")
      .select("title, release_date, cover_art_url, artists ( name )")
      .eq("mbid", mbid)
      .maybeSingle(),
    // Counted by the database (migration 0018), past a thousand ratings.
    supabase.rpc("score_totals", { p_kind: "album", p_mbids: [mbid] }).maybeSingle(),
    ogFonts(),
  ]);

  if (!release) return brandCard(fonts);

  const cover = await loadImage(release.cover_art_url);
  const artist = release.artists?.name ?? null;
  const year = release.release_date?.slice(0, 4) ?? null;
  const average = totals?.average ?? null;
  const votes = totals?.votes ?? 0;

  const rawTitle = release.title;
  const title = rawTitle.length > 60 ? `${rawTitle.slice(0, 57)}…` : rawTitle;
  const titleSize = title.length > 36 ? 56 : title.length > 20 ? 68 : 84;

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: 80,
          background: OG.bg,
          fontFamily: "Inter",
        }}
      >
        {cover ? (
          <img
            src={cover}
            alt=""
            width={470}
            height={470}
            style={{ borderRadius: 24, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 470,
              height: 470,
              borderRadius: 24,
              background: OG.surface,
            }}
          />
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            marginLeft: 64,
            paddingBottom: 40,
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 500,
              color: OG.muted,
              letterSpacing: "0.15em",
            }}
          >
            ALBUM
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: titleSize,
              fontWeight: 800,
              color: OG.text,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
            }}
          >
            {title}
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 34,
              fontWeight: 500,
              color: OG.secondary,
            }}
          >
            {[artist, year].filter(Boolean).join(" · ")}
          </div>

          <div style={{ display: "flex", alignItems: "center", marginTop: 44 }}>
            <Star size={44} color={average !== null ? OG.gold : OG.muted} />
            <div
              style={{
                marginLeft: 14,
                fontSize: 52,
                fontWeight: 800,
                color: OG.text,
              }}
            >
              {average !== null ? average.toFixed(1) : "—"}
            </div>
            <div
              style={{
                marginLeft: 18,
                fontSize: 28,
                fontWeight: 500,
                color: OG.muted,
              }}
            >
              {votes > 0
                ? `${votes} rating${votes === 1 ? "" : "s"} on MULO`
                : "Be the first to rate it"}
            </div>
          </div>
        </div>

        <Wordmark />
      </div>
    ),
    { ...size, fonts },
  );
}
