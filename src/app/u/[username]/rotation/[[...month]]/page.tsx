import { redirect } from "next/navigation";
import { currentMonth } from "@/lib/mixtape";

/** The monthly recap was briefly called Rotation; old links still land. */
export default async function OldRotationLink({
  params,
}: {
  params: Promise<{ username: string; month?: string[] }>;
}) {
  const { username, month } = await params;
  redirect(`/u/${username}/mixtape/${month?.[0] ?? currentMonth()}`);
}
