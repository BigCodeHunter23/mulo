/* eslint-disable @next/next/no-img-element -- the image renderer needs <img> */
import { ImageResponse } from "next/og";
import { getMilestoneCard } from "@/lib/milestone-card";
import { coverSrc } from "@/lib/cover-url";
import { brandCard, loadImage, OG, ogFonts } from "@/lib/og";

export const alt = "A milestone on MULO";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card for a shared milestone: the number, big, and the four records
 * rated highest on the way. Every box says how it lays its children out,
 * including the ones holding only text: the image renderer insists.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ username: string; count: string }>;
}) {
  const { username, count } = await params;
  const [card, fonts] = await Promise.all([
    getMilestoneCard(username, Number(count)),
    ogFonts(),
  ]);
  if (!card) return brandCard(fonts);

  const picks = card.top.slice(0, 4);
  const [avatar, ...covers] = await Promise.all([
    loadImage(card.profile.avatarUrl),
    ...picks.map((pick) => loadImage(coverSrc(pick.cover, 250))),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "64px 72px",
          background: OG.bg,
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 440 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {avatar ? (
              <img src={avatar} alt="" width={64} height={64} style={{ borderRadius: 32, objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", width: 64, height: 64, borderRadius: 32, background: OG.surface }} />
            )}
            <div
              style={{
                display: "flex",
                marginLeft: 20,
                fontSize: 28,
                fontWeight: 500,
                color: OG.secondary,
              }}
            >
              {card.profile.name}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 200,
              fontWeight: 800,
              lineHeight: 1,
              color: OG.gold,
              letterSpacing: "-0.05em",
            }}
          >
            {String(card.count)}
          </div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 44, fontWeight: 800, color: OG.text }}>
            albums rated
          </div>
          {card.average !== null && (
            <div style={{ display: "flex", marginTop: 12, fontSize: 26, color: OG.muted }}>
              {`${card.average.toFixed(1)} average score`}
            </div>
          )}
          <div
            style={{
              display: "flex",
              marginTop: 36,
              fontSize: 38,
              fontWeight: 800,
              color: OG.accent,
              letterSpacing: "-0.03em",
            }}
          >
            MULO
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", width: 560, marginLeft: 40 }}>
          {picks.map((pick, i) => (
            <div
              key={pick.mbid}
              style={{
                position: "relative",
                display: "flex",
                width: 250,
                height: 250,
                marginLeft: i % 2 === 0 ? 0 : 24,
                marginTop: i < 2 ? 0 : 24,
              }}
            >
              {covers[i] ? (
                <img src={covers[i]!} alt="" width={250} height={250} style={{ borderRadius: 16, objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", width: 250, height: 250, borderRadius: 16, background: OG.surface }} />
              )}
              <div
                style={{
                  position: "absolute",
                  right: 10,
                  bottom: 10,
                  display: "flex",
                  padding: "2px 12px",
                  borderRadius: 10,
                  background: "rgba(11,11,14,0.85)",
                  fontSize: 30,
                  fontWeight: 800,
                  color: OG.gold,
                }}
              >
                {String(pick.score)}
              </div>
            </div>
          ))}
        </div>

      </div>
    ),
    { ...size, fonts },
  );
}
