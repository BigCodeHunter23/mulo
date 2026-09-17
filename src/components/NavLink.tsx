"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Whether a link points at the page you're on, or a page inside it. */
export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** A header link that shows where you are. */
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
      className={`text-sm transition-colors ${
        active ? "text-text" : "text-text-secondary hover:text-text"
      } ${className}`}
    >
      {children}
    </Link>
  );
}
