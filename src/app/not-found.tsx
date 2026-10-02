import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="display text-2xl text-text">Page not found</h1>
      <p className="text-sm text-text-secondary">
        We couldn&rsquo;t find what you were looking for.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <ButtonLink href="/search">Search music</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Go home
        </ButtonLink>
      </div>
    </main>
  );
}
