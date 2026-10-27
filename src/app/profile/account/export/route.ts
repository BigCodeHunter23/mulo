import { NextResponse } from "next/server";
import { exportFor, exportHeaders } from "@/lib/export";
import { getCurrentUser } from "@/lib/supabase/server";
import { allowUser } from "@/lib/rate-limit";

/** Everything one person has put into MULO, as a file they can keep (see `src/lib/export.ts`). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Log in first.", { status: 401 });
  if (!(await allowUser("write", user.id))) {
    return new NextResponse("Too many requests. Try again shortly.", { status: 429 });
  }

  const { body, filename } = await exportFor(user);
  return new NextResponse(body, { headers: exportHeaders(filename) });
}
