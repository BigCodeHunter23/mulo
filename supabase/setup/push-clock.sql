-- The clock for push notifications: calls the website every 15 minutes.
-- Not a migration. Run it once in the Supabase SQL editor, after:
--   1. Database → Extensions: turn on pg_cron and pg_net.
--   2. Save the secret (the same value as PUSH_TICK_SECRET in Vercel, 32+
--      characters):
--        select vault.create_secret('<the secret>', 'push_tick_secret');
-- Running it again replaces the schedule.

select cron.unschedule(jobid) from cron.job where jobname = 'push-tick';

select cron.schedule(
  'push-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://getmulo.com/api/app/v1/push/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'push_tick_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
