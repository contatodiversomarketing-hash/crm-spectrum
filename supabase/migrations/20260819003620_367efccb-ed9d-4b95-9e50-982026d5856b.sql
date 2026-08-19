CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('travas-pagamento-agenda')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'travas-pagamento-agenda');

SELECT cron.schedule(
  'travas-pagamento-agenda',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uftdsoqhyiqhxvckqxnp.supabase.co/functions/v1/travas-pagamento-agenda',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_d9cUokw4pb5caesF9cn9aQ_aeV_gXMI"}'::jsonb,
    body := '{"origem": "cron"}'::jsonb
  ) AS request_id;
  $$
);