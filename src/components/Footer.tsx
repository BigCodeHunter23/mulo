import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/legal";

/**
 * The quiet line at the bottom of every page. Somebody looking for the
 * privacy policy, the terms or a human is looking down here.
 */
export default function Footer() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-xs text-text-muted sm:px-6">
        <span className="display text-sm text-text-secondary">MULO</span>
        <Link href="/privacy" className="transition-colors hover:text-text">
          Privacy
        </Link>
        <Link href="/terms" className="transition-colors hover:text-text">
          Terms
        </Link>
        <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-text">
          Get in touch
        </a>
        <span className="ml-auto">For music lovers</span>
      </div>
    </footer>
  );
}
