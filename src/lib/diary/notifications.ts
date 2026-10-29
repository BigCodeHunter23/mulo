import "server-only";
import type { Notification } from "@/lib/app-api";
import { IMPORT_SOURCES, type ImportSource } from "@/lib/diary-shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable, logQueryError } from "@/lib/supabase/errors";

type ImportLine = Extract<Notification, { kind: "diary-import" }>;

const isImportSource = (value: string): value is ImportSource =>
  (IMPORT_SOURCES as readonly string[]).includes(value);

/**
 * "Your Last.fm history is in: 820 albums to rate." for each source whose
 * latest import added something. Read with the service role, since the
 * sources are private to their owner; only ever for that owner.
 */
export async function diaryImportNotifications(userId: string): Promise<ImportLine[]> {
  const { data, error } = await createAdminClient()
    .from("diary_sources")
    .select("source, last_import_at, last_count")
    .eq("user_id", userId)
    .not("last_import_at", "is", null);
  if (error) {
    // Before migration 0025 there's no diary, and nothing to say.
    if (!isMissingTable(error)) logQueryError("diary", error);
    return [];
  }
  return (data ?? []).flatMap((row): ImportLine[] => {
    const count = row.last_count ?? 0;
    const at = row.last_import_at;
    if (count <= 0 || !at || !isImportSource(row.source)) return [];
    return [
      {
        kind: "diary-import",
        key: `diary-import-${row.source}-${at}`,
        at,
        source: row.source,
        count,
      },
    ];
  });
}

/** The newest finished import, for the bell's dot. */
export async function latestDiaryImportAt(userId: string): Promise<string | null> {
  const lines = await diaryImportNotifications(userId);
  return lines.map((line) => line.at).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}
