import { login, signup } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">Log in to MULO</h1>

      {message && (
        <p className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <form className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            id="email"
            name="email"
            type="email"
            required
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <div className="flex gap-3">
          <button
            formAction={login}
            className="flex-1 rounded bg-black px-3 py-2 text-white"
          >
            Log in
          </button>
          <button
            formAction={signup}
            className="flex-1 rounded border border-black px-3 py-2"
          >
            Sign up
          </button>
        </div>
      </form>
    </div>
  );
}
