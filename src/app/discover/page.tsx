import type { Metadata } from "next";
import DiscoverSections from "@/components/DiscoverSections";

export const metadata: Metadata = {
  title: "Discover",
  description:
    "The most-played albums, the best rated on MULO, and what people are rating right now.",
};

export default function DiscoverPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-8 sm:px-6">
      <DiscoverSections search />
    </main>
  );
}
