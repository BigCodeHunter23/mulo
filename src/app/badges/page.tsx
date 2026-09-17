import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/** A bare /badges means your own board. */
export default async function BadgesRedirect() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  redirect(data?.username ? `/u/${data.username}/badges` : "/welcome");
}
