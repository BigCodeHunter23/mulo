import { redirect } from "next/navigation";
import { currentMonth } from "@/lib/rotation";

/** Bare /rotation means this month. */
export default async function RotationRedirect({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  redirect(`/u/${username}/rotation/${currentMonth()}`);
}
