import type { NextRequest } from "next/server";
import { z } from "zod";
import type { DiarySettings, SaveResult } from "@/lib/app-api";
import { appJson, appRoute, limitReads, readBody, signedInCaller } from "@/lib/app-route";
import { setDiaryPublic } from "@/lib/diary/entries";
import { allowUser, RateLimitedError } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/** Show my diary: whether others see it. On until it's switched off (and before 0025). */
export const GET = appRoute(async () => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  await limitReads(user);
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("diary_public")
    .eq("id", user.id)
    .maybeSingle();
  return appJson<DiarySettings>({ public: data?.diary_public ?? true });
});

export const PATCH = appRoute(async (request: NextRequest) => {
  const user = await signedInCaller();
  if (user instanceof Response) return user;
  if (!(await allowUser("write", user.id))) throw new RateLimitedError("write");
  const body = await readBody(request, z.object({ public: z.boolean() }).strict());
  if (body instanceof Response) return body;
  return appJson<SaveResult>(await setDiaryPublic(user.id, body.public));
});
