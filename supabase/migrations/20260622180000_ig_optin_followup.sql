-- ============================================================
-- Auto-DM Instagram: fluxo opt-in (2 etapas, estilo ManyChat) + follow-up agendado.
--  1) DM de abertura (opt-in): texto + botão SEM link (postback). Quando a pessoa toca,
--     abre a janela de mensagens (não é tratado como spam) → enviamos a 2ª DM com o link.
--  2) Follow-up: X minutos depois (configurável), uma DM perguntando se conseguiu se cadastrar.
-- O formato da DM fica em ig_automacoes.dm_payload (jsonb) — sem migration:
--   { modo:'optin'|'direto', texto, botoes:[{titulo,url}],
--     optin_texto, optin_botao_titulo, link_texto, link_botoes:[{titulo,url}] }
-- ============================================================

-- Follow-up por automação.
alter table public.ig_automacoes add column if not exists followup_ativo boolean not null default false;
alter table public.ig_automacoes add column if not exists followup_delay_min integer not null default 60;
alter table public.ig_automacoes add column if not exists followup_payload jsonb not null default '{}'::jsonb; -- { texto, botoes:[{titulo,url}] }

-- Fila de follow-ups a enviar (1 linha por destinatário que recebeu a DM de abertura).
create table if not exists public.ig_followups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  automacao_id uuid references public.ig_automacoes(id) on delete cascade,
  page_id text not null,
  recipient_igsid text not null,       -- IGSID do usuário (retornado ao enviar a DM)
  payload jsonb not null default '{}'::jsonb,
  send_at timestamptz not null,
  status text not null default 'pendente', -- pendente | enviado | falhou
  erro text,
  created_at timestamptz default now(),
  sent_at timestamptz
);
create index if not exists ig_followups_due_idx on public.ig_followups (status, send_at);

-- ------------------------------------------------------------
-- RLS por organização (mesmo padrão das demais tabelas de cliente)
-- ------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  tabelas text[] := array['ig_followups'];
begin
  foreach t in array tabelas
  loop
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on public.%I;', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.is_super_admin() or org_id = public.current_org_id()) '
      || 'with check (public.is_super_admin() or org_id = public.current_org_id());',
      t || '_org_isolation', t
    );
    execute format('drop trigger if exists set_org_id_trg on public.%I;', t);
    execute format('create trigger set_org_id_trg before insert on public.%I for each row execute function public.set_org_id();', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Cron: processa follow-ups devidos a cada 5 min (mesmo padrão do sync-scheduler:
-- net.http_post com URL fixa + anon key).
-- ------------------------------------------------------------
do $$
begin
  perform cron.unschedule('instagram-followups-5min') from cron.job where jobname = 'instagram-followups-5min';
end $$;

select cron.schedule(
  'instagram-followups-5min',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://wxxhsuprddzprnrwovwi.supabase.co/functions/v1/instagram-followups',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGhzdXByZGR6cHJucndvdndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTk5NjAsImV4cCI6MjA5Njc3NTk2MH0.dUzaz0tcZKTPyVlKOwimKRKW05swtWvT2NWHe0AqTtA',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4eGhzdXByZGR6cHJucndvdndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTk5NjAsImV4cCI6MjA5Njc3NTk2MH0.dUzaz0tcZKTPyVlKOwimKRKW05swtWvT2NWHe0AqTtA'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  )
  $cron$
);
