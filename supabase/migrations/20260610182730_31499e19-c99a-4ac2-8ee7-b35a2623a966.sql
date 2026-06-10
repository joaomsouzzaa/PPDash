select cron.schedule(
  'gerar-insights-trafego-diario',
  '0 12 * * *',
  $$
  select net.http_post(
    url := (select value from settings where key = 'supabase_url') || '/functions/v1/gerar-insights-trafego',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from settings where key = 'service_role_key')
    ),
    body := '{}'
  )
  $$
);