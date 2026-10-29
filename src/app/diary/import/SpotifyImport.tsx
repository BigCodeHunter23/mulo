"use client";

import Link from "next/link";
import { useState } from "react";
import { uploadDiaryBatch } from "@/app/diary/actions";
import DiaryPrivacy from "@/components/diary/DiaryPrivacy";
import { buttonClass } from "@/components/ui";
import { batches, MIN_MINUTES, MIN_SONGS, type AlbumDay } from "@/lib/diary-shared";
import { readSpotifyFiles, type PickedFile, type SpotifyRead } from "@/lib/diary/read-spotify";

type Found = { days: AlbumDay[]; first: string | null; last: string | null };

type Step =
  | { name: "pick"; error?: string }
  | { name: "reading" }
  | { name: "found"; found: Found }
  | { name: "importing"; found: Found; done: number; of: number }
  | { name: "stopped"; found: Found; next: number; added: number; error: string }
  | { name: "finished"; found: Found; added: number };

/** "from 2016 to 2026", or "in 2026" when it's all one year. */
function years(found: Found): string {
  const from = found.first?.slice(0, 4);
  const to = found.last?.slice(0, 4);
  if (!from || !to) return "";
  return from === to ? ` in ${from}` : ` from ${from} to ${to}`;
}

const albums = (count: number) => `${count.toLocaleString("en")} album${count === 1 ? "" : "s"}`;

/** Lets the page paint (a "Reading…" line) before a long piece of work. */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Spotify's extended streaming history, read here in the browser: only the
 * albums are sent, in batches, never the file. A batch that fails stops the
 * import, and Try again carries on from it.
 */
export default function SpotifyImport({ isPublic }: { isPublic: boolean }) {
  const [step, setStep] = useState<Step>({ name: "pick" });

  async function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setStep({ name: "reading" });
    let read: SpotifyRead;
    try {
      const files: PickedFile[] = [];
      for (const file of Array.from(list)) {
        files.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
        await breathe();
      }
      read = readSpotifyFiles(files, Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      setStep({ name: "pick", error: "Couldn't read that file. Please try again." });
      return;
    }
    if (!read.ok) {
      setStep({ name: "pick", error: read.error });
      return;
    }
    if (read.days.length === 0) {
      setStep({
        name: "pick",
        error: `Nothing in there counts as a listen yet: an album needs ${MIN_SONGS} of its songs, or ${MIN_MINUTES} minutes of it, on one day.`,
      });
      return;
    }
    setStep({ name: "found", found: { days: read.days, first: read.first, last: read.last } });
  }

  /** Sends the batches from `start` on; the last call says the import is done. */
  async function send(found: Found, start: number, addedBefore: number) {
    const runs = batches(found.days);
    let added = addedBefore;
    for (let i = start; i <= runs.length; i++) {
      setStep({ name: "importing", found, done: Math.min(i + 1, runs.length), of: runs.length });
      // After the albums, an empty batch saying how many were added, for the bell.
      const result =
        i < runs.length
          ? await uploadDiaryBatch({ source: "spotify", days: runs[i] ?? [] })
          : await uploadDiaryBatch({ source: "spotify", days: [], done: { total: added } });
      if (!result.ok) {
        setStep({ name: "stopped", found, next: i, added, error: result.error });
        return;
      }
      added += result.added;
    }
    setStep({ name: "finished", found, added });
  }

  if (step.name === "finished") {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm text-text">
          {step.added === 0
            ? "Nothing new: these albums were already in your diary."
            : `${albums(step.added)}${years(step.found)} added.`}{" "}
          <Link
            href="/diary"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            See your diary
          </Link>
        </p>
        {step.added > 0 && <DiaryPrivacy askFirst isPublic={isPublic} />}
      </div>
    );
  }

  if (step.name === "importing") {
    return (
      <p role="status" className="text-sm text-text-secondary">
        Importing… {step.done} of {step.of}
      </p>
    );
  }

  if (step.name === "found" || step.name === "stopped") {
    const found = step.found;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-text">
          Found {albums(found.days.length)}
          {years(found)}.
        </p>
        {step.name === "stopped" && (
          <p role="alert" className="text-sm text-error-soft">
            {step.error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              step.name === "stopped" ? send(found, step.next, step.added) : send(found, 0, 0)
            }
            className={buttonClass({ size: "sm" })}
          >
            {step.name === "stopped" ? "Try again" : "Import them"}
          </button>
          {step.name === "found" && (
            <button
              type="button"
              onClick={() => setStep({ name: "pick" })}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              Pick another file
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        className={`${buttonClass({ size: "sm" })} w-fit cursor-pointer ${
          step.name === "reading" ? "pointer-events-none opacity-50" : ""
        }`}
      >
        {step.name === "reading" ? "Reading…" : "Pick Spotify's zip"}
        <input
          type="file"
          accept=".zip,.json,application/zip,application/json"
          multiple
          disabled={step.name === "reading"}
          onChange={(event) => {
            const list = event.target.files;
            void pick(list).finally(() => {
              // So the same file can be picked again.
              event.target.value = "";
            });
          }}
          className="sr-only"
        />
      </label>
      {step.name === "pick" && step.error && (
        <p role="alert" className="text-sm text-error-soft">
          {step.error}
        </p>
      )}
    </div>
  );
}
