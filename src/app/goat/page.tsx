import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getPickSuggestions, getTopPicks, type PickKind } from "@/lib/top-picks";
import GoatBuilder from "./GoatBuilder";

export const metadata: Metadata = { title: "Select your GOAT" };

const TABS = [
  { param: "artists", label: "Artists", kind: "artist" as const },
  { param: "albums", label: "Albums", kind: "album" as const },
];

export default async function GoatPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const tab = TABS.find((t) => t.param === kind) ?? TABS[0];
  const pickKind: PickKind = tab.kind;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  // Picks hang off a profile, so a username comes first.
  if (!profile) redirect("/welcome");

  const [picks, suggestions] = await Promise.all([
    getTopPicks(user.id, pickKind),
    getPickSuggestions(user.id, pickKind),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-8 sm:px-6">
      <h1 className="display text-3xl text-text sm:text-4xl">Select your GOAT</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">
        Your top ten, ranked. Number one wears the crown. The list shows on your
        profile, and in the preview when you send someone your link.
      </p>

      <nav
        aria-label="Artists or albums"
        className="mt-7 flex gap-1 rounded-lg border border-border bg-surface p-1 sm:w-fit"
      >
        {TABS.map((t) => (
          <Link
            key={t.param}
            href={`/goat?kind=${t.param}`}
            aria-current={t.kind === pickKind ? "page" : undefined}
            className={`flex-1 rounded-md px-5 py-2.5 text-center text-sm font-medium transition-colors sm:flex-none sm:py-1.5 ${
              t.kind === pickKind
                ? "bg-surface-raised text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8">
        <GoatBuilder
          key={pickKind}
          kind={pickKind}
          initial={picks}
          suggestions={suggestions.picks}
          suggestionSource={suggestions.source}
          username={profile.username}
        />
      </div>
    </main>
  );
}
