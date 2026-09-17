"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { castVote } from "@/app/versus/actions";
import { artistPhotoSrc } from "@/lib/cover-url";
import {
  leader,
  shares,
  SIDES,
  type VersusPerson,
  type VersusSide,
  type VersusSideKey,
  type VersusTally,
  type VersusView,
} from "@/lib/versus-shared";
import Avatar from "@/components/Avatar";
import Countdown from "@/components/Countdown";
import { buttonClass } from "@/components/ui";

function VsMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`clash-bang pointer-events-none flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-bg text-[11px] font-extrabold tracking-wide text-accent shadow-lg sm:h-11 sm:w-11 sm:text-xs ${className}`}
    >
      VS
    </span>
  );
}

/** A number that counts up from zero, drawn by CSS so the page needs no script for it. */
function Count({ value }: { value: number }) {
  return (
    <>
      <span aria-hidden="true" className="count-up" style={{ "--count": value } as React.CSSProperties} />
      <span className="sr-only">{value}</span>
    </>
  );
}

function PickedBy({ artist, people }: { artist: string; people: VersusPerson[] }) {
  const shown = people.slice(0, 5);

  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium uppercase tracking-wider text-text-muted">
        Picked {artist}
      </p>
      {people.length === 0 && (
        <p className="mt-2 text-sm text-text-muted">Nobody you follow</p>
      )}
      <ul className="mt-2 flex flex-col gap-2">
        {shown.map((person) => {
          const name = person.display_name || person.username;
          return (
            <li key={person.username}>
              <Link
                href={`/u/${person.username}`}
                className="flex min-w-0 items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text"
              >
                <Avatar url={person.avatar_url} name={name} size="sm" />
                <span className="truncate">{name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {people.length > shown.length && (
        <p className="mt-2 text-xs text-text-muted">
          and {people.length - shown.length} more
        </p>
      )}
    </div>
  );
}

function Faces({ people }: { people: VersusPerson[] }) {
  const shown = people.slice(0, 4);
  const names = people.map((person) => person.display_name || person.username);

  return (
    <span className="mt-2 flex items-center justify-center" title={names.join(", ")}>
      <span className="flex -space-x-2">
        {shown.map((person) => (
          <span key={person.username} className="block rounded-full ring-2 ring-surface">
            <Avatar
              url={person.avatar_url}
              name={person.display_name || person.username}
              size="sm"
            />
          </span>
        ))}
      </span>
      {people.length > shown.length && (
        <span className="ml-1.5 text-[11px] text-text-muted">
          +{people.length - shown.length}
        </span>
      )}
    </span>
  );
}

function Photo({
  artist,
  compact,
  mine,
  faded,
  hover,
  punch = false,
  children,
}: {
  artist: VersusSide;
  compact: boolean;
  mine: boolean;
  faded: boolean;
  hover: boolean;
  /** Just picked: land it with a punch. */
  punch?: boolean;
  children?: React.ReactNode;
}) {
  const src = artistPhotoSrc(artist.image, compact ? 240 : 640);

  return (
    <span
      className={`artwork relative block overflow-hidden ring-2 transition ${
        compact
          ? "mx-auto h-20 w-20 rounded-full sm:h-24 sm:w-24"
          : "aspect-[4/5] w-full rounded-2xl"
      } ${mine ? "ring-accent" : "ring-transparent"} ${
        hover ? "group-hover:ring-accent/60" : ""
      } ${punch ? "pick-punch" : ""}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className={`h-full w-full object-cover object-[50%_20%] transition duration-500 ${
            faded ? "opacity-50 grayscale" : ""
          } ${hover ? "group-hover:scale-[1.04]" : ""}`}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-text-muted">
          {artist.name.charAt(0).toUpperCase()}
        </span>
      )}
      {children}
    </span>
  );
}

/**
 * The Daily Versus: two artists, one pick. The split stays hidden until you
 * pick, then shows alongside how the people you follow went. The full size
 * fills the Versus page; the compact one sits at the top of the feed.
 */
export default function VersusCard({
  view,
  compact = false,
}: {
  view: VersusView;
  compact?: boolean;
}) {
  const [picked, setPicked] = useState<{ mine: VersusSideKey; tally: VersusTally } | null>(
    null,
  );
  const [choosing, setChoosing] = useState<VersusSideKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { matchup, closed } = view;
  const mine = picked?.mine ?? view.mine;
  const tally = picked?.tally ?? view.tally;
  const canPick = view.signedIn && !closed && mine === null;

  const split = tally ? shares(tally) : null;
  const ahead = tally ? leader(tally) : null;

  function pick(side: VersusSideKey) {
    if (!canPick || pending) return;
    setChoosing(side);
    setError(null);

    startTransition(async () => {
      const result = await castVote(matchup.id, side);
      if (result.mine && result.tally) setPicked({ mine: result.mine, tally: result.tally });
      if (!result.ok) setError(result.error);
      setChoosing(null);
    });
  }

  function contender(side: VersusSideKey) {
    const artist = matchup[side];
    const isMine = mine === side;
    // Only fade the other side once it's final, not while it can still turn.
    const faded = closed && ahead !== null && ahead !== side;
    const share = split?.[side];
    const friends = tally?.friends[side] ?? [];

    const body = compact ? (
      <>
        <Photo artist={artist} compact mine={isMine} faded={faded} hover={canPick} punch={isMine && picked !== null} />
        <span className="display-sm mt-2 block w-full truncate text-sm text-text">
          {artist.name}
        </span>
        {canPick && (
          <span
            className={`${buttonClass({
              variant: choosing === side ? "primary" : "secondary",
              size: "sm",
            })} mt-2.5 w-full max-w-[8rem] group-hover:border-accent/60`}
          >
            {choosing === side ? "Locking in…" : "Pick"}
          </span>
        )}
        {share !== undefined && (
          <span
            className={`display mt-1 block text-xl tabular-nums ${
              ahead === side ? "text-accent" : "text-text-secondary"
            }`}
          >
            <Count value={share} />%
          </span>
        )}
        {isMine && <span className="block text-[11px] font-medium text-accent">Your pick</span>}
        {friends.length > 0 && <Faces people={friends} />}
      </>
    ) : (
      <>
        <span className="relative block">
          <Photo
            artist={artist}
            compact={false}
            mine={isMine}
            faded={faded}
            hover={canPick}
            punch={isMine && picked !== null}
          >
            {share !== undefined && (
              <span className="absolute inset-x-0 bottom-0 flex items-end bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-12">
                <span
                  className={`display text-3xl tabular-nums sm:text-4xl ${
                    ahead === side ? "text-accent" : "text-white"
                  }`}
                >
                  <Count value={share} />%
                </span>
              </span>
            )}
            {isMine && (
              <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-[#0b0b0e]">
                Your pick
              </span>
            )}
            {closed && ahead === side && (
              <span className="absolute right-2 top-2 rounded-full bg-score-overall px-2 py-0.5 text-[11px] font-bold text-[#0b0b0e]">
                Took it
              </span>
            )}
          </Photo>
          {side === "left" && (
            <VsMark className="absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-[calc(50%+0.5rem)] sm:translate-x-[calc(50%+0.75rem)]" />
          )}
        </span>
        <span className="display-sm mt-3 block truncate text-base text-text sm:text-xl">
          {artist.name}
        </span>
        {canPick && (
          <span
            className={`${buttonClass({
              variant: choosing === side ? "primary" : "secondary",
            })} mt-3 w-full group-hover:border-accent/60`}
          >
            {choosing === side ? "Locking in…" : "Pick"}
          </span>
        )}
      </>
    );

    const layout = compact
      ? "flex min-w-0 flex-col items-center text-center"
      : "flex min-w-0 flex-col text-left";

    const inner = canPick ? (
      <button
        type="button"
        onClick={() => pick(side)}
        disabled={pending}
        aria-label={`Pick ${artist.name}`}
        className={`group ${layout} rounded-2xl disabled:cursor-wait`}
      >
        {body}
      </button>
    ) : (
      <div className={layout}>{body}</div>
    );

    return (
      <div key={side} className={`min-w-0 ${side === "left" ? "clash-left" : "clash-right"}`}>
        {inner}
      </div>
    );
  }

  let status: string | null = null;
  if (split && closed) {
    status = split.total === 0 ? "Nobody picked this one" : `${split.total} ${split.total === 1 ? "pick" : "picks"}`;
  } else if (split) {
    status = `${split.total} ${split.total === 1 ? "pick" : "picks"} so far · Locked in`;
  } else if (canPick && view.friendsPicked > 0) {
    const n = view.friendsPicked;
    status = `${n} ${n === 1 ? "person" : "people"} you follow ${n === 1 ? "has" : "have"} picked.`;
    if (!compact) status += " Pick yours to see how they went.";
  } else if (canPick) {
    status = "Pick one to see the split.";
  }

  const bar = split && split.total > 0 && (
    <div className="mt-5 flex h-1.5 gap-1" aria-hidden="true">
      <span
        className={`versus-bar-left rounded-full ${ahead === "left" ? "bg-accent" : "bg-border-strong"}`}
        style={{ width: `${split.left}%` }}
      />
      <span
        className={`versus-bar-right flex-1 rounded-full ${
          ahead === "right" ? "bg-accent" : "bg-border-strong"
        }`}
      />
    </div>
  );

  const footer = (
    <>
      {bar}
      {(status || !closed) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-text-muted">
          <span>{status}</span>
          {!closed && <Countdown until={view.closesAt} now={view.now} />}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-[#ffb4ae]">
          {error}
        </p>
      )}
      {!view.signedIn && !closed && (
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link href="/login" className={buttonClass({ size: compact ? "sm" : "md" })}>
            Log in to pick
          </Link>
          {!compact && (
            <Link href="/login?mode=signup" className={buttonClass({ variant: "secondary" })}>
              Join MULO
            </Link>
          )}
        </div>
      )}
    </>
  );

  if (!compact) {
    const anyFriends = tally !== null && SIDES.some((side) => tally.friends[side].length > 0);

    return (
      <div>
        <div className="grid grid-cols-2 items-start gap-4 sm:gap-6">
          {SIDES.map((side) => contender(side))}
        </div>
        {footer}
        {anyFriends && (
          <div className="mt-6 grid grid-cols-2 items-start gap-4 border-t border-border pt-5 sm:gap-6">
            {SIDES.map((side) => (
              <PickedBy key={side} artist={matchup[side].name} people={tally.friends[side]} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4 sm:p-5">
      {/* Each artist's photo, blurred into their half of the card. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid grid-cols-2">
        {SIDES.map((side) => {
          const src = artistPhotoSrc(matchup[side].image, 240);
          return (
            <span
              key={side}
              className="block overflow-hidden opacity-25"
              style={{
                maskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, black 55%, transparent)`,
                WebkitMaskImage: `linear-gradient(to ${side === "left" ? "right" : "left"}, black 55%, transparent)`,
              }}
            >
              {src && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="h-full w-full scale-125 object-cover blur-2xl saturate-150" />
              )}
            </span>
          );
        })}
      </div>

      <div className="relative mx-auto max-w-xl">
        <p className="display truncate text-center text-lg text-text sm:text-xl">
          {matchup.title}
        </p>
        {matchup.tagline && (
          <p className="truncate text-center text-xs text-text-muted">{matchup.tagline}</p>
        )}
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-6">
          {contender("left")}
          <VsMark className="mt-[22px] sm:mt-[26px]" />
          {contender("right")}
        </div>
        {footer}
      </div>
    </div>
  );
}
