-- ============================================================
-- Publicar/agendar YouTube Shorts a partir do card de tarefa (Workflow).
-- Conexão de canal via Google OAuth (escopo youtube.upload) guardada em
-- yt_canais (1+ por org); fila/registro de publicação em yt_posts.
-- Agendamento é NATIVO do YouTube (status.publishAt) → não precisa de cron.
-- Mesmo padrão de RLS por org das demais tabelas de cliente (ig_posts).
-- ============================================================

-- Canais do YouTube conectados (token OAuth por canal, igual google_config)
create table if not exists public.yt_canais (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  channel_id text not null,                  -- id do canal no YouTube
  channel_title text,
  thumbnail_url text,
  access_token text,
  refresh_token text,                        -- usado p/ renovar o access_token
  token_expiry timestamptz,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists yt_canais_org_channel_idx on public.yt_canais (org_id, channel_id);

-- Fila/registro de publicação no YouTube (espelha ig_posts)
create table if not exists public.yt_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  yt_canal_id uuid references public.yt_canais(id) on delete set null,
  titulo text,
  descricao text,
  video_url text not null,                   -- URL pública (bucket artes-tarefas ou VPS)
  publish_at timestamptz,                     -- null = publicar imediatamente (publicar_agora)
  status text not null default 'pendente',    -- 'pendente' | 'processando' | 'publicado' | 'falhou'
  youtube_video_id text,                      -- id do vídeo publicado
  permalink text,                             -- https://youtu.be/<id>
  erro text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists yt_posts_due_idx on public.yt_posts (status, publish_at);
create index if not exists yt_posts_tarefa_idx on public.yt_posts (tarefa_id);

-- ------------------------------------------------------------
-- RLS por organização (mesmo padrão das demais tabelas de cliente)
-- ------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  tabelas text[] := array['yt_canais', 'yt_posts'];
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
