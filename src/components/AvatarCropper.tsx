"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";

/** The on-screen crop area, in CSS pixels. */
const STAGE = 280;
/** The saved image: big enough for any avatar on the site, small to upload. */
const OUTPUT = 512;
const MAX_ZOOM = 3;

type Placement = { x: number; y: number; zoom: number };

/** How large the photo is drawn at a zoom, and how far it may be dragged. */
function bounds(image: HTMLImageElement, zoom: number) {
  const base = STAGE / Math.min(image.naturalWidth, image.naturalHeight);
  const width = image.naturalWidth * base * zoom;
  const height = image.naturalHeight * base * zoom;
  return { width, height, minX: STAGE - width, minY: STAGE - height };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Crops a photo to the circle people will see, then shrinks it to a small
 * JPEG before anything is uploaded. A phone photo runs to several megabytes,
 * which the upload refused outright; the saved avatar is around a tenth of
 * one. The photo always covers the circle, so there are never empty corners.
 */
export default function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (cropped: File, previewUrl: string) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [place, setPlace] = useState<Placement>({ x: 0, y: 0, zoom: 1 });
  const drag = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      if (cancelled) return;
      const { width, height } = bounds(img, 1);
      setImage(img);
      setError(null);
      // Start centred, which is where most faces are.
      setPlace({ zoom: 1, x: (STAGE - width) / 2, y: (STAGE - height) / 2 });
    };
    img.onerror = () => {
      if (!cancelled) setError("That photo couldn't be opened. Try a JPEG or PNG.");
    };
    img.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: place.x,
      y: place.y,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || !image) return;

    const { minX, minY } = bounds(image, place.zoom);
    setPlace({
      zoom: place.zoom,
      x: clamp(start.x + event.clientX - start.pointerX, minX, 0),
      y: clamp(start.y + event.clientY - start.pointerY, minY, 0),
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  /** Zoom about the middle of the circle, so what's centred stays centred. */
  function zoomTo(zoom: number) {
    if (!image) return;

    const before = bounds(image, place.zoom);
    const after = bounds(image, zoom);
    const focusX = (STAGE / 2 - place.x) / before.width;
    const focusY = (STAGE / 2 - place.y) / before.height;

    setPlace({
      zoom,
      x: clamp(STAGE / 2 - focusX * after.width, after.minX, 0),
      y: clamp(STAGE / 2 - focusY * after.height, after.minY, 0),
    });
  }

  function save() {
    if (!image) return;

    const { width } = bounds(image, place.zoom);
    // Photo pixels per on-screen pixel at this zoom.
    const scale = image.naturalWidth / width;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("This browser couldn't prepare the photo. Try another browser.");
      return;
    }

    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      -place.x * scale,
      -place.y * scale,
      STAGE * scale,
      STAGE * scale,
      0,
      0,
      OUTPUT,
      OUTPUT,
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Couldn't prepare that photo. Try another.");
          return;
        }
        onDone(
          new File([blob], "avatar.jpg", { type: "image/jpeg" }),
          URL.createObjectURL(blob),
        );
      },
      "image/jpeg",
      0.88,
    );
  }

  const size = image ? bounds(image, place.zoom) : null;

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-5">
      <p className="text-sm text-text-secondary">Drag to line it up. Slide to zoom.</p>

      <div
        className="relative cursor-grab touch-none select-none overflow-hidden rounded-lg bg-bg active:cursor-grabbing"
        style={{ width: STAGE, height: STAGE }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {image && size && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-0 top-0 max-w-none"
            style={{
              width: size.width,
              height: size.height,
              transform: `translate(${place.x}px, ${place.y}px)`,
            }}
          />
        )}
        {/* Everything outside the circle dims, so what's kept is obvious. */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: "0 0 0 9999px rgba(11, 11, 14, 0.62)" }}
        />
        <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/70" />
      </div>

      <input
        type="range"
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={place.zoom}
        onChange={(event) => zoomTo(Number(event.target.value))}
        disabled={!image}
        aria-label="Zoom"
        className="w-full accent-accent"
        style={{ maxWidth: STAGE }}
      />

      {error && <p className="text-center text-sm text-score-you">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!image}
          className={buttonClass({ size: "sm" })}
        >
          Use photo
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={buttonClass({ variant: "ghost", size: "sm" })}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
