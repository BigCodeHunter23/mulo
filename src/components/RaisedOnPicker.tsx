"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveRaisedOn } from "@/app/raised-on/actions";
import { coverSrc } from "@/lib/cover-url";
import { ERAS, type Era, type EraAlbum } from "@/lib/eras";
import { eraForYear, findScene, shortEraLabel } from "@/lib/raised-on-shared";
import type { SearchAlbum } from "@/lib/search";
import RecordDisc from "@/components/RecordDisc";
import { buttonClass, fieldClass } from "@/components/ui";

export type RaisedOnPick = {
  mbid: string;
  title: string;
  artist: string | null;
  cover: string | null;
  era: string | null;
  scene: string | null;
};

type Changes = Record<string, string | null>;

function Cover({ url, className }: { url: string | null; className: string }) {
  const src = coverSrc(url, 250);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={`object-cover ${className}`} />
  ) : (
    <span className={`block bg-surface-raised ${className}`} />
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 flex h-10 items-center gap-1 rounded-lg px-2 text-sm text-text-secondary transition-colors hover:bg-surface-raised hover:text-text"
    >
      <span aria-hidden="true" className="text-lg leading-none">
        ‹
      </span>
      {label}
    </button>
  );
}

/** Where an album sits in the lineup, preferring the scene being looked at. */
function lineupPick(mbid: string, eraId: string | null, sceneId: string | null) {
  let match: RaisedOnPick | null = null;
  for (const era of ERAS) {
    for (const scene of era.scenes) {
      const album = scene.albums.find((candidate) => candidate.mbid === mbid);
      if (!album) continue;
      const pick = {
        mbid,
        title: album.title,
        artist: album.artist,
        cover: album.cover,
        era: era.id,
        scene: scene.id,
      };
      if (era.id === eraId && scene.id === sceneId) return pick;
      match ??= pick;
    }
  }
  return match;
}

function DecadeTile({
  era,
  mine,
  onClick,
}: {
  era: Era;
  mine: boolean;
  onClick: () => void;
}) {
  const covers = era.scenes.slice(0, 3).map((scene) => scene.albums[0]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex min-h-36 flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-raised active:scale-[0.98]"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex">
          {covers.map((album, i) => (
            <Cover
              key={album.mbid}
              url={album.cover}
              className={`h-11 w-11 rounded-md shadow-lg ring-2 ring-surface ${i > 0 ? "-ml-4" : ""} ${
                i === 0 ? "-rotate-6" : i === 2 ? "rotate-6" : ""
              }`}
            />
          ))}
        </span>
        {mine && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
            Yours
          </span>
        )}
      </span>
      <span>
        <span className="display block text-3xl text-text transition-colors group-hover:text-accent">
          {shortEraLabel(era.id)}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-snug text-text-muted">
          {era.blurb}
        </span>
      </span>
    </button>
  );
}

function AlbumSearch({ onPick }: { onPick: (album: SearchAlbum) => void }) {
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
        className={`${fieldClass} h-12 text-base`}
      />
      {loading && <p className="mt-3 text-xs text-text-muted">Searching…</p>}
      {results.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {results.map((album) => (
            <li key={album.mbid}>
              <button
                type="button"
                onClick={() => onPick(album)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-2.5 text-left transition-colors hover:bg-surface-raised active:scale-[0.99]"
              >
                <Cover url={album.cover_art_url} className="h-14 w-14 shrink-0 rounded-md" />
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
 * Raised On, one screen at a time: a decade, one of the scenes that defined
 * it, then the record. Each step is its own place in the browser's history,
 * so the back button or a swipe goes back a step, and any decade is a tap
 * away. Picking a record opens a sheet to confirm it; saving drops the needle
 * and heads to wherever comes next.
 */
export default function RaisedOnPicker({
  initial,
  hasPhoto,
  mode,
  doneHref,
}: {
  initial: RaisedOnPick | null;
  hasPhoto: boolean;
  mode: "welcome" | "settings";
  /** Where to go once it's saved. */
  doneHref: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [found, setFound] = useState<Record<string, RaisedOnPick>>({});
  const [useAsPicture, setUseAsPicture] = useState(!hasPhoto);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  // How many steps this page has added to history, so Back can undo them.
  const pushed = useRef(0);

  const eraId = params.get("era");
  const sceneId = params.get("scene");
  const finding = params.get("find") === "1";
  const pickId = params.get("pick");

  const era = ERAS.find((candidate) => candidate.id === eraId) ?? null;
  const scene = era?.scenes.find((candidate) => candidate.id === sceneId) ?? null;

  const pick = pickId
    ? (found[pickId] ??
      lineupPick(pickId, eraId, sceneId) ??
      (initial?.mbid === pickId ? initial : null))
    : null;

  useEffect(() => {
    const popped = () => {
      pushed.current = Math.max(0, pushed.current - 1);
    };
    window.addEventListener("popstate", popped);
    return () => window.removeEventListener("popstate", popped);
  }, []);

  // The confirm sheet closes on Escape, and the page behind it holds still.
  useEffect(() => {
    if (!pick) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pushed.current > 0) {
        window.history.back();
      } else {
        const url = new URL(window.location.href);
        url.searchParams.delete("pick");
        window.history.replaceState(null, "", url);
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", close);
    };
  }, [pick]);

  function go(changes: Changes, how: "push" | "replace" = "push", scrollTop = true) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    if (how === "push") {
      pushed.current += 1;
      window.history.pushState(null, "", url);
    } else {
      window.history.replaceState(null, "", url);
    }
    if (scrollTop) window.scrollTo({ top: 0 });
  }

  /** Back a step: through history when this page put it there. */
  function back(fallback: Changes) {
    if (pushed.current > 0) window.history.back();
    else go(fallback, "replace");
  }

  function closeSheet() {
    if (!pending && !saved) back({ pick: null });
  }

  function open(next: RaisedOnPick) {
    setError(null);
    setSaved(false);
    go({ pick: next.mbid }, "push", false);
  }

  function chooseSearched(album: SearchAlbum) {
    const next: RaisedOnPick = {
      mbid: album.mbid,
      title: album.title,
      artist: album.artist,
      cover: album.cover_art_url,
      era: eraForYear(album.year ? Number(album.year) : null),
      scene: null,
    };
    setFound((current) => ({ ...current, [album.mbid]: next }));
    open(next);
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
      setSaved(true);
      // Long enough to see the record land.
      setTimeout(() => router.push(doneHref), 1100);
    });
  }

  const place = pick ? findScene(pick.era, pick.scene) : null;
  const detail = pick
    ? [pick.artist, place?.scene?.name ?? place?.era?.label].filter(Boolean).join(" · ")
    : "";

  let body: React.ReactNode;

  if (finding) {
    body = (
      <div key="search" className="step-in">
        <BackButton label="Back" onClick={() => back({ find: null })} />
        <h1 className="display mt-2 text-3xl text-text">Search any album</h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Whatever raised you, if it&rsquo;s on MusicBrainz, it&rsquo;s here.
        </p>
        <div className="mt-6">
          <AlbumSearch onPick={chooseSearched} />
        </div>
      </div>
    );
  } else if (era && scene) {
    body = (
      <div key={`records-${scene.id}`} className="step-in">
        <BackButton label={era.label} onClick={() => back({ scene: null })} />
        <h1 className="display mt-2 text-3xl text-text">{scene.name}</h1>
        <p className="mt-1.5 text-sm text-text-muted">{scene.artists.join(", ")}</p>

        <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
          {scene.albums.map((album: EraAlbum) => (
            <li key={album.mbid}>
              <button
                type="button"
                onClick={() => open(lineupPick(album.mbid, era.id, scene.id)!)}
                className="group block w-full text-left active:scale-[0.97]"
              >
                <span className="artwork relative block aspect-square overflow-hidden rounded-xl ring-2 ring-transparent transition group-hover:ring-accent/60">
                  <Cover url={album.cover} className="h-full w-full transition-transform duration-300 group-hover:scale-[1.04]" />
                  {initial?.mbid === album.mbid && (
                    <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-[#0b0b0e]">
                      Your record
                    </span>
                  )}
                </span>
                <span className="display-sm mt-2.5 block truncate text-sm text-text">
                  {album.title}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {album.artist} · {album.year}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (era) {
    body = (
      <div key={`scenes-${era.id}`} className="step-in">
        <BackButton label="Decades" onClick={() => back({ era: null })} />

        {/* Hop straight to another decade without going back. */}
        <div className="-mx-4 mt-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-2">
            {ERAS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => go({ era: candidate.id }, "replace")}
                aria-pressed={candidate.id === era.id}
                className={`h-9 rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                  candidate.id === era.id
                    ? "border-accent bg-accent text-[#0b0b0e]"
                    : "border-border bg-surface text-text-secondary hover:text-text"
                }`}
              >
                {shortEraLabel(candidate.id)}
              </button>
            ))}
          </div>
        </div>

        <h1 className="display mt-6 text-3xl text-text">{era.label}</h1>
        <p className="mt-1.5 text-sm text-text-secondary">{era.blurb}.</p>

        <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {era.scenes.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => go({ scene: candidate.id })}
                className="flex w-full items-center gap-3.5 rounded-xl border border-border bg-surface p-3.5 text-left transition-colors hover:border-border-strong hover:bg-surface-raised active:scale-[0.99]"
              >
                <span className="flex shrink-0">
                  {candidate.albums.slice(0, 3).map((album, i) => (
                    <Cover
                      key={album.mbid}
                      url={album.cover}
                      className={`h-12 w-12 rounded-md ring-2 ring-surface ${i > 0 ? "-ml-5" : ""}`}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="display-sm block truncate text-[15px] text-text">
                    {candidate.name}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {candidate.artists.join(", ")}
                  </span>
                </span>
                <span aria-hidden="true" className="text-lg text-text-muted">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  } else {
    body = (
      <div key="decades" className="step-in">
        <h1 className="display text-3xl text-text sm:text-4xl">What were you raised on?</h1>
        <p className="mt-2 max-w-xl text-sm text-text-secondary">
          Pick a decade, a scene, then the record that made you. Any decade counts.
          {mode === "welcome" || !hasPhoto
            ? " It becomes your profile picture, pressed onto vinyl, until you add a photo."
            : " It shows on your profile."}
        </p>

        {initial && (
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
            <RecordDisc cover={initial.cover} className="h-16 w-16" />
            <div className="min-w-0">
              <p className="text-xs text-text-muted">Right now you were raised on</p>
              <p className="display-sm truncate text-base text-text">{initial.title}</p>
              {initial.artist && (
                <p className="truncate text-xs text-text-muted">{initial.artist}</p>
              )}
            </div>
          </div>
        )}

        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ERAS.map((candidate) => (
            <li key={candidate.id}>
              <DecadeTile
                era={candidate}
                mine={initial?.era === candidate.id}
                onClick={() => go({ era: candidate.id })}
              />
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => go({ find: "1" })}
            className="text-sm text-text-secondary underline-offset-4 transition-colors hover:text-text hover:underline"
          >
            Not listed? Search any album
          </button>
          {mode === "welcome" && (
            <Link
              href="/welcome?step=rate"
              className="text-sm text-text-muted transition-colors hover:text-text"
            >
              Skip for now
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {body}

      {pick && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Raised on ${pick.title}`}
          onClick={closeSheet}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="sheet-up w-full max-w-md rounded-t-3xl border border-border bg-bg px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-7 sm:rounded-3xl sm:pb-6"
          >
            <div className="flex flex-col items-center text-center">
              <div className={`relative ${saved ? "record-land" : ""}`}>
                {saved && <span className="record-ring absolute inset-0 rounded-full" />}
                <RecordDisc cover={pick.cover} className="h-44 w-44" spinning />
              </div>

              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                {saved ? "Locked in" : "Raised on"}
              </p>
              <h2 className="display mt-1 text-2xl text-text">{pick.title}</h2>
              {detail && <p className="mt-1 text-sm text-text-secondary">{detail}</p>}

              {hasPhoto ? (
                <label className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={useAsPicture}
                    onChange={(event) => setUseAsPicture(event.target.checked)}
                    disabled={pending || saved}
                    className="h-4 w-4 accent-[#f2803f]"
                  />
                  Use it as my picture instead of my photo
                </label>
              ) : (
                <p className="mt-3 text-xs text-text-muted">
                  It&rsquo;ll be your picture until you add a photo.
                </p>
              )}

              {error && (
                <p role="alert" className="mt-3 text-sm text-[#ffb4ae]">
                  {error}
                </p>
              )}

              <div className="mt-6 grid w-full grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={closeSheet}
                  disabled={pending || saved}
                  className={`${buttonClass({ variant: "secondary" })} h-12`}
                >
                  Pick another
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={pending || saved}
                  className={`${buttonClass()} h-12`}
                >
                  {saved ? "Saved" : pending ? "Saving…" : "That's the one"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
