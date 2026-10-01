"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { loginPath, signupPath } from "@/lib/redirects";

/**
 * A link to log in (or sign up) that comes back to this page afterwards.
 * Asked to log in from an album, you should land on that album, not Home.
 */
export default function LoginLink({
  mode = "login",
  className,
  children,
  ...rest
}: {
  mode?: "login" | "signup";
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  const pathname = usePathname();
  // Coming back to the login page itself would only bounce to Home.
  const here = pathname.startsWith("/login") || pathname.startsWith("/auth") ? null : pathname;

  return (
    <Link href={mode === "signup" ? signupPath(here) : loginPath(here)} className={className} {...rest}>
      {children}
    </Link>
  );
}
