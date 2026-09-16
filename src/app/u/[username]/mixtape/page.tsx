import { redirect } from "next/navigation";
import { currentMonth } from "@/lib/mixtape";

/** A bare /mixtape means this month's. */
export default async function MixtapeRedirect({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  redirect(`/u/${username}/mixtape/${currentMonth()}`);
}
