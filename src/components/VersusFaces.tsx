import { artistPhotoSrc } from "@/lib/cover-url";
import type { VersusMatchup, VersusSideKey } from "@/lib/versus-shared";

/**
 * Both artists in a matchup as two overlapping circles, the same size as a
 * person's avatar, so a Versus sits neatly in a list of people. Once there's
 * a winner, the other side fades back.
 */
export default function VersusFaces({
  matchup,
  winner = null,
}: {
  matchup: VersusMatchup;
  winner?: VersusSideKey | null;
}) {
  return (
    <span className="relative block h-10 w-10 shrink-0" aria-hidden="true">
      {(["left", "right"] as const).map((side) => {
        const photo = artistPhotoSrc(matchup[side].image, 120);
        const faded = winner !== null && winner !== side;
        const place = side === "left" ? "left-0 top-0" : "bottom-0 right-0 z-10";

        return photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={side}
            src={photo}
            alt=""
            loading="lazy"
            className={`absolute ${place} h-7 w-7 rounded-full object-cover object-top ring-2 ring-surface ${
              faded ? "opacity-50 grayscale" : ""
            }`}
          />
        ) : (
          <span
            key={side}
            className={`absolute ${place} flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-[11px] font-semibold text-text-secondary ring-2 ring-surface`}
          >
            {matchup[side].name.charAt(0).toUpperCase()}
          </span>
        );
      })}
    </span>
  );
}
