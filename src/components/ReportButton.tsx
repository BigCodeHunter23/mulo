"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitReport, type ReportState } from "@/app/report/actions";
import { REPORT_REASONS } from "@/lib/report-reasons";
import { buttonClass, fieldClass } from "@/components/ui";

const quietLink =
  "text-xs text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass({ size: "sm" })}
    >
      {pending ? "Sending…" : "Send report"}
    </button>
  );
}

/**
 * Reports a review or a profile. Kept deliberately quiet in the interface:
 * a small text link that opens the form only when needed.
 */
export default function ReportButton({
  ratingId,
  profileId,
  signedIn,
  label = "Report",
}: {
  ratingId?: number;
  profileId?: string;
  signedIn: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ReportState, FormData>(
    submitReport,
    {},
  );

  if (!signedIn) {
    return (
      <Link href="/login" className={quietLink}>
        {label}
      </Link>
    );
  }

  if (state.message) {
    return <span className="text-xs text-text-muted">{state.message}</span>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={quietLink}>
        {label}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-2 flex w-full min-w-[15rem] flex-col gap-3 rounded-lg border border-border bg-surface-raised p-3 text-left"
    >
      {ratingId !== undefined && (
        <input type="hidden" name="rating_id" value={ratingId} />
      )}
      {profileId !== undefined && (
        <input type="hidden" name="profile_id" value={profileId} />
      )}

      <p className="text-sm font-medium text-text">
        What&rsquo;s wrong with this?
      </p>

      <select
        name="reason"
        required
        defaultValue=""
        aria-label="Reason"
        className={fieldClass}
      >
        <option value="" disabled>
          Choose a reason
        </option>
        {REPORT_REASONS.map((reason) => (
          <option key={reason} value={reason}>
            {reason}
          </option>
        ))}
      </select>

      <textarea
        name="detail"
        rows={2}
        maxLength={500}
        placeholder="Anything to add? (optional)"
        aria-label="Details"
        className={`${fieldClass} resize-y`}
      />

      {state.error && <p className="text-xs text-score-you">{state.error}</p>}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={quietLink}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
