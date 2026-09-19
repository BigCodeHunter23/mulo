import { type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getPublicTopPicks, type PickKind } from "@/lib/top-picks";
import { artistPhotoSrc, coverSrc } from "@/lib/cover-url";
import { loadImage, OG } from "@/lib/og";
import { short, storyResponse, Tile } from "@/lib/story";

/**
 * Somebody's GOAT as a phone-screen story: their number one, crowned and big,
 * then the next four. `?kind=artist` for artists; albums otherwise.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const kind: PickKind = request.nextUrl.searchParams.get("kind") === "artist" ? "artist" : "album";

  const { data: profile } = await createPublicClient()
    .from("profiles")
    .select("id, username, display_name")
    .eq("username", username)
    .maybeSingle();
  if (!profile) return new Response("Not found", { status: 404 });

  const picks = (await getPublicTopPicks(String(profile.id), kind)).slice(0, 5);
  if (picks.length === 0) return new Response("Not found", { status: 404 });

  const round = kind === "artist";
  const big = (src: string | null) => (round ? artistPhotoSrc(src, 600) : coverSrc(src, 500));
  const [first, ...rest] = await Promise.all([
    loadImage(big(picks[0].image)),
    ...picks.slice(1).map((pick) => loadImage(pick.image)),
  ]);
  const name = String(profile.display_name || profile.username);

  return storyResponse({
    kicker: `${short(name, 20)}’s GOAT`,
    center: true,
    children: (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 500, color: OG.secondary }}>
          {round ? "Top artists of all time" : "Top albums of all time"}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 50,
            padding: "8px 28px",
            borderRadius: 999,
            background: OG.gold,
            fontSize: 34,
            fontWeight: 800,
            color: OG.bg,
            letterSpacing: "0.2em",
          }}
        >
          THE GOAT
        </div>
        <div style={{ display: "flex", marginTop: 30 }}>
          <Tile src={first} size={560} round={round} radius={28} />
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 70, fontWeight: 800, color: OG.gold }}>
          {short(picks[0].title, 22)}
        </div>
        {picks[0].subtitle && (
          <div style={{ display: "flex", marginTop: 8, fontSize: 40, color: OG.secondary }}>
            {short(picks[0].subtitle, 30)}
          </div>
        )}
        <div style={{ display: "flex", marginTop: 60 }}>
          {picks.slice(1).map((pick, i) => (
            <div
              key={pick.mbid}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 210,
                marginLeft: i === 0 ? 0 : 20,
              }}
            >
              <Tile src={rest[i]} size={190} round={round} radius={16} />
              <div style={{ display: "flex", marginTop: 14, fontSize: 30, fontWeight: 800, color: OG.accent }}>
                {`#${i + 2}`}
              </div>
              <div style={{ display: "flex", marginTop: 4, fontSize: 23, color: OG.text }}>
                {short(pick.title, 16)}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  });
}
