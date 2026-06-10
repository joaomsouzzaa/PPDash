-- Alertas & Insights de tráfego gerados pela IA (Gestor de Tráfego), por cidade.
-- Atualizado 1x/dia (cron 9h). 1 linha por cidade (upsert pelo slug).
create table if not exists public.insights_trafego (
  cidade_slug text primary key,
  insights jsonb not null default '[]'::jsonb, -- [{nivel, titulo, texto}]
  updated_at timestamptz not null default now()
);

alter table public.insights_trafego enable row level security;
grant select, insert, update, delete on public.insights_trafego to anon, authenticated, service_role;
drop policy if exists "insights_trafego_all" on public.insights_trafego;
create policy "insights_trafego_all" on public.insights_trafego for all to anon, authenticated using (true) with check (true);
