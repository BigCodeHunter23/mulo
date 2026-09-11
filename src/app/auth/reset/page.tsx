import ResetForm from "./ResetForm";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <ResetForm expired={expired === "1"} />
    </main>
  );
}
