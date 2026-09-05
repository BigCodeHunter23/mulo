"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitReport, type ReportState } from "@/app/report/actions";
import { REPORT_REASONS } from "@/lib/report-reasons";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-mulo-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-mulo-orange-dark disabled:opacity-60"
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
      <Link href="/login" className="text-xs text-mulo-muted underline">
        {label}
      </Link>
    );
  }

  if (state.message) {
    return <span className="text-xs text-mulo-muted">{state.message}</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-mulo-muted underline hover:text-mulo-navy"
      >
        {label}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-2 flex flex-col gap-2 rounded border border-gray-200 p-3"
    >
      {ratingId !== undefined && (
        <input type="hidden" name="rating_id" value={ratingId} />
      )}
      {profileId !== undefined && (
        <input type="hidden" name="profile_id" value={profileId} />
      )}

      <p className="text-sm font-medium">What&rsquo;s wrong with this?</p>

      <label className="flex flex-col gap-1 text-sm">
        Reason
        <select
          name="reason"
          required
          defaultValue=""
          className="rounded border border-gray-300 px-2 py-1.5"
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
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Anything to add <span className="text-xs text-mulo-muted">(optional)</span>
        <textarea
          name="detail"
          rows={2}
          maxLength={500}
          className="rounded border border-gray-300 px-2 py-1.5"
        />
      </label>

      {state.error && (
        <p className="text-xs text-red-700">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-mulo-muted underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
