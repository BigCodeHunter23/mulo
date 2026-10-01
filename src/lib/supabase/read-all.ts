import "server-only";

/**
 * The most rows the API returns for one request: PostgREST's `max-rows`,
 * 1,000 on Supabase unless changed in the dashboard. A query that asks for
 * more quietly gets this many, with no error to say anything was left out.
 */
export const PAGE_SIZE = 1000;

type PageResult<Row> = { data: Row[] | null; error: { message: string } | null };

/**
 * Every row a query matches, read a page at a time, up to `max`.
 *
 * `page(from, to)` builds one page's query and ends it with `.range(from, to)`.
 * It must be ordered by something unique, or pages can overlap and skip rows.
 * On an error it stops and hands back the error with whatever came before
 * it, so a caller treats it exactly as it would a single query's result.
 */
export async function readAll<Row>(
  page: (from: number, to: number) => PromiseLike<PageResult<Row>>,
  max = 20_000,
): Promise<{ data: Row[]; error: { message: string } | null }> {
  const rows: Row[] = [];
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, max) - 1;
    const { data, error } = await page(from, to);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < to - from + 1) break;
  }
  return { data: rows, error: null };
}
