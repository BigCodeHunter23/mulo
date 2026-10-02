# MULO

A social rating site for music: rate albums, artists and songs out of 10,
follow people, and see three scores wherever something is rated (yellow for
everyone, red for you, blue for the people you follow).

Live at https://mulo-plum.vercel.app.

- How the code fits together: [docs/architecture.md](docs/architecture.md)
- Product notes and conventions for anyone (or any agent) changing it:
  [CLAUDE.md](CLAUDE.md)
- Copy and tone: [docs/voice.md](docs/voice.md)
- Supabase dashboard steps and pending migrations:
  [docs/supabase-setup.md](docs/supabase-setup.md)

## Stack

Next.js 16 (App Router) with React 19 and Tailwind v4, on Vercel in Sydney
(`syd1`). Supabase (Postgres, auth, storage) in Sydney. The catalogue comes
from MusicBrainz and is cached in Postgres; artist photos and bios from
Wikidata and Wikipedia; popularity from ListenBrainz.

## Running it locally

You need Node 22 (see `.nvmrc`) and access to a Supabase project.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

`.env.example` explains each setting. The three Supabase ones are required;
the site logs a plain message at startup for any that are missing.

**Use a test project for local work, not the live one.** The service role
key bypasses row-level security, so a local mistake with it lands on real
data.

## Commands

| Command                | What it does                                                            |
| ---------------------- | ----------------------------------------------------------------------- |
| `npm run dev`          | Development server with hot reload.                                     |
| `npm run build`        | Production build.                                                       |
| `npm run start`        | Serve the production build.                                             |
| `npm run typecheck`    | Generate route types, then check TypeScript.                            |
| `npm run lint`         | ESLint.                                                                 |
| `npm run format`       | Rewrite files with Prettier.                                            |
| `npm run format:check` | Report files Prettier would change.                                     |
| `npm test`             | Unit tests (Vitest), including replaying every migration in PGlite.     |
| `npm run test:e2e`     | Browser tests (Playwright) against a production build. Build first.     |
| `npm run check`        | Typecheck, lint, format check and unit tests in one go.                 |
| `npm run db:types`     | Regenerate `src/lib/supabase/database.types.ts` from the migrations.    |

Browser tests that sign in need a non-production Supabase project and the
`E2E_*` settings in `.env.example`; without them they skip.

## Checks on every push

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, the
Prettier check, unit tests, a production build and the browser tests on
every push and pull request. A red cross on a commit in GitHub means one of
them failed; the run's page says which.

## Deploying

A push to `master` deploys to production on Vercel. Other branches get
preview deployments.

Database changes are separate: each file in `supabase/migrations/` is run by
hand in the Supabase SQL editor, in order. Every migration is written to be
safe to run twice. If a code change depends on a migration, run the
migration first; `docs/supabase-setup.md` lists the ones still pending.

## Scripts

One-off maintenance scripts in `scripts/` run against the database named in
`.env.local`, for example:

```bash
node --env-file=.env.local scripts/seed-catalog.mjs --albums=1000
```

Each explains what it does and its options at the top of the file, including
whether it's safe to stop and rerun.
