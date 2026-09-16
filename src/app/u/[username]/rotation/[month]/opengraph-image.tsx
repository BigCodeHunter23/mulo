/* eslint-disable @next/next/no-img-element -- the image renderer needs <img> */
import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { getPublicRotation, monthLabel, MONTH_PATTERN } from "@/lib/rotation";
import { brandCard, loadImage, OG, ogFonts, Wordmark } from "@/lib/og";

export const alt = "A month of ratings on MULO";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const short = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/**
 * The card for a shared rotation link. Every box says how it lays its children
 * out, including the ones holding only text: the image renderer insists.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ username: string; month: string }>;
}) {
  const { username, month } = await params;

  const [{ data: profile }, fonts] = await Promise.all([
    createPublicClient()
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("username", username)
      .maybeSingle(),
    ogFonts(),
  ]);

  if (!profile || !MONTH_PATTERN.test(month)) return brandCard(fonts);

  const rotation = await getPublicRotation(profile.id, month);
  const picks = rotation.highlights.slice(0, 4);

  const [avatar, ...covers] = await Promise.all([
    loadImage(profile.avatar_url),
    ...picks.map((pick) => loadImage(pick.image)),
  ]);

  const name = String(profile.display_name || profile.username);
  const rated = rotation.albums + rotation.songs + rotation.artists;

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "64px 72px",
          background: OG.bg,
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {avatar ? (
            <img
              src={avatar}
              alt=""
              width={80}
              height={80}
              style={{ borderRadius: 40, objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                width: 80,
                height: 80,
                borderRadius: 40,
                background: OG.surface,
              }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 24 }}>
            <div
              style={{
                display: "flex",
                fontSize: 24,
                fontWeight: 500,
                color: OG.muted,
                letterSpacing: "0.15em",
              }}
            >
              {`${name.toUpperCase()}'S ROTATION`}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 52,
                fontWeight: 800,
                color: OG.text,
                letterSpacing: "-0.03em",
              }}
            >
              {monthLabel(month)}
            </div>
          </div>
        </div>

        {picks.length === 0 ? (
          <div
            style={{
              display: "flex",
              marginTop: 60,
              fontSize: 44,
              fontWeight: 500,
              color: OG.secondary,
            }}
          >
            Nothing rated this month yet
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-start", marginTop: 48 }}>
            {picks.map((pick, i) => {
              const image = covers[i];
              const round = pick.key.startsWith("artist-");

              return (
                <div
                  key={pick.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    width: 232,
                    marginLeft: i === 0 ? 0 : 24,
                  }}
                >
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      width={200}
                      height={200}
                      style={{
                        borderRadius: round ? 100 : 16,
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        width: 200,
                        height: 200,
                        borderRadius: round ? 100 : 16,
                        background: OG.surface,
                      }}
                    />
                  )}
                  <div
                    style={{
                      display: "flex",
                      marginTop: 16,
                      fontSize: 22,
                      fontWeight: 500,
                      color: OG.text,
                      textAlign: "center",
                    }}
                  >
                    {short(pick.title, 18)}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      marginTop: 4,
                      fontSize: 24,
                      fontWeight: 800,
                      color: OG.gold,
                    }}
                  >
                    {String(pick.score)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            display: "flex",
            marginTop: 44,
            fontSize: 28,
            fontWeight: 500,
            color: OG.secondary,
          }}
        >
          {rated > 0
            ? `${rated} rated${
                rotation.average !== null
                  ? ` · ${rotation.average.toFixed(1)} average`
                  : ""
              }`
            : "Rating music on MULO"}
        </div>

        <Wordmark />
      </div>
    ),
    { ...size, fonts },
  );
}
