# Supabase setup for the hardening work

For whoever has access to the Supabase dashboard. Do these once for the
production project, and again for the test project. Nothing here needs code
changes; each step says how to check it worked.

## 1. Allow the return addresses

Sign-up confirmation and password reset emails link to `/auth/confirm` on the
site, and so does signing in with Apple or Google on the website. The phone
app comes back to `mulo://auth/callback`. Supabase only sends people to
addresses on its allow list, and that list is what stops a sign-in being sent
anywhere else, so keep it short and exact.

Dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://mulo-plum.vercel.app` (or the custom domain, once
  there is one). It must not still say `http://localhost:3000`.
- **Redirect URLs**: the list should hold exactly these
  - `https://mulo-plum.vercel.app/auth/confirm**`
  - `mulo://auth/callback`, for the phone app, written exactly like that
  - `http://localhost:3000/auth/confirm**`, for local development

**Never add `exp://**`** (or any address starting `exp://`). Those are Expo
Go's, the app used to try things out during development, and any Expo Go
project can open them. With one on the list, somebody else's app could
receive a MULO sign-in. The website refuses them too, but this list is the
lock that counts.

**Don't add a wildcard for Vercel previews** such as
`https://*-<your-vercel-team>.vercel.app/auth/confirm**`. Anybody can make
their own Vercel project whose address ends the same way. Once Apple and
Google sign-in are on, a link to their look-alike page could sign them in as
whoever clicked it. If you added that wildcard before, delete it. Instead,
either:

- add the one preview address you're testing, written out in full (for
  example `https://mulo-git-my-branch-<your-vercel-team>.vercel.app/auth/confirm**`),
  and delete it again when you're done; or, better,
- point previews at the separate test Supabase project (Vercel → Settings →
  Environment Variables, the Preview ones), so they never touch real accounts.

Check: sign up with a new address on the live site (or a preview you've
listed). The confirmation email's link should finish signing you in and land
on "Your profile".

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
7. `supabase/migrations/0021_apple_tokens.sql`: keeps Apple's token for each
   account that signs in with Apple, so deleting the account can cancel the
   link. Safe to run twice. Until it runs, Apple sign-in still works and
   nothing is kept.

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

## 6. Sign in with Apple and Google

Do section 1 first, so the return addresses are right before these go on.

Dashboard → **Authentication → Sign In / Providers**:

- **Email → Confirm email**: keep it **on**. Supabase joins a Google or Apple
  sign-in to an existing account with the same email address. With
  confirming off, somebody could join first with your address and a password
  of their own, and keep a way into your account after you sign in with
  Google.
- **Apple**: turn it on, then
  - **Client IDs**: `com.mulo.app` (the iPhone app) and the website's
    Services ID (the same value as `APPLE_SERVICES_ID` in Vercel), with a
    comma between them. **Never add `host.exp.Exponent`**: that's Expo Go's
    id, and it would let any Expo Go project's Apple sign-ins into MULO.
  - **Secret Key (for OAuth)**: the key Apple's instructions have you make
    from the `.p8` file. Apple lets it last **six months at most**, and when it
    runs out, signing in with Apple on the website stops working. Put a
    reminder in your calendar for five months after the day you make it, to
    make a fresh one and paste it in here.
  - In Apple's developer site, the Services ID's **Return URL** is the
    callback address Supabase shows on this screen
    (`https://<project>.supabase.co/auth/v1/callback`).
- **Google**: turn it on, and paste the **Client ID** and **Client Secret** of
  the **Web application** OAuth client from Google Cloud Console (APIs &
  Services → Credentials). That client's **Authorized redirect URI** is the
  same Supabase callback address.
- **Facebook**: leave it **off** until Meta has approved the app. MULO says
  "That sign-in isn't available yet" until then.

Then, still under **Authentication** (the names move around between
dashboard versions; look under **Sign In / Providers**, **Multi-Factor** and
**Settings**):

- **Multi-factor (TOTP and phone)**: turn enrolment **off**. MULO doesn't use
  a second factor, so nobody should be able to add one to their account.
- **Secure password change**: turn it **on**, and **require the current
  password** (or "reauthentication") if it's offered. Then a session left open
  on somebody else's laptop can't quietly change the password through
  Supabase directly.
- **Secure email change**: turn it **on**. A new address then has to be
  confirmed from the old one as well, so a borrowed session can't move the
  account to an address somebody else controls.
- **Manual linking**: keep it **off**. MULO never links accounts by hand; left
  on, anyone signed in could attach another Google or Apple account to theirs.

The `APPLE_…` settings in Vercel (which let MULO cancel an Apple link when an
account is deleted, as Apple requires) are explained in `.env.example`.

Check: on the live site's log-in page, Continue with Google and Continue with
Apple should each come back signed in. In the app, the same with Continue
with Google.

## 7. Push notifications

Turns on pushes for the phone app: new followers, loves, today's Versus, the
week's Drop and a streak about to end. Until you do this the app works as
before and nothing is sent. Do the steps in this order.

1. Dashboard → **SQL Editor**. Paste the contents of
   `supabase/migrations/0023_push_notifications.sql` and run it. Safe to run
   twice. It makes the three private tables the pushes use.
2. Dashboard → **Database → Extensions**. Search for `pg_cron` and turn it
   on, then do the same for `pg_net`.
3. Make a secret: a random text of 32 or more characters. For example, in a
   terminal:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   Keep it somewhere safe; you need it twice more.
4. Back in the **SQL Editor**, save the secret in the Vault. Replace
   `PASTE-THE-SECRET-HERE` with your secret and run:
   `select vault.create_secret('PASTE-THE-SECRET-HERE', 'push_tick_secret');`
5. Still in the **SQL Editor**, paste the contents of
   `supabase/setup/push-clock.sql` and run it. This is the clock: it calls
   the website every 15 minutes. Running it again just replaces the
   schedule.
6. In Vercel → your project → **Settings → Environment Variables**, add
   `PUSH_TICK_SECRET` with the same secret, for **Production only**. Leave
   Preview and Development unticked: a preview deployment must never be
   able to run the clock.
7. Turn on Expo's push security, so only MULO can send pushes to MULO's
   phones. In the order given, or pushes fail in between: on expo.dev, go
   to the account's **Settings → Access tokens** and make a token; in Vercel
   add it as `EXPO_ACCESS_TOKEN`, for Production, and redeploy so the site
   picks up both variables; then, back on **Access tokens**, switch on
   **Enhanced security for push notifications**. From then on Expo refuses
   any push sent without the token.

Check: in the SQL Editor, run
`select status_code, created from net._http_response order by created desc limit 3;`
a quarter of an hour later. The newest rows should say `200`. A `401` means
the secret in the Vault and the one in Vercel differ; save the right one in
both places (to replace the Vault's, run
`select vault.update_secret(id, 'THE-SECRET') from vault.secrets where name = 'push_tick_secret';`).

To change the secret (if it may have leaked, say), make a new one as in step
3, then change it in both places: Vercel's `PUSH_TICK_SECRET` (then redeploy)
and the Vault, with the `vault.update_secret` line above. Between the two,
the clock's calls get a `401` and nothing is sent; the next run after both
match catches up.

## 8. Replies

Turns on replies on reviews and takes. Until you do this, threads show no
replies and posting says replies aren't available yet; nothing else changes.

1. Dashboard → **SQL Editor**. Paste the contents of
   `supabase/migrations/0024_replies.sql` and run it. Safe to run twice.

Check: open an album with a review on the live site while signed in, choose
Reply under a review, and post one. The album page then shows "1 reply".
