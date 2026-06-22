-- ============================================================
-- Auto-DM Instagram: automação de respostas a comentários (estilo ManyChat).
-- Página Growth → Auto-DM Instagram. Quando alguém comenta um post/Reel com
-- uma palavra-gatilho, responde o comentário publicamente e envia um DM (Private Reply).
-- Isolamento por organização (RLS), igual às demais tabelas de cliente.
-- ============================================================

-- Conta Instagram Business conectada (por org). O page_token vem do token Meta
-- existente (meta_config) via /me/accounts; resolve a org no webhook pelo ig_user_id/page_id.
create table if not exists public.ig_contas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  page_id text not null,
  page_name text,
  ig_user_id text not null,
  ig_username text,
  page_token text,
  webhook_assinado boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, ig_user_id)
);

-- Regras de automação (espelho do construtor do ManyChat).
create table if not exists public.ig_automacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  ig_conta_id uuid references public.ig_contas(id) on delete cascade,
  nome text not null default 'Nova automação',
  status text not null default 'pausada', -- 'live' | 'pausada'
  escopo text not null default 'post_especifico', -- 'post_especifico' | 'qualquer' | 'proximo'
  media_ids jsonb not null default '[]'::jsonb, -- posts/Reels selecionados (quando escopo=post_especifico)
  gatilho_tipo text not null default 'palavra', -- 'palavra' | 'qualquer_comentario'
  palavras text[] not null default '{}',
  match_tipo text not null default 'contem', -- 'contem' | 'exato'
  responder_comentario boolean not null default true,
  -- variações de resposta pública (escolhe uma aleatoriamente), igual ao ManyChat
  resposta_comentario_templates jsonb not null default '[]'::jsonb,
  enviar_dm boolean not null default true,
  -- { texto: string, botoes: [{ titulo, url }] }
  dm_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Log de comentários processados (dedup por comment_id) + auditoria das ações.
create table if not exists public.ig_automacao_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  automacao_id uuid references public.ig_automacoes(id) on delete set null,
  comment_id text not null,
  media_id text,
  from_username text,
  comment_text text,
  acoes jsonb not null default '{}'::jsonb, -- { reply_ok, dm_ok, erros: [] }
  created_at timestamptz default now(),
  unique (org_id, comment_id)
);

create index if not exists ig_automacoes_org_idx on public.ig_automacoes (org_id, status);
create index if not exists ig_automacao_logs_org_comment_idx on public.ig_automacao_logs (org_id, comment_id);

-- ------------------------------------------------------------
-- RLS por organização (mesmo padrão de 20260611210000_rls_isolamento_org
-- e 20260619000000_meta_ads_manager).
-- ------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  tabelas text[] := array['ig_contas','ig_automacoes','ig_automacao_logs'];
begin
  foreach t in array tabelas
  loop
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
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

    -- preenche org_id automaticamente no insert (igual às demais tabelas)
    execute format('drop trigger if exists set_org_id_trg on public.%I;', t);
    execute format('create trigger set_org_id_trg before insert on public.%I for each row execute function public.set_org_id();', t);
  end loop;
end $$;
