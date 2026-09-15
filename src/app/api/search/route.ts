import { NextResponse, type NextRequest } from "next/server";
import { searchCatalog } from "@/lib/search";

/** Catalogue search for the as-you-type search box. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const results = await searchCatalog(query, 8);

  return NextResponse.json(results, {
    // Identical searches within a minute can be served from Vercel's cache.
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
