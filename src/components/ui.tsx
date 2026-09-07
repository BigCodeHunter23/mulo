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

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";

const VARIANTS = {
  primary: "bg-accent text-[#0b0b0e] hover:bg-accent-hover",
  secondary:
    "border border-border-strong bg-surface-raised text-text hover:bg-surface-hover",
  ghost: "text-text-secondary hover:text-text hover:bg-surface-raised",
} as const;

const SIZES = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
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

/** Text inputs, textareas and selects share one look. */
export const fieldClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors focus:border-border-strong focus:outline-none focus-visible:outline-none";

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
