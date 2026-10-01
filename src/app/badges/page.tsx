import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

/** A bare /badges means your own board. */
export default async function BadgesRedirect() {
  const user = await requireUser("/badges");

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  redirect(data?.username ? `/u/${data.username}/badges` : "/welcome");
}
