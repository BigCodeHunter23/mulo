/**
 * Kept out of the "use server" actions file on purpose: every export from a
 * server-actions module is turned into an action reference, so a plain array
 * exported from there arrives on the client as a function.
 */
export const REPORT_REASONS = [
  "Abusive or hateful",
  "Harassment or bullying",
  "Spam or advertising",
  "Sexually explicit",
  "Impersonation",
  "Something else",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
