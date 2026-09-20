"use client";

import { useEffect, useSyncExternalStore } from "react";
import { findPreview, noPreviewFor, type Preview } from "@/lib/preview";
import { haptic } from "@/lib/haptics";

/**
 * Play buttons for thirty-second previews, and the credit Apple asks for
 * beside them.
 *
 * One clip plays at a time across the whole page, so every button shares a
 * single audio element and a tiny store saying which song is up and whether
 * it's still loading. Tapping another song simply swaps the clip.
 */

type State = {
  /** Which button owns the audio, as `${artist}|${title}` plus a scope. */
  key: string | null;
  phase: "idle" | "loading" | "playing" | "missing";
  preview: Preview | null;
};

let state: State = { key: null, phase: "idle", preview: null };
const listeners = new Set<() => void>();
let audio: HTMLAudioElement | null = null;

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const IDLE: State = { key: null, phase: "idle", preview: null };

function stop() {
  audio?.pause();
  set(IDLE);
}

async function toggle(key: string, artist: string, title: string) {
  haptic("tap");
  if (state.key === key && (state.phase === "playing" || state.phase === "loading")) {
    stop();
    return;
  }

  audio?.pause();
  set({ key, phase: "loading", preview: null });
  const preview = await findPreview(artist, title);
  // Somebody tapped something else while this was looking.
  if (state.key !== key) return;
  if (!preview) {
    set({ key, phase: "missing", preview: null });
    return;
  }

  if (!audio) {
    audio = new Audio();
    audio.addEventListener("ended", () => set(IDLE));
  }
  audio.src = preview.audio;
  try {
    await audio.play();
    if (state.key === key) set({ key, phase: "playing", preview });
  } catch {
    if (state.key === key) set({ key, phase: "missing", preview: null });
  }
}

function usePreviewState() {
  return useSyncExternalStore(subscribe, () => state, () => IDLE);
}

export function PlayButton({
  artist,
  title,
  scope,
  className = "",
}: {
  artist: string;
  title: string;
  /** Tells two buttons for the same song apart, such as one per card. */
  scope: string;
  className?: string;
}) {
  const key = `${scope}|${artist}|${title}`;
  const current = usePreviewState();
  // A song Apple had nothing for stays dimmed for the rest of the visit, rather
  // than springing back to a play arrow the moment another song is tapped: on an
  // album that isn't on Apple Music at all, every button would otherwise keep
  // offering a play that can never happen.
  const mine =
    current.key === key ? current.phase : noPreviewFor(artist, title) ? "missing" : "idle";

  // A clip shouldn't outlive its button, as when a Stack card flies off.
  useEffect(
    () => () => {
      if (state.key === key) stop();
    },
    [key],
  );

  const label =
    mine === "playing"
      ? `Stop the preview of ${title}`
      : mine === "missing"
        ? `No preview of ${title}`
        : `Play a preview of ${title}`;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void toggle(key, artist, title);
      }}
      disabled={mine === "missing"}
      aria-label={label}
      title={mine === "missing" ? "No preview for this one" : undefined}
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
        mine === "playing"
          ? "border-accent bg-accent text-bg"
          : mine === "missing"
            ? "border-border/60 text-text-muted/50"
            : "border-border-strong text-text-secondary hover:border-accent hover:text-accent"
      } ${className}`}
    >
      {mine === "loading" ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : mine === "playing" ? (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
          <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
        </svg>
      ) : mine === "missing" ? (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" className="ml-0.5 h-2.5 w-2.5" aria-hidden="true">
          <path d="M3 1.8v8.4a.5.5 0 0 0 .77.42l6.5-4.2a.5.5 0 0 0 0-.84l-6.5-4.2A.5.5 0 0 0 3 1.8z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

/**
 * The credit Apple asks for, and a way through to the song that's playing.
 * Shown under any list with play buttons in it.
 */
export function PreviewCredit({ scope, className = "" }: { scope: string; className?: string }) {
  const current = usePreviewState();
  const playing =
    current.phase === "playing" && current.key?.startsWith(`${scope}|`) ? current.preview : null;

  return (
    <p className={`flex flex-wrap items-center gap-x-2 text-[11px] text-text-muted ${className}`}>
      <span>Previews courtesy of Apple Music</span>
      {playing && (
        <a
          href={playing.link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Listen on Apple Music ↗
        </a>
      )}
    </p>
  );
}
