/* eslint-disable @next/next/no-img-element -- the image renderer needs <img> */
import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { getPublicTopPicks } from "@/lib/top-picks";
import { brandCard, loadImage, OG, ogFonts, Wordmark } from "@/lib/og";

export const alt = "A MULO profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const short = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/**
 * The card shown when somebody pastes their profile link into a message: their
 * GOAT list, crowned number one first. This is the point of the whole feature,
 * so it gets the picture rather than a row of statistics.
 *
 * Every box says how it lays its children out, including the ones holding only
 * text: the image renderer refuses anything else.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const [{ data: profile }, fonts] = await Promise.all([
    createPublicClient()
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("username", username)
      .maybeSingle(),
    ogFonts(),
  ]);

  if (!profile) return brandCard(fonts);

  const artists = await getPublicTopPicks(profile.id, "artist");
  const albums = artists.length > 0 ? [] : await getPublicTopPicks(profile.id, "album");
  const picks = (artists.length > 0 ? artists : albums).slice(0, 5);
  const round = artists.length > 0;

  const [avatar, ...covers] = await Promise.all([
    loadImage(profile.avatar_url),
    ...picks.map((pick) => loadImage(pick.image)),
  ]);

  const name = String(profile.display_name || profile.username);

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
              width={88}
              height={88}
              style={{ borderRadius: 44, objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                width: 88,
                height: 88,
                borderRadius: 44,
                background: OG.surface,
              }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 26 }}>
            <div
              style={{
                display: "flex",
                fontSize: 48,
                fontWeight: 800,
                color: OG.text,
                letterSpacing: "-0.03em",
              }}
            >
              {short(name, 26)}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 500,
                color: OG.muted,
              }}
            >
              {`@${profile.username}`}
            </div>
          </div>
        </div>

        {picks.length === 0 ? (
          <div
            style={{
              display: "flex",
              marginTop: 56,
              fontSize: 52,
              fontWeight: 800,
              color: OG.text,
              letterSpacing: "-0.03em",
              lineHeight: 1.15,
            }}
          >
            See what they are rating on MULO
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                marginTop: 40,
                fontSize: 24,
                fontWeight: 500,
                color: OG.muted,
                letterSpacing: "0.15em",
              }}
            >
              {round ? "GOAT ARTISTS" : "GOAT ALBUMS"}
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", marginTop: 26 }}>
              {picks.map((pick, i) => {
                const image = covers[i];
                const box = i === 0 ? 232 : 138;
                const frame = i === 0 ? `5px solid ${OG.gold}` : "none";

                return (
                  <div
                    key={pick.mbid}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      width: i === 0 ? 260 : 166,
                      marginLeft: i === 0 ? 0 : 12,
                    }}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        width={box}
                        height={box}
                        style={{
                          borderRadius: round ? box / 2 : 14,
                          objectFit: "cover",
                          border: frame,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          width: box,
                          height: box,
                          borderRadius: round ? box / 2 : 14,
                          background: OG.surface,
                          border: frame,
                        }}
                      />
                    )}
                    <div
                      style={{
                        display: "flex",
                        marginTop: 14,
                        fontSize: i === 0 ? 30 : 22,
                        fontWeight: 800,
                        color: i === 0 ? OG.gold : OG.muted,
                      }}
                    >
                      {String(i + 1)}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        marginTop: 2,
                        fontSize: i === 0 ? 26 : 19,
                        fontWeight: 500,
                        color: i === 0 ? OG.text : OG.secondary,
                        textAlign: "center",
                      }}
                    >
                      {short(pick.title, i === 0 ? 20 : 16)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Wordmark />
      </div>
    ),
    { ...size, fonts },
  );
}
