-- Deletes Learn and Debug history older than 90 days, every night at 03:17 UTC.
--
-- Needs the pg_cron extension. If this fails with a permissions error, enable
-- pg_cron in Supabase (Dashboard → Database → Extensions), then run it again.

create extension if not exists pg_cron;

select cron.schedule(
  'codebuddy-delete-old-ai-requests',
  '17 3 * * *',
  $$delete from public.ai_requests where created_at < now() - interval '90 days'$$
);
