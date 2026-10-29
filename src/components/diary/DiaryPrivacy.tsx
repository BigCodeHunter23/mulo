"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { setDiaryVisibility } from "@/app/diary/actions";
import { buttonClass } from "@/components/ui";

/** Set once the first-import question has been answered in this browser. */
const ASKED = "mulo-diary-privacy-asked";

const quiet =
  "text-xs font-medium text-text-secondary underline-offset-4 transition-colors hover:text-accent hover:underline";

function readAsked(): boolean {
  try {
    return window.localStorage.getItem(ASKED) !== null;
  } catch {
    // Storage switched off: asking every time would nag, so it counts as asked.
    return true;
  }
}

function rememberAsked() {
  try {
    window.localStorage.setItem(ASKED, "1");
  } catch {
    // Nothing to keep it in; the question just comes back next time.
  }
}

/** Whether this browser has answered the first-import question; never asked on the server. */
function useAsked(): [boolean, () => void] {
  const [answered, setAnswered] = useState(false);
  const stored = useSyncExternalStore(
    () => () => {},
    readAsked,
    () => true,
  );
  return [
    stored || answered,
    () => {
      rememberAsked();
      setAnswered(true);
    },
  ];
}

/**
 * Show my diary: a line saying who can see it, with the way to change that.
 * On the diary itself and on the account page.
 */
export function DiaryVisibilitySwitch({
  isPublic,
  onChange,
}: {
  isPublic: boolean;
  onChange?: () => void;
}) {
  const router = useRouter();
  const [shown, setShown] = useState(isPublic);
  // A fresh answer from the server (after a refresh, say) replaces the local one.
  const [given, setGiven] = useState(isPublic);
  if (given !== isPublic) {
    setGiven(isPublic);
    setShown(isPublic);
  }
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    setError(null);
    setShown(next);
    onChange?.();
    startTransition(async () => {
      const result = await setDiaryVisibility(next);
      if (!result.ok) {
        setShown(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
        <span>{shown ? "Others can see your diary." : "Only you can see your diary."}</span>
        <button type="button" onClick={() => change(!shown)} disabled={pending} className={quiet}>
          {shown ? "Make it private" : "Make it public"}
        </button>
      </p>
      {error && (
        <p role="alert" className="mt-1 text-xs text-error-soft">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The owner's privacy on their diary: once an import has filled it, asked
 * once per browser whether to keep it public; then the Show my diary line.
 */
export default function DiaryPrivacy({
  askFirst,
  isPublic,
}: {
  /** The diary has entries from an import. */
  askFirst: boolean;
  isPublic: boolean;
}) {
  const router = useRouter();
  const [asked, answer] = useAsked();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function makePrivate() {
    setError(null);
    startTransition(async () => {
      const result = await setDiaryVisibility(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      answer();
      router.refresh();
    });
  }

  if (askFirst && isPublic && !asked) {
    return (
      <section className="rounded-xl border border-accent/30 bg-accent/5 p-5">
        <p className="text-sm text-text">
          Your diary shows on your profile. Keep it public, or make it private?
        </p>
        {error && (
          <p role="alert" className="mt-2 text-xs text-error-soft">
            {error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={answer}
            disabled={pending}
            className={buttonClass({ size: "sm" })}
          >
            Keep it public
          </button>
          <button
            type="button"
            onClick={makePrivate}
            disabled={pending}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Make it private
          </button>
        </div>
      </section>
    );
  }

  // Changing it here answers the question too.
  return <DiaryVisibilitySwitch isPublic={isPublic} onChange={asked ? undefined : answer} />;
}
