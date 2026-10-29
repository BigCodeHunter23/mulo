/** One call made on a fake query: the table, the method and its arguments. */
export type Call = { table: string; method: string; args: unknown[] };

export type FakeSupabase = ReturnType<typeof fakeSupabase>;

/**
 * A stand-in Supabase client for lib tests. Each `from(table)` takes the next
 * answer queued for that table (`{ data: null, error: null }` when none is),
 * records every method called on it, and answers when awaited however the
 * query is chained, `maybeSingle()` and `single()` included.
 */
export function fakeSupabase() {
  const answers = new Map<string, unknown[]>();
  const calls: Call[] = [];

  const client = {
    from(table: string) {
      const result = answers.get(table)?.shift() ?? { data: null, error: null };
      calls.push({ table, method: "from", args: [table] });
      const chain: unknown = new Proxy(() => {}, {
        get(_target, method) {
          if (method === "then") {
            return (resolve: (value: unknown) => unknown) => resolve(result);
          }
          return (...args: unknown[]) => {
            calls.push({ table, method: String(method), args });
            return chain;
          };
        },
      });
      return chain;
    },
  };

  return {
    client,
    calls,
    /** Queues answers for a table, one for each `from(table)` in turn. */
    answer(table: string, ...results: unknown[]) {
      answers.set(table, [...(answers.get(table) ?? []), ...results]);
    },
    /** The calls made on one table. */
    callsOn(table: string) {
      return calls.filter((call) => call.table === table);
    },
  };
}
