import { sizedAvatar } from "@/lib/record-avatar";

const SIZES = {
  /** Small enough to sit in a tracklist row without growing it. */
  xs: { box: "h-5 w-5", text: "text-[9px]", record: 96 },
  sm: { box: "h-8 w-8", text: "text-xs", record: 96 },
  md: { box: "h-10 w-10", text: "text-sm", record: 128 },
  lg: { box: "h-16 w-16", text: "text-xl", record: 128 },
  xl: { box: "h-24 w-24", text: "text-3xl", record: 256 },
  /** The big one at the top of a profile: a little smaller on phones. */
  profile: { box: "h-20 w-20 sm:h-28 sm:w-28", text: "text-3xl", record: 256 },
} as const;

/**
 * Falls back to the first letter of the name on a tinted circle, so a person
 * without a photo still reads as a person rather than an empty slot. A record
 * avatar is asked for at about twice the size it's shown, for sharp screens.
 */
export default function Avatar({
  url,
  name,
  size = "md",
  eager = false,
}: {
  url: string | null;
  name: string;
  size?: keyof typeof SIZES;
  /** Load straight away, for an avatar that's on screen as the page opens. */
  eager?: boolean;
}) {
  const { box, text, record } = SIZES[size];
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={sizedAvatar(url, record)}
        alt={name}
        loading={eager ? "eager" : "lazy"}
        className={`${box} shrink-0 rounded-full object-cover ring-1 ring-border`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${box} ${text} flex shrink-0 items-center justify-center rounded-full bg-surface-raised font-semibold text-text-secondary ring-1 ring-border`}
    >
      {initial}
    </span>
  );
}
