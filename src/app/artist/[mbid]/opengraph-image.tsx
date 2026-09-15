/* eslint-disable @next/next/no-img-element -- the image renderer needs <img> */
import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { brandCard, loadImage, OG, ogFonts, Wordmark } from "@/lib/og";

export const alt = "An artist on MULO";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card shown when an artist link is pasted into a message or post. */
export default async function Image({
  params,
}: {
  params: Promise<{ mbid: string }>;
}) {
  const { mbid } = await params;
  const supabase = createPublicClient();

  const [{ data: artist }, { count }, fonts] = await Promise.all([
    supabase
      .from("artists")
      .select("name, image_url")
      .eq("mbid", mbid)
      .maybeSingle(),
    supabase
      .from("releases")
      .select("mbid", { count: "exact", head: true })
      .eq("artist_mbid", mbid),
    ogFonts(),
  ]);

  if (!artist) return brandCard(fonts);

  const photo = await loadImage(artist.image_url || null);
  const name = String(artist.name);
  const nameSize = name.length > 28 ? 64 : name.length > 16 ? 80 : 104;
  const albums = count ?? 0;

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
        {photo ? (
          <img
            src={photo}
            alt=""
            width={420}
            height={420}
            style={{ borderRadius: 210, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 420,
              height: 420,
              borderRadius: 210,
              background: OG.surface,
            }}
          />
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            marginLeft: 72,
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
            ARTIST
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: nameSize,
              fontWeight: 800,
              color: OG.text,
              letterSpacing: "-0.035em",
              lineHeight: 1.02,
            }}
          >
            {name}
          </div>
          {albums > 0 && (
            <div
              style={{
                marginTop: 24,
                fontSize: 34,
                fontWeight: 500,
                color: OG.secondary,
              }}
            >
              {`${albums} album${albums === 1 ? "" : "s"} to rate on MULO`}
            </div>
          )}
        </div>

        <Wordmark />
      </div>
    ),
    { ...size, fonts },
  );
}
