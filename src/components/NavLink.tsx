"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Whether a link points at the page you're on, or a page inside it. */
export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** A header link that shows where you are, underlined in the accent colour. */
export default function NavLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const active = isActive(usePathname(), href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative py-4 text-sm transition-colors ${
        active ? "font-medium text-text" : "text-text-secondary hover:text-text"
      } ${className}`}
    >
      {children}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-accent"
        />
      )}
    </Link>
  );
}
