-- Cidade do envio (resumo manda 1 por cidade) para exibir no histórico.
alter table public.notificacao_logs add column if not exists cidade text;

-- Garante leitura do histórico pelo frontend (anon/authenticated).
grant select on public.notificacao_logs to anon, authenticated, service_role;
alter table public.notificacao_logs enable row level security;
drop policy if exists "notificacao_logs_read" on public.notificacao_logs;
create policy "notificacao_logs_read" on public.notificacao_logs
  for select to anon, authenticated using (true);