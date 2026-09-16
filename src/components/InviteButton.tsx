"use client";

import { useEffect, useState, useTransition } from "react";
import { getInviteLink } from "@/app/invite/actions";
import { buttonClass } from "@/components/ui";

/**
 * Shares your personal invite link. Whoever signs up through it and you end
 * up following each other, so their first feed already has someone in it.
 */
export default function InviteButton({
  label = "Invite friends",
  variant = "secondary",
}: {
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  function invite() {
    startTransition(async () => {
      const result = await getInviteLink();
      if (!result.ok) {
        setStatus(result.error);
        return;
      }

      const link = new URL(result.path, window.location.origin).toString();
      const text = "Come rate music with me on MULO.";

      if (navigator.share) {
        try {
          await navigator.share({ title: "Join me on MULO", text, url: link });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }

      try {
        await navigator.clipboard.writeText(link);
        setStatus("Invite link copied");
      } catch {
        window.prompt("Copy your invite link", link);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={invite}
      disabled={pending}
      className={buttonClass({ variant, size: "sm" })}
    >
      <span aria-live="polite">{pending ? "Getting link…" : (status ?? label)}</span>
    </button>
  );
}
