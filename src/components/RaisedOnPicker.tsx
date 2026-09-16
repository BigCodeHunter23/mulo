"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveRaisedOn } from "@/app/raised-on/actions";
import { coverSrc } from "@/lib/cover-url";
import { ERAS, type EraAlbum } from "@/lib/eras";
import { eraForYear, findScene, shortEraLabel } from "@/lib/raised-on-shared";
import { recordAvatarPath } from "@/lib/record-avatar";
import type { SearchAlbum } from "@/lib/search";
import { buttonClass, fieldClass } from "@/components/ui";

export type RaisedOnPick = {
  mbid: string;
  title: string;
  artist: string | null;
  cover: string | null;
  era: string | null;
  scene: string | null;
};

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3}>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cover({ url, className }: { url: string | null; className: string }) {
  const src = coverSrc(url, 250);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={`object-cover ${className}`} />
  ) : (
    <span className={`block bg-surface-raised ${className}`} />
  );
}

function AlbumSearch({
  chosen,
  onPick,
}: {
  chosen: string | null;
  onPick: (album: SearchAlbum) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchAlbum[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { albums?: SearchAlbum[] };
        setResults(data.albums ?? []);
      } catch {
        // A newer search replaced this one, or the network dropped: keep what's shown.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (event.target.value.trim().length < 2) setResults([]);
        }}
        placeholder="Search for an album"
        autoFocus
        className={fieldClass}
      />
      {loading && <p className="mt-3 text-xs text-text-muted">Searching…</p>}
      {results.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {results.map((album) => (
            <li key={album.mbid}>
              <button
                type="button"
                onClick={() => onPick(album)}
                aria-pressed={chosen === album.mbid}
                className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                  chosen === album.mbid
                    ? "border-accent bg-accent/5"
                    : "border-border bg-surface hover:bg-surface-raised"
                }`}
              >
                <Cover url={album.cover_art_url} className="h-11 w-11 shrink-0 rounded" />
                <span className="min-w-0 flex-1">
                  <span className="display-sm block truncate text-sm text-text">{album.title}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {[album.artist, album.year].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Raised On: tap a decade on the timeline, one of the scenes that defined it,
 * then the record you grew up on. Nothing locks in until you save, so you can
 * wander between decades as much as you like. Your pick stays in the bar at
 * the bottom while you look around.
 */
export default function RaisedOnPicker({
  initial,
  hasPhoto,
  mode,
}: {
  initial: RaisedOnPick | null;
  hasPhoto: boolean;
  mode: "welcome" | "settings";
}) {
  const router = useRouter();
  const [eraId, setEraId] = useState<string | null>(initial?.era ?? null);
  const [sceneId, setSceneId] = useState<string | null>(initial?.scene ?? null);
  const [pick, setPick] = useState<RaisedOnPick | null>(initial);
  const [searching, setSearching] = useState(false);
  const [useAsPicture, setUseAsPicture] = useState(!hasPhoto);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const scenesRef = useRef<HTMLDivElement>(null);
  const albumsRef = useRef<HTMLDivElement>(null);

  const era = ERAS.find((candidate) => candidate.id === eraId) ?? null;
  const scene = era?.scenes.find((candidate) => candidate.id === sceneId) ?? null;
  const unchanged = pick !== null && initial !== null && pick.mbid === initial.mbid;

  function reveal(ref: React.RefObject<HTMLDivElement | null>) {
    requestAnimationFrame(() =>
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function chooseEra(id: string) {
    setEraId(id);
    setSceneId(null);
    setSearching(false);
    reveal(scenesRef);
  }

  function chooseScene(id: string) {
    setSceneId(id);
    reveal(albumsRef);
  }

  function choose(next: RaisedOnPick) {
    setPick(next);
    setSaved(false);
    setError(null);
  }

  function chooseAlbum(album: EraAlbum) {
    choose({
      mbid: album.mbid,
      title: album.title,
      artist: album.artist,
      cover: album.cover,
      era: eraId,
      scene: sceneId,
    });
  }

  function save() {
    if (!pick) return;
    setError(null);

    startTransition(async () => {
      const result = await saveRaisedOn({
        mbid: pick.mbid,
        era: pick.era,
        scene: pick.scene,
        useAsPicture,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (mode === "welcome") {
        router.push("/welcome?step=rate");
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  const pickPlace = pick ? findScene(pick.era, pick.scene) : null;
  const pickDetail = pick
    ? [pick.artist, pickPlace?.scene?.name ?? pickPlace?.era?.label].filter(Boolean).join(" · ")
    : "";

  return (
    <div>
      {/* The timeline stays pinned under the header, so another decade is always one tap away. */}
      <div className="sticky top-14 z-10 -mx-4 overflow-x-auto border-b border-border/60 bg-bg/90 px-4 pb-3 pt-3 backdrop-blur-xl sm:mx-0 sm:rounded-b-xl sm:px-2">
        <ol className="relative flex min-w-max sm:min-w-0">
          <span
            aria-hidden="true"
            className="absolute left-9 right-9 top-[13px] h-px bg-border-strong"
          />
          {ERAS.map((candidate) => {
            const active = candidate.id === eraId;
            const holdsPick = pick?.era === candidate.id;

            return (
              <li key={candidate.id} className="relative flex w-[4.5rem] justify-center sm:flex-1">
                <button
                  type="button"
                  onClick={() => chooseEra(candidate.id)}
                  aria-pressed={active}
                  aria-label={candidate.label}
                  className="group flex flex-col items-center gap-2 px-1"
                >
                  <span
                    className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 transition ${
                      active
                        ? "scale-110 border-accent bg-accent"
                        : "border-border-strong bg-bg group-hover:border-accent/70"
                    }`}
                  >
                    {holdsPick && (
                      <span
                        className={`h-2 w-2 rounded-full ${active ? "bg-[#0b0b0e]" : "bg-accent"}`}
                      />
                    )}
                  </span>
                  <span
                    className={`display-sm text-sm transition-colors sm:text-base ${
                      active ? "text-accent" : "text-text-secondary group-hover:text-text"
                    }`}
                  >
                    {shortEraLabel(candidate.id)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {!era && (
        <p className="mt-4 text-sm text-text-muted">
          Tap a decade to start. Any decade counts: it&rsquo;s about the music you grew
          up with, not the year you were born.
        </p>
      )}

      {era && (
        <div ref={scenesRef} className="mt-6 scroll-mt-40">
          <p className="text-sm text-text-secondary">
            <span className="display-sm text-text">{era.label}.</span> {era.blurb}.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {era.scenes.map((candidate) => {
              const active = candidate.id === sceneId;
              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => chooseScene(candidate.id)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? "border-accent bg-accent/5"
                        : "border-border bg-surface hover:border-border-strong hover:bg-surface-raised"
                    }`}
                  >
                    <span className="flex shrink-0 -space-x-4">
                      {candidate.albums.slice(0, 3).map((album) => (
                        <Cover
                          key={album.mbid}
                          url={album.cover}
                          className="h-10 w-10 rounded-md ring-2 ring-surface"
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="display-sm block truncate text-sm text-text">
                        {candidate.name}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {candidate.artists.join(", ")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {scene && (
        <div ref={albumsRef} className="mt-8 scroll-mt-40">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            {scene.name}: pick the record
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-5">
            {scene.albums.map((album) => {
              const chosen = pick?.mbid === album.mbid;
              return (
                <li key={album.mbid}>
                  <button
                    type="button"
                    onClick={() => chooseAlbum(album)}
                    aria-pressed={chosen}
                    className="group block w-full text-left"
                  >
                    <span
                      className={`artwork relative block aspect-square overflow-hidden rounded-lg ring-2 transition ${
                        chosen ? "ring-accent" : "ring-transparent group-hover:ring-border-strong"
                      }`}
                    >
                      <Cover url={album.cover} className="h-full w-full" />
                      {chosen && (
                        <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[#0b0b0e]">
                          <Check />
                        </span>
                      )}
                    </span>
                    <span className="display-sm mt-2 block truncate text-xs text-text">
                      {album.title}
                    </span>
                    <span className="block truncate text-[11px] text-text-muted">
                      {album.artist} · {album.year}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-8">
        {searching ? (
          <AlbumSearch
            chosen={pick?.mbid ?? null}
            onPick={(album) => {
              const year = album.year ? Number(album.year) : null;
              choose({
                mbid: album.mbid,
                title: album.title,
                artist: album.artist,
                cover: album.cover_art_url,
                era: eraForYear(year),
                scene: null,
              });
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="text-sm text-text-secondary underline-offset-4 transition-colors hover:text-text hover:underline"
          >
            Not in the list? Search for any album
          </button>
        )}
      </div>

      {mode === "welcome" && !pick && (
        <div className="mt-10 flex justify-end">
          <Link
            href="/welcome?step=rate"
            className="text-sm text-text-muted transition-colors hover:text-text"
          >
            Skip for now
          </Link>
        </div>
      )}

      {/* Your pick, kept in view while you look around. */}
      {pick && (
        <div className="sticky bottom-0 z-20 -mx-4 mt-10 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur-xl sm:bottom-4 sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
          <div className="flex items-center gap-3">
            <span
              className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-full bg-surface-raised bg-cover bg-center"
              style={{
                backgroundImage: pick.cover ? `url("${coverSrc(pick.cover, 250)}")` : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={pick.mbid}
                src={`${recordAvatarPath(pick.mbid)}?s=128`}
                alt=""
                className="record-spin h-full w-full"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-text-secondary">
                Raised on <span className="display-sm text-text">{pick.title}</span>
              </p>
              {pickDetail && <p className="truncate text-xs text-text-muted">{pickDetail}</p>}
            </div>
            {mode === "welcome" ? (
              <button type="button" onClick={save} disabled={pending} className={buttonClass()}>
                {pending ? "Saving…" : "That's the one"}
              </button>
            ) : (
              <button
                type="button"
                onClick={save}
                disabled={pending || saved || (unchanged && !(hasPhoto && useAsPicture))}
                className={buttonClass()}
              >
                {pending ? "Saving…" : saved ? "Saved" : "Save"}
              </button>
            )}
          </div>

          {hasPhoto && (
            <label className="mt-2.5 flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={useAsPicture}
                onChange={(event) => {
                  setUseAsPicture(event.target.checked);
                  setSaved(false);
                }}
                className="h-4 w-4 accent-[#f2803f]"
              />
              Use the record as my picture instead of my photo
            </label>
          )}
          {!hasPhoto && (
            <p className="mt-2 text-xs text-text-muted">
              It&rsquo;s your picture until you add a photo.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-[#ffb4ae]">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
