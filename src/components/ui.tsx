import Link from "next/link";

/** Section title with a hairline rule, used to break up long pages. */
export function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-border pb-2.5">
      <h2 className="display-sm text-lg text-text">{children}</h2>
      {action}
    </div>
  );
}

// Presses sink a touch, so a tap feels like it landed.
const BUTTON_BASE =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const VARIANTS = {
  primary: "bg-accent font-semibold text-[#0b0b0e] hover:bg-accent-hover",
  secondary:
    "border border-border-strong bg-surface-raised text-text hover:bg-surface-hover",
  ghost: "text-text-secondary hover:text-text hover:bg-surface-raised",
} as const;

// A little taller on phones, where they're pressed with a thumb.
const SIZES = {
  sm: "h-9 px-3.5 sm:h-8 sm:px-3",
  md: "h-11 px-5 sm:h-10 sm:px-4",
} as const;

export function buttonClass({
  variant = "primary",
  size = "md",
}: {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
} = {}) {
  return `${BUTTON_BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
}) {
  return (
    <Link href={href} className={buttonClass({ variant, size })}>
      {children}
    </Link>
  );
}

/**
 * Text inputs, textareas and selects share one look. On phones the text is
 * 16px, the size below which iPhones zoom the page in when a field is tapped.
 */
export const fieldClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-text placeholder:text-text-muted transition-colors focus:border-accent/60 focus:outline-none focus-visible:outline-none sm:py-2 sm:text-sm";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </label>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "info" | "error";
  children: React.ReactNode;
}) {
  const styles =
    tone === "error"
      ? "border-score-you/30 bg-score-you/10 text-[#ffb4ae]"
      : "border-success/30 bg-success/10 text-[#8ee7ae]";

  return (
    <p className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</p>
  );
}

/** Used wherever a list has nothing in it yet. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface/40 px-6 py-12 text-center">
      <p className="display-sm text-base text-text">{title}</p>
      {body && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-secondary">
          {body}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Shelves of albums and artists: on phones a row to swipe through with the
// next card peeking in, from tablet width up a grid. Shared so every shelf on
// the site behaves the same way.
export const ALBUM_GRID =
  "rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5";
export const ALBUM_ITEM = "w-[42%] shrink-0 sm:w-auto";
export const ARTIST_GRID =
  "rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:gap-x-4 sm:gap-y-7 sm:overflow-visible sm:px-0 sm:pb-0";
export const ARTIST_ITEM = "w-[29%] shrink-0 sm:w-auto";
