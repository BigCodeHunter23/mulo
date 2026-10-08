# Supabase setup for the hardening work

For whoever has access to the Supabase dashboard. Do these once for the
production project, and again for the test project. Nothing here needs code
changes; each step says how to check it worked.

## 1. Allow the new email link address

Sign-up confirmation and password reset emails now link to `/auth/confirm` on
the site. Supabase only sends people to addresses on its allow list.

Dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://mulo-plum.vercel.app` (or the custom domain, once
  there is one). It must not still say `http://localhost:3000`.
- **Redirect URLs**: add
  - `https://mulo-plum.vercel.app/auth/confirm**`
  - `https://*-<your-vercel-team>.vercel.app/auth/confirm**`, for preview
    deployments (copy the team part from any preview address in Vercel)
  - `http://localhost:3000/auth/confirm**`, for local development

Check: sign up with a new address on a preview deployment. The confirmation
email's link should finish signing you in and land on "Your profile".

## 2. Recommended: email links that work in any browser

The default email templates use a one-time code that only works in the
browser that asked for the email. Opened from a phone's mail app, it often
lands somewhere else and fails. The app already accepts the alternative.

Dashboard → **Authentication → Email Templates**, in **Confirm signup** and
**Reset password**, replace `{{ .ConfirmationURL }}` with:

- Confirm signup:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/welcome?intro=1`
- Reset password:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password`

Check: request a password reset on a laptop, open the email on a phone. The
link should open "Choose a new password".

## 3. Run the new migrations, in order

Dashboard → **SQL Editor**. Paste each file's contents and run it.

1. `supabase/checks/0016_precheck.sql`: read-only. It lists any existing
   rows that break the new rules. Empty results mean everything is fine.
   Note anything it lists; nothing is changed either way.
2. `supabase/migrations/0016_profile_and_content_rules.sql`: the rules.
   Safe to run twice. If it prints a notice that a rule or the username index
   was skipped, the precheck rows are why; fix those rows and run it again.
3. `supabase/migrations/0017_rate_limits.sql`: the rate limiter. Safe to run
   twice. Until it runs, the app allows everything and logs a warning.
4. `supabase/migrations/0018_score_totals.sql`: totals and averages counted
   by the database, so scores, The Charts, profile stats and Heavy Rotation
   stay right past a thousand ratings. Safe to run twice. **Run this before
   the Phase 2 code goes live**: until it runs, scores show as dashes, the
   charts are empty, and the logs say "run migration 0018".
5. `supabase/migrations/0019_search_indexes.sql`: makes search fast as the
   catalogue grows. Safe to run twice, and any time; nothing depends on it.
6. `supabase/migrations/0020_blocks.sql`: blocking. Safe to run twice. Until
   it runs, the Block button says it couldn't and nobody is hidden; everything
   else carries on as before.

Check: in the Table Editor, `profiles` now shows the new constraints, and
`rate_limits` and `blocks` tables exist (`rate_limits` fills as people log in
and rate things). In **Database → Functions**, `score_totals`,
`album_chart_rows` and `hidden_profiles` are listed.

Note on 0016: it creates a `pg_temp.add_rule()` helper and calls it in later
statements. The SQL Editor runs statements over pooled connections, so the
helper can be gone by the next one and the run fails part way. If that
happens, add the remaining constraints with a single `do $$ … $$` block that
checks `pg_constraint` for each name first; the rules themselves are
unchanged.

## 4. Check the storage buckets

Run `supabase/checks/storage_policies.sql` in the SQL Editor (read-only).
Both `avatars` and `covers` should be public, and there should be **no**
insert, update or delete policy for `anon` or `authenticated` on
`storage.objects`. If there is one, send me the output before changing
anything.

## 5. Settings worth confirming

- **Authentication → Providers → Email → Confirm email**: on. The admin
  inbox (`/admin/reports`) also requires a confirmed address.
- **Authentication → Rate Limits**: Supabase's own limits on sign-ups and
  emails. The app adds its own on top; the defaults are fine.
- **API settings → Max rows**: note the number (default 1,000). Phase 2 fixes
  charts and profile stats that are wrong past it.
