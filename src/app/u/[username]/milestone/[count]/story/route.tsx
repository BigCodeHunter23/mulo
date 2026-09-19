import { getMilestoneCard } from "@/lib/milestone-card";
import { coverSrc } from "@/lib/cover-url";
import { loadImage, OG } from "@/lib/og";
import { short, storyResponse, Tile } from "@/lib/story";

/** The milestone as a phone-screen story: the number, huge, and the four records rated highest. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string; count: string }> },
) {
  const { username, count } = await params;
  const card = await getMilestoneCard(username, Number(count));
  if (!card) return new Response("Not found", { status: 404 });

  const picks = card.top.slice(0, 4);
  const [avatar, ...covers] = await Promise.all([
    loadImage(card.profile.avatarUrl),
    ...picks.map((pick) => loadImage(coverSrc(pick.cover, 500))),
  ]);

  return storyResponse({
    kicker: "Milestone",
    children: (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Tile src={avatar} size={96} round />
          <div style={{ display: "flex", marginLeft: 28, fontSize: 44, fontWeight: 500, color: OG.secondary }}>
            {short(card.profile.name, 24)}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 30,
            fontSize: 300,
            fontWeight: 800,
            lineHeight: 0.9,
            color: OG.gold,
            letterSpacing: "-0.06em",
          }}
        >
          {String(card.count)}
        </div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 80, fontWeight: 800, color: OG.text }}>
          albums rated
        </div>
        {card.average !== null && (
          <div style={{ display: "flex", marginTop: 16, fontSize: 40, color: OG.muted }}>
            {`${card.average.toFixed(1)} average score`}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", marginTop: 50, width: 790, alignSelf: "center" }}>
          {picks.map((pick, i) => (
            <div
              key={pick.mbid}
              style={{
                position: "relative",
                display: "flex",
                marginLeft: i % 2 === 0 ? 0 : 30,
                marginTop: i < 2 ? 0 : 30,
              }}
            >
              <Tile src={covers[i]} size={380} radius={24} />
              <div
                style={{
                  position: "absolute",
                  right: 16,
                  bottom: 16,
                  display: "flex",
                  padding: "4px 18px",
                  borderRadius: 14,
                  background: "rgba(11,11,14,0.85)",
                  fontSize: 48,
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
  });
}
