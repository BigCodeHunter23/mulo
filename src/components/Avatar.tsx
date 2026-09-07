const SIZES = {
  sm: { box: "h-8 w-8", text: "text-xs" },
  md: { box: "h-10 w-10", text: "text-sm" },
  lg: { box: "h-16 w-16", text: "text-xl" },
  xl: { box: "h-24 w-24", text: "text-3xl" },
} as const;

/**
 * Falls back to the first letter of the name on a tinted circle, so a person
 * without a photo still reads as a person rather than an empty slot.
 */
export default function Avatar({
  url,
  name,
  size = "md",
}: {
  url: string | null;
  name: string;
  size?: keyof typeof SIZES;
}) {
  const { box, text } = SIZES[size];
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        loading="lazy"
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
