import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { getList, LIST_LIMIT } from "@/lib/lists";
import Avatar from "@/components/Avatar";
import ReportButton from "@/components/ReportButton";
import ShareButton from "@/components/ShareButton";
import ListItems from "./ListItems";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const list = await getList(Number((await params).id));
  if (!list) return { title: "List" };
  const title = `${list.title} — a list by ${list.owner.name}`;
  const description =
    list.description ?? `${list.items.length} albums picked by ${list.owner.name} on MULO.`;
  return { title, description, openGraph: { type: "website", siteName: "MULO", title, description } };
}

export default async function ListPage({ params }: { params: Params }) {
  const [list, user] = await Promise.all([getList(Number((await params).id)), getCurrentUser()]);
  if (!list) notFound();
  const own = user?.id === list.ownerId;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          {list.ranked ? "Ranked list" : "List"}
          <span className="text-text-muted"> · {list.items.length} album{list.items.length === 1 ? "" : "s"}</span>
        </p>
        <h1 className="display mt-2 text-balance text-4xl text-text sm:text-5xl">{list.title}</h1>
        <Link href={`/u/${list.owner.username}`} className="mt-3 inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text">
          <Avatar url={list.owner.avatarUrl} name={list.owner.name} size="sm" />
          {list.owner.name}
        </Link>
        {list.description && (
          <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-text-secondary">{list.description}</p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <ShareButton
            url={`/lists/${list.id}`}
            title={`${list.title}, a list by ${list.owner.name}`}
            text={`${list.title}: ${list.items.length} albums on MULO`}
          />
          {!own && <ReportButton listId={list.id} signedIn={Boolean(user)} />}
        </div>
      </header>

      <ListItems
        list={{ id: list.id, title: list.title, description: list.description, ranked: list.ranked }}
        items={list.items}
        editable={own}
        limit={LIST_LIMIT}
      />
    </main>
  );
}
