import { LAST_UPDATED } from "@/lib/legal";

/**
 * The shell both legal pages sit in.
 *
 * Plain English, short paragraphs, headings somebody can scan — the point of
 * these pages is to be read, which most of them quietly give up on.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-20 pt-10 sm:px-6">
      <h1 className="display text-3xl text-text sm:text-4xl">{title}</h1>
      <p className="mt-2 text-xs text-text-muted">Last updated {LAST_UPDATED}</p>
      <p className="mt-5 text-base leading-relaxed text-text-secondary">{intro}</p>
      <div className="mt-10 flex flex-col gap-9">{children}</div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="display-sm text-lg text-text">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 text-sm leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-text-muted">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
