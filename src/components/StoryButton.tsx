"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";
import { haptic } from "@/lib/haptics";

/**
 * Hands a phone-screen image to the share sheet, so it can go straight into an
 * Instagram or TikTok story, or a chat. Where a browser can't share files it
 * downloads the picture instead, to post by hand.
 */
export default function StoryButton({
  src,
  filename,
  label = "Share to story",
}: {
  /** A path on this site that returns the story image. */
  src: string;
  filename: string;
  label?: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "saved" | "failed">("idle");
  const made = useRef<{ src: string; file: Promise<File> } | null>(null);

  function load(): Promise<File> {
    if (made.current?.src === src) return made.current.file;
    const file = fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => new File([blob], `${filename}.png`, { type: "image/png" }));
    made.current = { src, file };
    // A failure is forgotten, so the next tap tries again.
    file.catch(() => {
      if (made.current?.file === file) made.current = null;
    });
    return file;
  }

  // iPhones only allow sharing straight after a tap, and drawing the image
  // takes a moment, so it's made in the background as soon as the button
  // shows. By the time anyone taps, it's ready and the share opens at once.
  useEffect(() => {
    const timer = setTimeout(() => void load().catch(() => {}), 400);
    return () => clearTimeout(timer);
    // load reads src and filename, the only things that change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, filename]);

  async function share() {
    haptic("tap");
    setState("working");
    try {
      const file = await load();

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (error) {
          // Closing the share sheet isn't a failure.
          if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
        }
        setState("idle");
        return;
      }

      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("saved");
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={state === "working"}
      className={`${buttonClass({ variant: "secondary", size: "sm" })} gap-2`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="6" y="2.5" width="12" height="19" rx="3" />
        <path d="M10 18.5h4" strokeLinecap="round" />
      </svg>
      {state === "working"
        ? "Making it…"
        : state === "saved"
          ? "Saved to downloads"
          : state === "failed"
            ? "Try again"
            : label}
    </button>
  );
}
