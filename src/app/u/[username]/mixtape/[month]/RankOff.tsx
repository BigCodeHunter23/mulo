"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Crown, Sparks } from "@/components/Celebrate";
import { buttonClass } from "@/components/ui";
import { saveRankOff } from "../actions";
import Portal from "@/components/Portal";

type Contender = {
  mbid: string;
  title: string;
  subtitle: string | null;
  image: string | null;
};

function Art({ item, size }: { item: Contender; size: string }) {
  return (
    <span className={`artwork block shrink-0 overflow-hidden rounded-lg ${size}`}>
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-text-muted">
          {item.title.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/**
 * When albums or songs tie for the month's top score, a rank-off settles it:
 * two at a time, the winner stays on for the next round, and the last one
 * standing is crowned. Five tied means four taps.
 */
export default function RankOff({
  month,
  kind,
  label,
  score,
  contenders,
  settled,
  isOwner,
}: {
  month: string;
  kind: "album" | "song";
  /** "Album of the month" */
  label: string;
  score: number;
  contenders: Contender[];
  settled: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [champion, setChampion] = useState(0);
  const [challenger, setChallenger] = useState(1);
  const [winner, setWinner] = useState<Contender | null>(null);
  // The one just picked, while the tap plays out.
  const [hit, setHit] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rounds = contenders.length - 1;
  const size = `${contenders.length}-way`;

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  function start() {
    setHit(null);
    setChampion(0);
    setChallenger(1);
    setWinner(null);
    setError(null);
    setOpen(true);
  }

  function choose(index: number) {
    if (hit !== null) return;
    setHit(index);

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => {
      setHit(null);
      if (challenger >= contenders.length - 1) {
        setWinner(contenders[index]);
        return;
      }
      setChampion(index);
      setChallenger(challenger + 1);
    }, calm ? 0 : 320);
  }

  function crown() {
    if (!winner) return;
    setError(null);
    startTransition(async () => {
      const result = await saveRankOff(month, kind, winner.mbid);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!isOwner) {
    return settled ? (
      <p className="text-center text-xs text-text-muted">Won a {size} rank-off</p>
    ) : null;
  }

  return (
    <>
      {settled ? (
        <p className="text-center text-xs text-text-muted">
          Won a {size} rank-off ·{" "}
          <button
            type="button"
            onClick={start}
            className="underline-offset-4 transition-colors hover:text-text hover:underline"
          >
            Redo
          </button>
        </p>
      ) : (
        <button
          type="button"
          onClick={start}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-left transition-colors hover:bg-accent/15"
        >
          <span className="min-w-0">
            <span className="display-sm block text-sm text-text">
              {size} tie at {score}
            </span>
            <span className="block text-xs text-text-secondary">
              Rank them off for {label.toLowerCase()}
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-accent">Rank off →</span>
        </button>
      )}

      {open && (
        <Portal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${label} rank-off`}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl sm:p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                    Rank-off · {label}
                  </p>
                  <h2 className="display mt-1.5 text-2xl text-text">
                    {winner ? "Last one standing" : "Which one wins?"}
                  </h2>
                  {!winner && (
                    <p className="mt-1 text-sm text-text-secondary">
                      Round {challenger} of {rounds}. The winner stays on.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 flex gap-1" aria-hidden="true">
                {Array.from({ length: rounds }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full ${
                      winner || i < challenger - 1 ? "bg-accent" : "bg-surface-raised"
                    }`}
                  />
                ))}
              </div>

              {winner ? (
                <div className="mt-10 flex flex-col items-center text-center">
                  <div className="relative">
                    <Sparks />
                    <span className="crown-drop absolute -top-9 left-1/2 z-20 -ml-6 block">
                      <Crown className="h-12 w-12" />
                    </span>
                    <span className="winner-rise goat-crown block rounded-lg">
                      <Art item={winner} size="h-40 w-40 sm:h-48 sm:w-48" />
                    </span>
                  </div>
                  <p
                    className="winner-rise display-sm mt-5 text-lg text-text"
                    style={{ animationDelay: "0.2s" }}
                  >
                    {winner.title}
                  </p>
                  {winner.subtitle && (
                    <p className="winner-rise text-sm text-text-muted" style={{ animationDelay: "0.25s" }}>
                      {winner.subtitle}
                    </p>
                  )}
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={start}
                      disabled={pending}
                      className={buttonClass({ variant: "secondary" })}
                    >
                      Start again
                    </button>
                    <button
                      type="button"
                      onClick={crown}
                      disabled={pending}
                      className={buttonClass()}
                    >
                      {pending ? "Saving…" : "Crown it"}
                    </button>
                  </div>
                  {error && (
                    <p role="alert" className="mt-3 text-sm text-[#ffb4ae]">
                      {error}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5">
                  {[champion, challenger].map((index) => {
                    const item = contenders[index];
                    const flex = hit === index;
                    const knocked = hit !== null && hit !== index;
                    const holding = index === champion && challenger > 1;
                    return (
                      <button
                        key={`${item.mbid}-${challenger}`}
                        type="button"
                        onClick={() => choose(index)}
                        disabled={hit !== null}
                        className={`step-in group flex min-w-0 flex-col items-center gap-3 rounded-xl border bg-surface p-4 text-center transition-colors hover:border-accent sm:p-6 ${
                          flex
                            ? "match-win border-accent shadow-[0_0_40px_-8px_rgba(242,128,63,0.6)]"
                            : knocked
                              ? "match-lose border-border"
                              : "border-border"
                        }`}
                      >
                        {challenger > 1 && (
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${
                              holding ? "text-accent" : "text-text-muted"
                            }`}
                          >
                            {holding ? "Still standing" : "Challenger"}
                          </span>
                        )}
                        <Art item={item} size="h-28 w-28 sm:h-40 sm:w-40" />
                        <span className="display-sm line-clamp-2 text-sm text-text transition-colors group-hover:text-accent sm:text-base">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="-mt-2 line-clamp-1 text-xs text-text-muted">
                            {item.subtitle}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
