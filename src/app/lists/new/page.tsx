import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { withQuery } from "@/lib/redirects";
import { mbidSchema } from "@/lib/validation";
import { coverSrc } from "@/lib/cover-url";
import ListForm from "../ListForm";

export const metadata: Metadata = { title: "New list" };

export default async function NewListPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { add } = await searchParams;
  await requireUser(withQuery("/lists/new", { add }));

  let album: { mbid: string; title: string; cover: string | null } | null = null;
  if (add && mbidSchema.safeParse(add).success) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("releases")
      .select("mbid, title, cover_art_url")
      .eq("mbid", add)
      .maybeSingle();
    if (data)
      album = {
        mbid: String(data.mbid),
        title: String(data.title),
        cover: data.cover_art_url as string | null,
      };
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <h1 className="display mb-6 text-4xl text-text">New list</h1>
      {album && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
          {album.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverSrc(album.cover, 250) ?? album.cover}
              alt=""
              className="h-12 w-12 rounded-md object-cover"
            />
          )}
          <p className="text-sm text-text-secondary">
            Starting with <span className="font-medium text-text">{album.title}</span>
          </p>
        </div>
      )}
      <ListForm releaseMbid={album?.mbid} />
    </main>
  );
}
