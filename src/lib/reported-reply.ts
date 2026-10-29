/**
 * A report of a reply carries the reply's words in its detail, after the
 * reporter's own: the report outlives the reply (migration 0024), and the
 * inbox still needs to see what was said.
 */

/** How much of a reported reply is kept with the report. */
export const REPLY_KEPT = 1000;

const MARK = "Reply: ";
const BETWEEN = "\n\n";

/**
 * The detail a report of a reply is filed with: the reporter's words, then
 * the reply's first 1,000 characters.
 */
export function reportDetail(said: string, body: string): string {
  const words = `${MARK}${Array.from(body).slice(0, REPLY_KEPT).join("")}`;
  return said ? `${said}${BETWEEN}${words}` : words;
}

/** A reply report's detail read back apart, or null when it carries no reply's words. */
export function replyWordsIn(detail: string | null): { said: string | null; words: string } | null {
  if (!detail) return null;
  if (detail.startsWith(MARK)) return { said: null, words: detail.slice(MARK.length) };
  const at = detail.indexOf(`${BETWEEN}${MARK}`);
  if (at < 0) return null;
  return {
    said: detail.slice(0, at),
    words: detail.slice(at + BETWEEN.length + MARK.length),
  };
}
