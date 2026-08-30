import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-3xl font-bold">MULO</h1>
      <p className="text-gray-600">
        {user
          ? `You're logged in as ${user.email}.`
          : "Rate and review the music you listen to."}
      </p>
    </main>
  );
}
