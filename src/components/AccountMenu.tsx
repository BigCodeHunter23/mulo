"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { logout } from "@/app/login/actions";
import Avatar from "@/components/Avatar";

export type AccountProfile = {
  /** Null until they've picked one during signup. */
  username: string | null;
  name: string;
  avatarUrl: string | null;
};

type Item = { href: string; label: string };

/** Everything that belongs to the signed-in person, in the order it's reached for. */
function itemsFor(username: string | null): Item[][] {
  const mine: Item[] = username
    ? [
        { href: `/u/${username}`, label: "My profile" },
        { href: "/ratings", label: "My ratings" },
        { href: "/goat", label: "My GOAT" },
        { href: `/u/${username}/lists`, label: "My lists" },
        { href: "/badges", label: "My badges" },
      ]
    : // No username yet means signup isn't finished; that's the one place to go.
      [
        { href: "/welcome", label: "Finish setting up" },
        { href: "/ratings", label: "My ratings" },
      ];
  return [
    mine,
    [
      { href: "/stack", label: "The Stack" },
      { href: "/people", label: "People" },
    ],
    [{ href: "/profile", label: "Edit profile" }],
  ];
}

/**
 * The avatar in the header, which opens everything to do with your own
 * account: your pages, the people directory, settings and logging out.
 *
 * It behaves as a menu button: Enter, Space or the arrow keys open it, the
 * arrows, Home and End move through it, Escape closes it and hands focus back
 * to the avatar, and Tab or a click anywhere else puts it away.
 */
export default function AccountMenu({ profile }: { profile: AccountProfile }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const groups = itemsFor(profile.username);

  const entries = () =>
    Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  function focusEntry(index: number) {
    const all = entries();
    if (all.length === 0) return;
    all[(index + all.length) % all.length].focus();
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  // Changing page puts the menu away. Remembering the path it opened on, and
  // closing when that changes, keeps this out of an effect.
  const [openedOn, setOpenedOn] = useState(pathname);
  if (open && openedOn !== pathname) {
    setOpen(false);
    setOpenedOn(pathname);
  }

  // A click anywhere outside the menu or its button closes it.
  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Opening moves focus into the menu, onto the item asked for.
  const [startAt, setStartAt] = useState<"first" | "last">("first");
  useEffect(() => {
    if (!open) return;
    const all = menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (all?.length) all[startAt === "first" ? 0 : all.length - 1].focus();
  }, [open, startAt]);

  function openAt(where: "first" | "last") {
    setStartAt(where);
    setOpenedOn(pathname);
    setOpen(true);
  }

  function onButtonKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAt("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt("last");
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    const all = entries();
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusEntry(at + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusEntry(at - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusEntry(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusEntry(-1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      // Tab leaves the menu the usual way, and the menu goes with it.
      close(false);
    }
  }

  const item =
    "flex w-full items-center px-4 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text focus-visible:bg-surface-hover focus-visible:text-text focus-visible:outline-none sm:py-2";

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Your account"
        onClick={() => (open ? close(false) : openAt("first"))}
        onKeyDown={onButtonKeyDown}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Avatar url={profile.avatarUrl} name={profile.name} size="sm" eager />
      </button>

      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="Your account"
          onKeyDown={onMenuKeyDown}
          className="step-in absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 overflow-hidden rounded-xl border border-border-strong bg-surface-raised py-1.5 shadow-2xl"
        >
          <div className="border-b border-border px-4 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-medium text-text">{profile.name}</p>
            {profile.username && (
              <p className="truncate text-xs text-text-muted">@{profile.username}</p>
            )}
          </div>

          {groups.map((group, i) => (
            <div key={i} role="group" className="border-b border-border py-1">
              {group.map((entry) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => close(false)}
                  className={item}
                >
                  {entry.label}
                </Link>
              ))}
            </div>
          ))}

          <form action={logout} className="pt-1">
            <button type="submit" role="menuitem" tabIndex={-1} className={item}>
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
