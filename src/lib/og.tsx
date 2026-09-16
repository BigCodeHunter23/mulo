import "server-only";
import { ImageResponse } from "next/og";

/** Brand colours for generated images, matching globals.css. */
export const OG = {
  bg: "#0b0b0e",
  surface: "#1a1a21",
  text: "#f4f4f6",
  secondary: "#a5a5b0",
  muted: "#71717f",
  accent: "#f2803f",
  gold: "#f5c518",
} as const;

const USER_AGENT = "MULO/0.1 ( https://mulo-plum.vercel.app )";

type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 500 | 800;
  style: "normal";
};

async function fetchInter(weight: 500 | 800): Promise<ArrayBuffer | null> {
  try {
    // Asked without a browser user agent, Google Fonts serves TrueType, which
    // the image renderer can read. Browsers get WOFF2, which it can't.
    const response = await fetch(
      `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`,
      { signal: AbortSignal.timeout(5000) },
    );
    const css = await response.text();

    const url = css.match(
      /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/,
    )?.[1];
    if (!url) return null;

    const font = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return font.ok ? await font.arrayBuffer() : null;
  } catch {
    return null;
  }
}

const fontCache = new Map<number, Promise<ArrayBuffer | null>>();

function loadInter(weight: 500 | 800): Promise<ArrayBuffer | null> {
  const cached = fontCache.get(weight);
  if (cached) return cached;

  const pending = fetchInter(weight);
  fontCache.set(weight, pending);

  // Don't remember a failure: a later request should try again.
  void pending.then((data) => {
    if (!data) fontCache.delete(weight);
  });

  return pending;
}

/** Inter for generated images, or undefined to use the renderer's default. */
export async function ogFonts(): Promise<OgFont[] | undefined> {
  const [medium, bold] = await Promise.all([loadInter(500), loadInter(800)]);
  const fonts: OgFont[] = [];
  if (medium) fonts.push({ name: "Inter", data: medium, weight: 500, style: "normal" });
  if (bold) fonts.push({ name: "Inter", data: bold, weight: 800, style: "normal" });
  return fonts.length > 0 ? fonts : undefined;
}

type Fetched = { type: string; data: ArrayBuffer; url: string };

async function fetchImage(url: string): Promise<Fetched | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) return null;

    return { type, data: await response.arrayBuffer(), url: response.url };
  } catch {
    return null;
  }
}

const COMMONS_FILE =
  /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)/;

/**
 * PNG copies of a Wikimedia Commons file, largest first. Commons only makes
 * thumbnails at set widths, and never wider than the original.
 */
function commonsPngCopies(url: string) {
  const match = url.match(COMMONS_FILE);
  if (!match) return [];

  const [, a, ab, file] = match;
  return [500, 250].map(
    (width) =>
      `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${file}/${width}px-${file}.png`,
  );
}

/**
 * Fetches an image and inlines it, so one slow or missing picture degrades to
 * a placeholder instead of failing the whole preview.
 */
export async function loadImage(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;

  let image = await fetchImage(url);

  // The renderer can't reliably decode WebP. Wikimedia will hand over a PNG
  // copy instead; anything else in WebP is skipped rather than break the card.
  if (image?.type.includes("webp")) {
    const copies = commonsPngCopies(image.url);
    image = null;
    for (const copy of copies) {
      const png = await fetchImage(copy);
      if (png && !png.type.includes("webp")) {
        image = png;
        break;
      }
    }
  }

  if (!image) return null;
  return `data:${image.type};base64,${Buffer.from(image.data).toString("base64")}`;
}

export function Star({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.5l2.9 6.13 6.6.92-4.8 4.76 1.16 6.69L12 17.77l-5.86 3.23L7.3 14.3 2.5 9.55l6.6-.92L12 2.5z" />
    </svg>
  );
}

/** The MULO wordmark, pinned to the bottom-right corner of a card. */
export function Wordmark() {
  return (
    <div
      style={{
        position: "absolute",
        right: 72,
        bottom: 56,
        fontSize: 38,
        fontWeight: 800,
        color: OG.accent,
        letterSpacing: "-0.03em",
      }}
    >
      MULO
    </div>
  );
}

/** The plain MULO card, used when there's nothing more specific to show. */
export function brandCard(fonts: OgFont[] | undefined) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 88,
          background: OG.bg,
          fontFamily: "Inter",
        }}
      >
        <div
          style={{
            fontSize: 46,
            fontWeight: 800,
            color: OG.accent,
            letterSpacing: "-0.03em",
          }}
        >
          MULO
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 30,
            fontSize: 80,
            fontWeight: 800,
            color: OG.text,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
          }}
        >
          <span>Every record,</span>
          <span style={{ color: OG.accent }}>rated by people you trust.</span>
        </div>
        <div
          style={{
            marginTop: 34,
            fontSize: 30,
            fontWeight: 500,
            color: OG.secondary,
          }}
        >
          Rate and review the music you listen to.
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  );
}
