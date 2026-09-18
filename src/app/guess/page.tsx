import type { Metadata } from "next";
import { getGuessGame } from "@/lib/guess";
import GuessGame from "./GuessGame";

export const metadata: Metadata = {
  title: "Guess the score",
  description: "Ten records. Guess what everyone on MULO gave each one.",
};

/** Every game is a fresh draw, so it can never be served from a cache. */
export const dynamic = "force-dynamic";

export default async function GuessPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string }>;
}) {
  // "Play again" points at a new ?game= value, so the game starts over rather
  // than sitting on its final score.
  const { game } = await searchParams;
  const albums = await getGuessGame(10);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Game</p>
        <h1 className="display mt-2 text-3xl text-text sm:text-4xl">Guess the score</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
          What did everyone on MULO give it? Slide, lock it in, see how close you got.
        </p>
      </header>
      <GuessGame key={game ?? "first"} albums={albums} gameId={Number(game) || 0} />
    </main>
  );
}
