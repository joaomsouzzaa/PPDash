-- ============================================================
-- Publicar/agendar post no Instagram a partir do card de tarefa.
-- Coluna `legenda` em tarefas (texto público do post) + fila ig_posts
-- (publicação imediata ou agendada, processada por cron). Reaproveita
-- ig_contas.page_token e o bucket público artes-tarefas.
-- ============================================================

-- Legenda pública do post (separada do briefing interno)
alter table public.tarefas add column if not exists legenda text;

-- Fila de publicação/agendamento no Instagram
create table if not exists public.ig_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  ig_conta_id uuid references public.ig_contas(id) on delete set null,
  ig_user_id text,
  tipo text not null default 'imagem',           -- 'imagem' | 'carrossel' | 'reels'
  legenda text,
  midias jsonb not null default '[]'::jsonb,      -- array de URLs públicas, em ordem
  publish_at timestamptz,                          -- null = publicar imediatamente
  status text not null default 'pendente',        -- 'pendente' | 'processando' | 'publicado' | 'falhou'
  creation_id text,                                -- container da Graph API
  ig_media_id text,                                -- id do post publicado
  permalink text,
  erro text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists ig_posts_due_idx on public.ig_posts (status, publish_at);
create index if not exists ig_posts_tarefa_idx on public.ig_posts (tarefa_id);

-- ------------------------------------------------------------
-- RLS por organização (mesmo padrão das demais tabelas de cliente)
-- ------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  tabelas text[] := array['ig_posts'];
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
-- Cron: processa posts devidos a cada 5 min (mesmo padrão do instagram-followups)
-- ------------------------------------------------------------
do $$
begin
  perform cron.unschedule('instagram-publish-5min') from cron.job where jobname = 'instagram-publish-5min';
end $$;

select cron.schedule(
  'instagram-publish-5min',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://wxxhsuprddzprnrwovwi.supabase.co/functions/v1/instagram-publish-scheduler',
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
