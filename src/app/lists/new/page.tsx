import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { coverSrc } from "@/lib/cover-url";
import ListForm from "../ListForm";

export const metadata: Metadata = { title: "New list" };

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewListPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { add } = await searchParams;
  let album: { mbid: string; title: string; cover: string | null } | null = null;
  if (add && MBID.test(add)) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("releases")
      .select("mbid, title, cover_art_url")
      .eq("mbid", add)
      .maybeSingle();
    if (data) album = { mbid: String(data.mbid), title: String(data.title), cover: data.cover_art_url as string | null };
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <h1 className="display mb-6 text-4xl text-text">New list</h1>
      {album && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
          {album.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverSrc(album.cover, 250) ?? album.cover} alt="" className="h-12 w-12 rounded-md object-cover" />
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
