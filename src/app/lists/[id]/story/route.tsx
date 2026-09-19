import { createPublicClient } from "@/lib/supabase/public";
import { coverSrc } from "@/lib/cover-url";
import { loadImage, OG } from "@/lib/og";
import { short, storyResponse, Tile } from "@/lib/story";

const SHOWN = 5;

/** A list as a phone-screen story: its name, and its first five albums. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) return new Response("Not found", { status: 404 });

  const { data } = await createPublicClient()
    .from("lists")
    .select(
      "title, ranked, profiles ( username, display_name ), list_items ( position, releases ( title, artist_credit, cover_art_url ) )",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });

  const list = data as unknown as {
    title: string;
    ranked: boolean;
    profiles: { username: string; display_name: string | null } | null;
    list_items: {
      position: number;
      releases: { title: string; artist_credit: string | null; cover_art_url: string | null } | null;
    }[];
  };
  const items = [...list.list_items]
    .filter((item) => item.releases)
    .sort((a, b) => a.position - b.position);
  const shown = items.slice(0, SHOWN);
  const covers = await Promise.all(shown.map((item) => loadImage(coverSrc(item.releases!.cover_art_url, 250))));
  const name = list.profiles?.display_name || list.profiles?.username || "Someone";

  return storyResponse({
    kicker: `A list by ${short(name, 22)}`,
    children: (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: list.title.length > 28 ? 84 : 110,
            fontWeight: 800,
            lineHeight: 1.02,
            color: OG.text,
            letterSpacing: "-0.03em",
          }}
        >
          {short(list.title, 60)}
        </div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 38, color: OG.muted }}>
          {`${items.length} album${items.length === 1 ? "" : "s"}${list.ranked ? " · ranked" : ""}`}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 50 }}>
          {shown.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", marginTop: i === 0 ? 0 : 26 }}>
              {list.ranked && (
                <div style={{ display: "flex", width: 90, fontSize: 64, fontWeight: 800, color: OG.accent }}>
                  {String(i + 1)}
                </div>
              )}
              <Tile src={covers[i]} size={170} radius={16} />
              <div
                style={{ display: "flex", flexDirection: "column", marginLeft: 36, width: list.ranked ? 590 : 680 }}
              >
                <div style={{ display: "flex", fontSize: 46, fontWeight: 800, color: OG.text }}>
                  {short(item.releases!.title, 24)}
                </div>
                <div style={{ display: "flex", marginTop: 8, fontSize: 34, color: OG.secondary }}>
                  {short(item.releases!.artist_credit ?? "", 30)}
                </div>
              </div>
            </div>
          ))}
        </div>
        {items.length > SHOWN && (
          <div style={{ display: "flex", marginTop: 36, fontSize: 36, fontWeight: 500, color: OG.muted }}>
            {`+ ${items.length - SHOWN} more on MULO`}
          </div>
        )}
      </div>
    ),
  });
}
