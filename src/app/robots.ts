import type { MetadataRoute } from "next";
import { CRAWLERS_NOT_WANTED } from "@/lib/crawlers";

/**
 * Search engines may read what people share: albums, artists and profiles.
 * Well-behaved crawlers obey this; the proxy turns away the known ones that
 * don't (`src/lib/crawlers.ts`).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: CRAWLERS_NOT_WANTED, disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        // Nothing a search result could use: machinery, and pages that need an account.
        disallow: [
          "/api/",
          "/auth/",
          "/admin",
          "/login",
          "/join/",
          "/search",
          "/stack",
          "/goat",
          "/ratings",
          "/notifications",
          "/profile",
          "/welcome",
          "/diary",
          "/lists",
          "/badges",
          "/people",
        ],
        crawlDelay: 10,
      },
    ],
  };
}
