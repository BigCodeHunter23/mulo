/* eslint-disable @next/next/no-img-element -- the image renderer needs <img> */
import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/public";
import { coverSrc } from "@/lib/cover-url";
import { brandCard, loadImage, OG, ogFonts, Wordmark } from "@/lib/og";

export const alt = "A list of albums on MULO";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const short = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/**
 * The card for a shared list: its name, whose it is, and its first four
 * covers. Every box says how it lays its children out, including the ones
 * holding only text: the image renderer insists.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const [{ data }, fonts] = await Promise.all([
    Number.isSafeInteger(id)
      ? createPublicClient()
          .from("lists")
          .select("title, ranked, profiles ( username, display_name ), list_items ( position, releases ( cover_art_url ) )")
          .eq("id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ogFonts(),
  ]);
  if (!data) return brandCard(fonts);

  const list = data as unknown as {
    title: string;
    ranked: boolean;
    profiles: { username: string; display_name: string | null } | null;
    list_items: { position: number; releases: { cover_art_url: string | null } | null }[];
  };
  const items = [...list.list_items].sort((a, b) => a.position - b.position);
  const covers = await Promise.all(
    items.slice(0, 4).map((item) => loadImage(coverSrc(item.releases?.cover_art_url, 250))),
  );
  const name = list.profiles?.display_name || list.profiles?.username || "Someone";

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
        <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: OG.muted, letterSpacing: "0.15em" }}>
          {`${list.ranked ? "A RANKED LIST" : "A LIST"} BY ${name.toUpperCase()} · ${items.length} ALBUMS`}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 12,
            fontSize: 60,
            fontWeight: 800,
            color: OG.text,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
        >
          {short(list.title, 40)}
        </div>
        <div style={{ display: "flex", marginTop: 44 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ position: "relative", display: "flex", marginLeft: i === 0 ? 0 : 24 }}>
              {covers[i] ? (
                <img src={covers[i]!} alt="" width={240} height={240} style={{ borderRadius: 16, objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", width: 240, height: 240, borderRadius: 16, background: OG.surface }} />
              )}
              {list.ranked && covers[i] && (
                <div
                  style={{
                    position: "absolute",
                    left: 10,
                    top: 10,
                    display: "flex",
                    padding: "2px 12px",
                    borderRadius: 10,
                    background: "rgba(11,11,14,0.85)",
                    fontSize: 28,
                    fontWeight: 800,
                    color: OG.accent,
                  }}
                >
                  {String(i + 1)}
                </div>
              )}
            </div>
          ))}
        </div>
        <Wordmark />
      </div>
    ),
    { ...size, fonts },
  );
}
