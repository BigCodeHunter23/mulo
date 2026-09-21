"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sizedAvatar } from "@/lib/record-avatar";
import { isActive } from "@/components/NavLink";

const ICON = "h-6 w-6";

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={ICON} fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function DiscoverIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={ICON} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" fill={active ? "currentColor" : "none"} />
    </svg>
  );
}

function StackIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={ICON} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <rect x="6.5" y="3" width="11" height="6" rx="1.5" />
      <rect x="4" y="9.5" width="16" height="11.5" rx="1.5" fill={active ? "currentColor" : "none"} />
    </svg>
  );
}

function VersusIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={ICON} fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={ICON} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

/**
 * The tab bar along the bottom on phones, where a thumb can reach it: your
 * feed first, then the places people go most. Wider screens use the header.
 */
export default function MobileNav({
  profile,
}: {
  /** Signed in: where their profile is and what their picture looks like. */
  profile: { href: string; avatarUrl: string | null; name: string } | null;
}) {
  const pathname = usePathname();

  // Signup is its own focused flow, with its own bar along the bottom.
  if (pathname.startsWith("/welcome")) return null;

  const tab = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
      active ? "text-accent" : "text-text-muted active:text-text"
    }`;

  const home = isActive(pathname, "/");
  const discover = isActive(pathname, "/discover");
  const stack = isActive(pathname, "/stack");
  const versus = isActive(pathname, "/versus");
  const me = profile
    ? isActive(pathname, profile.href) || isActive(pathname, "/profile")
    : isActive(pathname, "/login");

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
    >
      <div className="flex h-14">
        <Link href="/" aria-current={home ? "page" : undefined} className={tab(home)}>
          <HomeIcon active={home} />
          Home
        </Link>
        <Link href="/discover" aria-current={discover ? "page" : undefined} className={tab(discover)}>
          <DiscoverIcon active={discover} />
          Discover
        </Link>
        <Link href="/stack" aria-current={stack ? "page" : undefined} className={tab(stack)}>
          <StackIcon active={stack} />
          Stack
        </Link>
        <Link href="/versus" aria-current={versus ? "page" : undefined} className={tab(versus)}>
          <VersusIcon active={versus} />
          Versus
        </Link>
        {profile ? (
          <Link href={profile.href} aria-current={me ? "page" : undefined} className={tab(me)}>
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sizedAvatar(profile.avatarUrl, 96)}
                alt=""
                className={`h-6 w-6 rounded-full object-cover ring-2 ${me ? "ring-accent" : "ring-transparent"}`}
              />
            ) : (
              <PersonIcon />
            )}
            You
          </Link>
        ) : (
          <Link href="/login" aria-current={me ? "page" : undefined} className={tab(me)}>
            <PersonIcon />
            Log in
          </Link>
        )}
      </div>
    </nav>
  );
}
