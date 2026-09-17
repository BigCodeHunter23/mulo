/* eslint-disable @next/next/no-img-element -- the image renderer needs <img> */
import { ImageResponse } from "next/og";
import { artistPhotoSrc } from "@/lib/cover-url";
import { brandCard, loadImage, OG, ogFonts } from "@/lib/og";
import {
  countPicks,
  DAY_PATTERN,
  getMatchupForDay,
  getTodaysMatchup,
  sydneyDay,
} from "@/lib/versus";
import { leader, shares, type VersusSideKey } from "@/lib/versus-shared";

export const alt = "The Daily Versus on MULO";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const short = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

function Contender({
  photo,
  name,
  share,
  outcome,
}: {
  photo: string | null;
  name: string;
  share: number | null;
  outcome: "won" | "lost" | null;
}) {
  const frame = `6px solid ${outcome === "won" ? OG.gold : OG.surface}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 420,
      }}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          width={264}
          height={264}
          style={{
            borderRadius: 132,
            objectFit: "cover",
            border: frame,
            opacity: outcome === "lost" ? 0.55 : 1,
          }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            width: 264,
            height: 264,
            borderRadius: 132,
            background: OG.surface,
            border: frame,
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          marginTop: 22,
          fontSize: name.length > 16 ? 32 : 44,
          fontWeight: 800,
          color: OG.text,
          letterSpacing: "-0.03em",
        }}
      >
        {short(name, 24)}
      </div>
      {share !== null && (
        <div
          style={{
            display: "flex",
            marginTop: 2,
            fontSize: 40,
            fontWeight: 800,
            color: outcome === "won" ? OG.gold : OG.muted,
          }}
        >
          {`${share}%`}
        </div>
      )}
    </div>
  );
}

/**
 * The picture for a shared matchup: both artists face to face. While it's
 * open it asks the question; once it's closed it shows the result.
 */
export default async function Image({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  const today = sydneyDay();

  const [matchup, fonts] = await Promise.all([
    !DAY_PATTERN.test(day) || day > today
      ? Promise.resolve(null)
      : day === today
        ? getTodaysMatchup()
        : getMatchupForDay(day),
    ogFonts(),
  ]);

  if (!matchup) return brandCard(fonts);

  const closed = day < today;
  const [leftPhoto, rightPhoto, counts] = await Promise.all([
    loadImage(artistPhotoSrc(matchup.left.image, 500)),
    loadImage(artistPhotoSrc(matchup.right.image, 500)),
    closed ? countPicks(matchup.id) : Promise.resolve(null),
  ]);

  const final = counts && counts.left + counts.right > 0 ? counts : null;
  const split = final ? shares(final) : null;
  const ahead = final ? leader(final) : null;
  const outcome = (side: VersusSideKey) =>
    ahead === null ? null : ahead === side ? "won" : "lost";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "52px 72px",
          background: OG.bg,
          fontFamily: "Inter",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 800,
                color: OG.accent,
                letterSpacing: "0.16em",
              }}
            >
              DAILY VERSUS
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 6,
                fontSize: matchup.title.length > 22 ? 40 : 52,
                fontWeight: 800,
                color: OG.text,
                letterSpacing: "-0.03em",
              }}
            >
              {short(matchup.title, 32)}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 38,
              fontWeight: 800,
              color: OG.accent,
              letterSpacing: "-0.03em",
            }}
          >
            MULO
          </div>
        </div>

        {/* The pair sits in the middle of whatever height is left. */}
        <div
          style={{
            display: "flex",
            flexGrow: 1,
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexGrow: 1,
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <Contender
              photo={leftPhoto}
              name={matchup.left.name}
              share={split?.left ?? null}
              outcome={outcome("left")}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                marginTop: 82,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 110,
                  height: 110,
                  borderRadius: 55,
                  border: `4px solid ${OG.accent}`,
                  background: OG.surface,
                  fontSize: 38,
                  fontWeight: 800,
                  color: OG.accent,
                }}
              >
                VS
              </div>
              <div
                style={{
                  display: "flex",
                  marginTop: 18,
                  fontSize: 26,
                  fontWeight: 500,
                  color: OG.muted,
                }}
              >
                {closed ? "Final" : "Who you got?"}
              </div>
            </div>
            <Contender
              photo={rightPhoto}
              name={matchup.right.name}
              share={split?.right ?? null}
              outcome={outcome("right")}
            />
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
