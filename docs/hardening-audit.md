# MULO hardening audit (Phase 0)

Audit date: 2026-10-01, at commit `3cac95e` on `master`. This phase was
read-only: no application code was changed.

**How it was checked.** Every route, server action, API route, Supabase client
and migration was read; the rest of `src/` was read in part, by search and by
spot checks. These were run:

- `npm audit` and `npm outdated`
- `eslint`
- `next typegen` followed by `tsc --noEmit`
- `next build`, with placeholder Supabase values

**What was not possible.** The Supabase dashboard (auth settings, storage
policies, PostgREST limits) and the live database were not available. So the
login problems were diagnosed from the code, not reproduced against the live
project; see Â§2.1 and the open questions.

**Baseline.** Lint, typecheck and production build all pass under Node 22.
There are no tests. The local machine has Node 20.5.0, which is too old for
Next 16 (it needs â‰¥ 20.9). A portable Node 22 was used for these checks.

---

## 0. Urgent: fix before anything else

| # | Finding | Action |
|---|---|---|
| **C1** | **Critical RCE in Next 16.3.3.** GHSA-vcvr-r3jv-pc5j (CVSS 9.5) affects the Node.js `ImageResponse` from `next/og` in 16.2.0 to 16.3.5. MULO uses it on about a dozen routes: every `opengraph-image.tsx`, `/records/[mbid]`, and the `*/story` routes. These routes render user-controlled text (usernames, display names, list titles) and images fetched from user-influenced URLs (`avatar_url`). | Bump `next` and `eslint-config-next` to `16.3.8` (exact pin, as now). Build, deploy, and confirm on Vercel. One small commit. |

I recommend this ships as a standalone hotfix the moment you approve, ahead of
the rest of Phase 1.

**No secrets found.** `.env*` has always been gitignored. A scan of the full
git history found no JWTs, service-role keys or `sb_secret_` strings.

---

## 1. Stack and architecture map

| Area | What's there |
|---|---|
| Framework | Next.js **16.3.3**, **App Router**, Turbopack build. React 19.2.8, Tailwind v4 (tokens in `src/app/globals.css`). |
| Request hook | `src/proxy.ts` (Next 16's replacement for `middleware.ts`) runs on every non-asset request. It only refreshes the Supabase session; it enforces no access rules. |
| Data layer | Supabase Postgres through `@supabase/supabase-js` and `@supabase/ssr`. There is no ORM and no generated DB types. Queries live in `src/lib/*.ts`, most marked `server-only`. Schema is in `supabase/migrations/0001` to `0015`, which the owner runs by hand in the SQL editor. Nothing records which migrations have been applied. |
| Supabase clients | Four of them. `server.ts` uses the cookie session (the user's RLS identity). `public.ts` is anonymous, for catalogue reads. `admin.ts` uses the service role and bypasses RLS; it is used for catalogue caching, avatar upload, invites and admin. `client.ts` is the browser client, and **nothing imports it**. |
| Auth | Supabase email + password. `getClaims()` verifies the JWT, locally when keys are asymmetric. The session lives in `sb-*` cookies set by `@supabase/ssr`. Sign-up, login and logout are server actions in `src/app/login/actions.ts`. Password reset goes through `/auth/reset`, then `/auth/confirm`, then `/auth/update-password`. |
| Authorization | **Postgres RLS is the real gate.** Server actions check `getCurrentUser()`, then write as that user. Admin is decided by an email allowlist (`ADMIN_EMAILS`) plus the service role. |
| Hosting | Vercel, region `syd1` (`vercel.json`). A push to `master` deploys. `next.config.ts` is empty. |
| Env vars | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAILS`, `NEXT_PUBLIC_SITE_URL` (optional; falls back to `VERCEL_PROJECT_PRODUCTION_URL`). There is no `.env.example` and no validation. |
| Third-party APIs | MusicBrainz (catalogue; throttled to about 1 request per second per server instance), Cover Art Archive, Wikidata and Wikipedia (artist photo and bio), ListenBrainz (popularity and hits), Apple iTunes Search (30-second previews, called from the browser), Google Fonts (OG images). |

**How a request flows.** A request arrives and `proxy.ts` refreshes the session
cookie. Then the root layout renders. Its `Header` reads cookies, which makes
every route dynamic. Then the page, a Server Component, runs:

- It calls `src/lib/*` functions.
- Those call `createClient()` (as the user, under RLS) or `createPublicClient()`
  / `createAdminClient()`.
- Catalogue misses fetch from MusicBrainz and upsert with the service role.

Mutations are server actions (`src/app/**/actions.ts`). Each one calls
`getCurrentUser()`, does light hand-rolled validation, writes as the user
(RLS enforces ownership), and then calls `revalidatePath`.

---

## 2. Security findings (ranked)

Severity takes into account that **the anon key is not currently shipped to
the browser**: `client.ts` is unused, and the build output has no Supabase URL
or key. That makes direct PostgREST calls harder today. But Supabase treats the
anon key as public, and the first client-side Supabase call would expose it.
So the database itself must enforce every rule. "Latent" below means
exploitable once the anon key is known.

### 2.1 Authentication: why logins "don't work as expected"

These root causes come from the code. L2 and L3 depend on dashboard settings
that I could not see.

| # | Sev | Root cause | Evidence | Symptom users see |
|---|---|---|---|---|
| L1 | High | **The return path is thrown away.** `login` always calls `redirect("/")`. Every "Log in" link is a bare `/login`. Protected pages call `redirect("/login")` with no `next`. The one place that passes `?next=` (`/u/[username]/vs`) is ignored by the login page. | `src/app/login/actions.ts:50`, `src/app/login/page.tsx`, `src/app/u/[username]/vs/page.tsx:105`, about 15 `href="/login"` sites | You log in from an album or Versus and land on Home instead. It feels like the login "didn't take". |
| L2 | High (likely) | **The confirmation link is never exchanged.** `signUp()` passes no `emailRedirectTo`, so the link goes to the dashboard **Site URL**. With `@supabase/ssr` (PKCE), Supabase then redirects to `SiteURL/?code=â€¦`. Nothing at `/` exchanges a `code`; only `/auth/confirm` does, and only reset emails point there. If Site URL is still `http://localhost:3000`, the link breaks completely. The default template also fails when the link is opened in a different browser or device from the one that signed up. | `src/app/login/actions.ts:56`, `src/app/auth/confirm/route.ts` | You click "confirm", land on Home **signed out**, and have to log in again. On a phone's mail app the link may "do nothing". |
| L3 | Medium | **Sign-up side effects only run when confirmation is off.** `connectInvite` (mutual follow with the inviter) and the `/welcome?intro=1` redirect only run when `signUp` returns a session immediately. | `src/app/login/actions.ts:62-72` | Invite links "don't work". New users miss the intro cards. |
| L4 | Medium | **Logout signs out every device.** `supabase.auth.signOut()` defaults to `scope: "global"`. | `src/app/login/actions.ts:90` | Logging out on your phone silently logs you out on your laptop: "my session keeps disappearing". |
| L5 | Medium | **Logout is hard to find.** The header shows Log out only at `lg` and up. On phones and tablets it sits at the bottom of Edit profile, which you reach only through your profile page. | `src/components/Header.tsx:117`, `src/app/profile/page.tsx:47` | "I can't log out." |
| L6 | Low | **The auth form keeps the other tab's message.** Its state is shared across the Log in / Sign up toggle, so a login error stays visible after switching to Sign up, and the reverse. Unknown Supabase errors fall through raw. | `src/app/login/AuthForm.tsx:38-40`, `friendlyError` | Confusing or stale errors. |
| L7 | Low | **Session cookies use library defaults.** `httpOnly` is false, which only the unused browser client needs, and `secure` is not set explicitly. | `src/lib/supabase/{server,middleware}.ts` (no `cookieOptions`) | Defence in depth: tokens can be read by any XSS. |
| L8 | Low | **The reset link is built from request headers.** `redirectTo` comes from the request's `Origin`/`Host`, not from `siteUrl()`. Whether this can be abused depends on the dashboard's redirect allowlist; wildcards would make it exploitable. | `src/app/auth/reset/actions.ts:7-15` | Possible poisoned reset link. |

Not a problem: server-side auth resolution. The header is server-rendered from
the cookie, so there is **no flash of the wrong nav state** today. That should
be kept.

### 2.2 Other security findings

| # | Sev | Finding | Where | Fix direction |
|---|---|---|---|---|
| H1 | High | **No rate limiting or abuse control anywhere.** Unauthenticated GETs to `/album/<any-uuid>`, `/artist/<any-uuid>` and `/records/<uuid>` trigger MusicBrainz, Wikidata and Cover Art fetches, then **service-role upserts**. So anyone can grow the DB, burn Vercel compute, and get MULO's User-Agent banned by MusicBrainz. The roughly a dozen OG and story image routes are CPU-heavy and unauthenticated. `/api/search/wider` proxies MusicBrainz search. Write actions (reports, takes, nominations, lists, follows) have no limits either. Supabase Auth's built-in limits cover only the auth endpoints. | `src/lib/catalog.ts`, `src/app/api/search/*`, all `opengraph-image.tsx` | Validate the MBID shape before any lookup. Put a rate limit on catalogue misses, wider search, image routes and write actions. Mechanism is an open question (Q5). |
| M1 | Medium (latent) | **The database doesn't constrain profile fields.** RLS lets a user update *any* column of their own `profiles` row. The rules live only in the server action: the username regex, the avatar coming from storage. Through the API a user could: set `avatar_url` to any URL (third-party tracking pixel for every viewer, and see M2); register `Alice` beside `alice` (`unique` is case-sensitive), which allows impersonation; use usernames that break routes; or write unbounded `bio`, `display_name` and `ratings.review` (`artist_ratings` caps at 1,000; `ratings` doesn't). | `0001_profiles.sql`, `0003_ratings.sql` | Migration with CHECK constraints (username pattern, length caps, `avatar_url` limited to the storage prefix or `/records/<uuid>`) and a unique index on `lower(username)`. Needs a check for existing violations first (Q3). |
| M2 | Medium (latent) | **SSRF and unbounded download in the OG renderer.** `loadImage()` fetches any URL it is given: no host allowlist, no size cap. It accepts any `image/*` type, including `image/svg+xml`, which feeds straight into C1. `avatar_url` reaches it in four routes. | `src/lib/og.tsx:75-136` | Host allowlist (Supabase storage, Cover Art Archive, Wikimedia, own origin), byte cap, and refuse SVG. |
| M3 | Medium | **No security headers.** No CSP, no `frame-ancestors` / `X-Frame-Options` (one-click actions like rate, follow and vote can be clickjacked), no `Referrer-Policy`, `Permissions-Policy` or `X-Content-Type-Options`. | `next.config.ts` is empty | `headers()` in `next.config.ts`. Ship CSP as Report-Only first. |
| M4 | Medium | **Input validation is hand-rolled and inconsistent.** The MBID regex is copied into 5+ files. Report IDs go through `Number()` unchecked (NaN reaches the DB). `/auth/confirm` casts `type` blindly. Page params (`mbid`, `username`, `month`, `id`) are mostly unvalidated before DB or MusicBrainz calls. | `src/app/report/actions.ts`, `src/app/auth/confirm/route.ts`, `src/app/*/[mbid]/page.tsx` | Shared zod schemas at every action, route and param boundary (see Â§8, dependencies). |
| M5 | Medium | **The safe-redirect check can be bypassed.** `safeNext` accepts `/\evil.com`, which browsers normalise to `//evil.com`, so it becomes an open redirect. It isn't reachable in practice today (it needs a valid OTP, or a form post protected by CSRF), but L1's fix will route login through it, so it has to be correct first. | `src/app/auth/confirm/route.ts:7`, `src/app/profile/actions.ts:15` | One shared `safeRedirectPath()` that parses against the site origin, with tests. |
| M6 | Medium | **Privacy: almost everything is world-readable** by RLS (`select using (true)`): all profiles, follows, every rating and review, every Versus vote with user ID, and takes. The `/people` directory lists up to 200 profiles to logged-out visitors. No email or other private field is exposed (good). Hiding pages only in the UI won't change what the API returns (see M1's caveat). | `/people`, migrations | Decide the policy (Q1), then enforce it in both the page and RLS. |
| L-a | Low | **"Hidden until you pick" is UI-only.** The Versus split and takes are hidden in the UI, but `versus_votes` and `versus_takes` are publicly readable. | `0010`, `0012` | Accept, or expose tallies through a view. Product call; noted only. |
| L-b | Low | **Raw errors reach users.** Raw Supabase or Postgres messages are shown in reports, profile save, password update and reset. | various actions | Map to friendly messages; log the raw one. |
| L-c | Low | **Admin is an email in the JWT.** Fine with confirmation on. If confirmation is ever turned off, anyone could register an `ADMIN_EMAILS` address that isn't signed up yet. Admin actions fail silently and leave no audit trail. | `src/lib/moderation.ts` | Check `email_verified` (or move to `app_metadata.role`). Return results. Log actions. |
| L-d | Low | **Avatar upload trusts the file type the browser declares.** Storage bucket policies for `avatars` and `covers` are not in migrations. | `src/app/profile/actions.ts:30` | Check the file's magic bytes. Capture bucket policies in a migration (Q2). |
| L-e | Low | **`brace-expansion` (high)** is dev-only, through ESLint. | `npm audit` | `npm audit fix`. |

**Checked and fine.**

- **CSRF.** Server actions carry Next's Origin/Host check, and route handlers
  are GET-only with no user-attributable side effects.
- **XSS.** There is no `dangerouslySetInnerHTML`. React escapes output. Hrefs
  are built with a leading `/`.
- **SQL/filter injection.** supabase-js parameterises. The one `.or()` filter
  string (`src/lib/search.ts:69`) is correctly quoted and escaped.
- **Service-role client.** It is `server-only` and never imported into a client
  component.
- **RLS write policies** check `auth.uid()` on every user table. UPDATE
  policies without `WITH CHECK` fall back to `USING`, which is correct. List
  items check ownership through the parent list.

### 2.3 Route access matrix

**Current** is what the code does today. **Proposed** is my recommendation,
pending Q1.

| Route | Current | Proposed |
|---|---|---|
| `/`, `/discover`, `/charts`, `/search`, `/drop`, `/guess`, `/versus`, `/versus/[day]` | public (signed-in extras) | public |
| `/album/[mbid]`, `/artist/[mbid]` | public | public |
| `/lists`, `/lists/[id]` | public; owner editing is UI-gated and RLS-enforced | public; owner-only edit, verified server-side too |
| `/u/[username]` and `/badges`, `/lists`, `/mixtape/*`, `/milestone/*`, `/ranks/*` | public | **public**: these are the share targets of the OG and story cards |
| `/u/[username]/follows` | public | **authed?** (Q1) |
| `/people` | **public** | **authed** (Q1) |
| `/join/[code]` | public | public |
| `/u/[username]/vs`, `/stack`, `/goat`, `/ratings`, `/notifications`, `/profile`, `/profile/raised-on`, `/welcome`, `/lists/new`, `/badges`, `/artist/[mbid]/gauntlet` | authed; redirect to `/login` **without return path** | authed; redirect to `/login?next=<path>` through one helper |
| `/auth/update-password` | needs the recovery session | same |
| `/admin/reports` and its actions | admin (404 otherwise) | admin, with verified email |
| `/api/search`, `/api/search/wider` | public, CDN-cached | public, rate-limited |
| `/api/notifications/unread` | authed (otherwise `false`) | same |
| OG images, `*/story`, `/records/[mbid]` | public | public, with hardened fetches and rate limits |
| Server actions: rate, review, follow, react, lists, GOAT, versus, mixtape, raised-on, invite, report | authed + RLS ownership | same, plus zod and rate limits |

---

## 3. Architecture findings

- **No generated DB types.** There are about 60 `as unknown as Row[]` casts,
  and PostgREST join shapes are hand-normalised (`Array.isArray(joined) ? â€¦`)
  in several places. This is the single biggest source of "trust me" code.
- **Duplicated logic.**
  - The MBID/UUID regex appears in `goat`, `lists`, `ratings`, `raised-on`
    and `versus` actions.
  - `safeNext` appears twice.
  - There are many separate `TRY_AGAIN` constants and result types.
  - "Person row" markup is re-implemented in `app/page.tsx` (`PeopleToFollow`)
    and `welcome` instead of using `PersonRow`.
  - `error.tsx` and `not-found.tsx` hand-write button classes instead of
    `buttonClass()`.
- **Layering.** `src/lib/*` mixes data access, domain rules (seeding,
  weighting, badges) and session lookup. Functions call `getCurrentUser()`
  internally, so auth dependencies are invisible from the call site. It is
  already roughly feature-per-file, which is a good base for incremental
  change.
- **Inconsistent error handling.** Reads ignore `error` almost everywhere
  (`const { data } = â€¦`), so a DB outage renders as an empty state instead of
  an error. Actions variously return `{ok,error}`, return `void` (admin), or
  `redirect`. Nothing is logged.
- **Runtime schema sniffing.** Code keeps working whichever migrations have
  been run (`seedColumnsExist`, select fallbacks for takes and lists in the
  admin page). It was a sensible workaround for hand-run migrations, but it
  hides drift. Once the migration state is confirmed, delete it.
- **Small items.** `src/lib/supabase/server.ts` lacks `import "server-only"`.
  `src/lib/supabase/client.ts` is dead code. Module-level mutable state
  (MusicBrainz queue, `seedColumnsExist`) is per serverless instance, so the
  "1 request per second" MusicBrainz limit isn't global.
- **Client/server split is reasonable.** About 45 of about 230 files are
  `"use client"`, mostly genuinely interactive. This isn't sprawl. A few large
  client components (`GoatBuilder` 555 lines, `RaisedOnPicker` 540,
  `SearchClient` 481, `StackDeck` 424) are candidates for splitting, not
  rewriting.

## 4. Performance findings

- **Aggregation in JS over raw rows, silently truncated at 1,000 rows.**
  PostgREST caps a response at `max-rows` (1,000 by default; the repo's own
  CLAUDE.md notes it).
  - `getProfileStats` fetches *every* score a user has to count and average
    them, so it is wrong past 1,000.
  - Charts request 20,000 rows but get 1,000, so they are **wrong once the
    site has more than 1,000 ratings** of a kind.
  - `getScores` fetches all ratings of an item.
  - `getTopSongs` uses `.limit(5000)` and `getCrowd` uses 2,000.

  Move these to SQL (views or RPC with `avg`/`count`, or `count: "exact"`).
  This is a correctness fix as well as a performance one.
- **Very large `.in()` lists.** Charts pass every rated MBID to
  `.in("mbid", â€¦)`, so the URL grows with the catalogue and will hit URL
  length limits.
- **No caching at all.** Every route is dynamic, because the root-layout
  `Header` reads cookies. There is no `revalidate`, `"use cache"` or
  `unstable_cache`. Charts, Discover and catalogue pages recompute on every
  hit. Next 16's caching APIs should be read in `node_modules/next/dist/docs`
  before choosing an approach (per `AGENTS.md`).
- **Repeated per-request queries.**
  - `getFollowingIds` isn't wrapped in `cache()`, so a single album page asks
    for the viewer's follow list several times.
  - `getFriendRaters` makes 4 sequential round trips.
  - Notifications run about 12 queries, and the bell calls that API after
    *every* navigation.
- **Unbounded or unpaginated lists.** `/people` caps at 200 with no paging.
  Follows cap at 500, `/ratings` loads everything, and lists are fetched whole.
- **Search uses `ilike '%â€¦%'`** on `artists.name`, `search_names`,
  `releases.title` and `artist_credit` with no trigram index, so it scans
  sequentially as the catalogue grows. Add `pg_trgm` GIN indexes.
- **Images.** Plain `<img>` everywhere, with `next/image` deliberately
  avoided; covers are already served at fixed thumbnail sizes. I'd keep this
  (`next/image` adds Vercel optimisation cost for little gain here) and make
  sure each one has `width`/`height` to prevent layout shift.
- **Loading states.** A root `loading.tsx` plus route-specific ones exist, and
  Suspense is used on Home. That part is fine.

## 5. Reliability findings

- `error.tsx` doesn't take or log `error`, and its copy blames "the music
  database" for every failure. There is no `global-error.tsx`, so a root
  layout failure (for example the Header's DB call) has no boundary.
- **No logging or observability** beyond Vercel's default function logs. Errors
  are swallowed in many `catch {}` blocks.
- **No env validation.** `process.env.X!` is used everywhere, so a missing
  variable fails late and confusingly.
- **Migrations aren't tracked.** Nothing shows which have been run in
  production. Storage buckets and policies aren't in migrations at all.
- `revalidatePath` is used, but with every page dynamic it currently has little
  effect.

## 6. UX/UI findings

**Known issues**, which I confirmed:

1. **Overloaded top nav.** Up to 11 links. Which ones appear changes per
   breakpoint (Lists only at `lg`; My profile and Your GOAT only at `md`; My
   ratings and Log out only at `lg`). Account items ("My profile", "Your
   GOAT", "My ratings", "The Stack") sit beside public ones, and naming mixes
   "My" and "Your".
2. **Auth-aware nav.** It is already resolved server-side, with no flash; keep
   that. Logged out, the top shows only "Log in" (no "Join"), and the bottom
   tab bar shows "Log in".
3. **Search** is a nav tab, a mobile header icon, a separate `DiscoverSearch`
   on Discover, and the `/search` page: three entry points with two
   implementations.
4. **The People page is public** (see M6 and Q1).
5. **Login problems**: see Â§2.1.

**Other issues:**

- **Accessibility.**
  - Form errors (`Notice`) aren't announced: no `role="alert"` or
    `aria-live`.
  - Inputs remove the outline and rely on a 60%-opacity border on focus,
    which is a weak focus indicator.
  - The Log in / Sign up toggle has no tab or pressed semantics.
  - `--text-muted` on `--surface-raised` is about 4.45:1, just under AA for
    small text.
  - Icon-only links have labels (good). Reduced motion is respected (good).
- **Consistency.** Hard-coded colours (`text-[#0b0b0e]`, `#ffb4ae`,
  `#8ee7ae`) bypass the tokens. Copy varies between "Join MULO", "Sign up" and
  "Create account". Empty-state and error presentation varies by page.
- **Dead ends.** Logged-out actions such as rate, follow, react and nominate
  send people to `/login` and lose their place (L1).

## 7. Tooling findings

- **Strictness and lint.** TypeScript `strict: true` is already on (good).
  ESLint (Next core-web-vitals + TS) passes. There is no Prettier.
- **Commands.**
  - There is no `typecheck` script.
  - Bare `tsc` fails on a fresh clone until `next typegen` has run
    (`LayoutProps` is a generated global).
  - No `engines` field or `.nvmrc`, and Next 16 needs Node 20.9 or later.
- **Missing infrastructure.** No tests, no CI (no `.github/`), and no
  `.env.example`. `README.md` is the create-next-app boilerplate.
- **Existing agent docs.** `CLAUDE.md` exists and is detailed, but it is
  product-focused. It needs the engineering conventions this work
  establishes. `AGENTS.md` is generated by `next dev`.

---

## 8. Prioritised remediation plan

Effort: **S** is under half a day, **M** is 1â€“2 days, **L** is 3 or more days.
Each phase ends with typecheck, lint, tests and build green, and a summary.

### Hotfix (today, once approved)

| Item | Effort |
|---|---|
| C1: Next â†’ 16.3.8 (also `eslint-config-next`); `npm audit fix` for dev deps | S |

### Phase 1: P0 security and auth correctness

| # | Item | Effort |
|---|---|---|
| 1.1 | **Safety net first.** Vitest for pure logic (safe redirects, validators, scoring helpers). Playwright smoke suite: sign up, log in, log out, session survives refresh, redirect back after login, protected-route redirect, rate an album, view a profile. It needs a non-production Supabase project (Q4). | M |
| 1.2 | **Auth fixes.** <ul><li>One `safeRedirectPath()`, which fixes M5.</li><li>`requireUser(next)` helper.</li><li>`?next=` honoured on login and sign-up, and passed by every login link and redirect (L1).</li><li>`emailRedirectTo` pointing at `/auth/confirm`, with invite and intro handling moved there (L2, L3).</li><li>`signOut({ scope: "local" })` (L4).</li><li>Interim logout reachable at all breakpoints (L5).</li><li>Auth-form state reset (L6).</li><li>Explicit cookie options (L7).</li><li>Reset link built from `siteUrl()` (L8).</li></ul> | M |
| 1.3 | **Access matrix enforced** server-side through the helper, with tests that unauthenticated or unauthorised requests are refused (pages redirect; actions return `needsLogin`). | S |
| 1.4 | **zod** schemas for every server action, route handler and dynamic param, with shared ID schemas (M4). | M |
| 1.5 | **Migration 0016.** Profile, review and report constraints; case-insensitive username uniqueness; `avatar_url` allowlist (M1). Safe to run twice. A read-only duplicate/violation check SQL is handed over first. | M |
| 1.6 | **OG fetch hardening.** Host allowlist, size cap, no SVG (M2). | S |
| 1.7 | **Security headers** and CSP (Report-Only first) (M3). | S |
| 1.8 | **Rate limiting** on catalogue misses, wider search, image routes, writes and reset; MBID validation before any outbound call (H1). Mechanism per Q5. | M |
| 1.9 | Friendly error mapping and server-side logging; admin actions return results; email-verified admin check (L-b, L-c). | S |
| 1.10 | Storage bucket policies captured in a migration; magic-byte check on avatars (L-d). | S |

### Phase 2: P1 architecture and performance

| # | Item | Effort |
|---|---|---|
| 2.1 | Generated Supabase types (`supabase gen types`), checked in; remove the casts incrementally. | M |
| 2.2 | Structure, done gradually rather than as one big move. <ul><li>`src/server/` holds `server-only` data access, one module per domain.</li><li>`src/lib/validation/` holds the zod schemas.</li><li>Pure domain logic (scoring, weighting, badges) stays in `src/lib/` with unit tests.</li><li>A shared `Result<T>` type and error helpers.</li></ul> | L |
| 2.3 | SQL aggregates (views or RPC) for item scores, profile stats and charts; this fixes the 1,000-row truncation. Remove giant `.in()` calls. | L |
| 2.4 | Caching strategy for public catalogue, charts and Discover, using Next 16 cache APIs after reading the bundled docs. Keep user-specific parts streamed. | M |
| 2.5 | `cache()` on per-request lookups; flatten the sequential waterfalls; reduce notification queries. | S |
| 2.6 | Pagination on People, follows, ratings and lists; `pg_trgm` indexes for search. | M |
| 2.7 | Delete dead code (`supabase/client.ts`) and the schema-sniffing fallbacks once the migration state is confirmed; add `server-only` to `server.ts`; env validation module. | S |

### Phase 3: P2 UX consistency

| # | Item | Effort |
|---|---|---|
| 3.1 | **Header restructure.** <ul><li>Primary public nav only: Home, Discover, Charts, Versus, Lists.</li><li>Account items move into an **avatar dropdown**: Profile, My ratings, My GOAT, The Stack, Badges, Edit profile, Log out.</li><li>Logged out shows "Log in" and "Join".</li><li>The dropdown is an accessible menu button: `aria-expanded`, arrow keys, Esc, focus return, click outside.</li><li>The mobile tab bar is reviewed to match.</li></ul> | M |
| 3.2 | **Header search** (proposal, built after your sign-off): <ul><li>A persistent input in the header from `sm` up, focused by `/` or Cmd/Ctrl+K.</li><li>As-you-type results in a popover, reusing `/api/search` and the existing result rendering.</li><li>Enter goes to `/search?q=`.</li><li>On phones, the existing search icon opens a full-screen search sheet.</li><li>The "Search" nav tab and the duplicate `DiscoverSearch` are retired into this one component.</li></ul> | Mâ€“L |
| 3.3 | **Accessibility.** Live-region notices, visible focus rings on fields, tab semantics on the auth toggle, contrast token tweak, labels audit, keyboard pass. | M |
| 3.4 | **Shared states and components.** Use `PersonRow`, `buttonClass` and tokens everywhere; one pattern each for loading, empty and error; consistent copy for Join / Log in. | M |
| 3.5 | Responsive pass at 360, 768 and 1280 px. | S |

### Phase 4: tooling and hygiene

| # | Item | Effort |
|---|---|---|
| 4.1 | Scripts: `typecheck` (`next typegen && tsc --noEmit`), `test`, `test:e2e`, `format`. Prettier, `.nvmrc` and `engines` (Node 22 LTS). | S |
| 4.2 | GitHub Actions: typecheck, lint, unit, e2e (against the test project) and build. | M |
| 4.3 | `.env.example`, an accurate README, `docs/architecture.md`, and `CLAUDE.md` updated with the engineering conventions while keeping the product notes. | S |

### Noted but out of scope (features)

These were left alone:

- Account deletion and data export.
- Change password or email while signed in.
- Admin audit log UI.
- Social login.
- Blocking or muting users.

---

## 9. Open questions

1. **Public vs signed-in.** My proposal:
   - `/people` â†’ signed-in only.
   - `/u/[username]/follows` â†’ signed-in only.
   - Profiles, lists, album and artist pages, Charts and Versus stay public,
     because sharing depends on them.
   - Should RLS also stop anonymous API reads of the full profile directory
     (for example through a restricted view), or is gating the page enough?
2. **Supabase dashboard access.** I need someone to read me these settings, or
   to be given access:
   - Auth â†’ "Confirm email" on/off
   - Site URL and Redirect URLs
   - Email templates
   - Storage policies for `avatars` and `covers`
   - API `max-rows`
   - Which migrations have actually been run
3. **Migration 0016 constraints.** OK to add them? If existing usernames clash
   case-insensitively, or profiles break the new rules, do I rename or clean
   them? Or should I report them so you can decide?
4. **Test environment.** Can we create a separate (free) Supabase project for
   tests and CI? I don't want e2e sign-ups hitting production. I'll also need a
   `.env.local` to run the app locally; it stays on your machine and is never
   committed.
5. **Rate-limiting mechanism.**
   - (a) A Postgres table and RPC: no new dependency or service.
   - (b) Upstash Redis with `@upstash/ratelimit`: a new service and
     dependency.
   - (c) Vercel Firewall rate-limit rules: config only, depends on your plan.

   Which Vercel plan is this on? My default is (a), plus (c) if it's
   available.
6. **New dev dependencies.**
   - `zod` (runtime).
   - `vitest` and `@playwright/test` (dev).
   - `prettier` (dev).
   - The Supabase CLI (dev, for type generation).

   Each replaces hand-rolled code or adds testing that doesn't exist. OK?
7. **Logout scope.** I propose "this device only". Confirm that's the
   behaviour you want.
8. **Local Node.** Your machine has Node 20.5.0. Please install Node 22 LTS, or
   I'll keep using a portable one through npx.
