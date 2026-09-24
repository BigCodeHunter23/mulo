import { NextResponse, type NextRequest } from "next/server";
import { searchCatalog } from "@/lib/search";
import { friendsForResults, NO_FRIENDS } from "@/lib/ratings";
import { getCurrentUser } from "@/lib/supabase/server";

/** Catalogue search for the as-you-type search box. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const results = await searchCatalog(query, 8);

  // Who you follow has rated what belongs to one person, so a signed-in
  // search must never be handed to the next person out of a shared cache.
  const user = await getCurrentUser();
  const friends = user ? await friendsForResults(results) : NO_FRIENDS;

  return NextResponse.json(
    { ...results, friends },
    {
      headers: {
        "Cache-Control": user
          ? "private, no-store"
          : // Identical searches within a minute can be served from Vercel's cache.
            "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
