-- Thursday 5:00 PM cron job that triggers /api/schedule/generate.
--
-- The route authenticates via a shared secret (CRON_SECRET), not a
-- Supabase session — pg_cron has no user to log in as. That secret must
-- NOT be hardcoded here (this file is committed to git), so it's stored
-- in a small private table instead and populated separately, once,
-- outside of any migration:
--
--   insert into private.app_secrets (key, value) values ('cron_secret', '<same value as CRON_SECRET in .env.local>')
--   on conflict (key) do update set value = excluded.value;
--
-- (`ALTER DATABASE ... SET app.cron_secret` is the more common pattern for
-- this, but this project's local Postgres role isn't granted permission
-- to set custom GUCs at the database level — a table sidesteps that.)
--
-- The target URL below assumes a local dev setup: pg_cron runs inside the
-- Supabase Postgres container, so it reaches the Next.js dev server on
-- the host via `host.docker.internal`, not `localhost`. Update the URL to
-- your deployed origin (e.g. the Vercel URL) once this isn't local-only.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;

create table if not exists private.app_secrets (
  key text primary key,
  value text not null
);

select cron.schedule(
  'generate-weekly-schedule',
  '0 17 * * 4', -- minute hour day month day-of-week — Thursday 17:00
  $$
  select net.http_post(
    url := 'http://host.docker.internal:3000/api/schedule/generate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from private.app_secrets where key = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
