import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { diaryHref } from "@/lib/diary-shared";
import { getEditableProfile } from "@/lib/social";

/** Your own diary (what the import push and bell line open). */
export default async function MyDiary({
  searchParams,
}: {
  searchParams: Promise<{ lastfm?: string }>;
}) {
  const user = await requireUser("/diary");
  const profile = await getEditableProfile(user.id);
  if (!profile) redirect("/welcome");
  const { lastfm } = await searchParams;
  const outcome = lastfm === "connected" || lastfm === "failed" ? `?lastfm=${lastfm}` : "";
  redirect(`${diaryHref(profile.username)}${outcome}`);
}
