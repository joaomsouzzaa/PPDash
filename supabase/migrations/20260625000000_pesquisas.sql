-- ============================================================
-- Pesquisas (construtor estilo Typeform) no Growth.
-- Cria pesquisas com perguntas, tipos de resposta e lógica de
-- bifurcação ("se responder X vai para a pergunta Y"). Coleta
-- respostas de pessoas externas via link público (sem login),
-- pela edge function `pesquisa-publica` (service_role).
-- Multi-tenant: isolamento por org (mesmo padrão das demais tabelas).
-- ============================================================

-- Pesquisa (formulário)
create table if not exists public.pesquisas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid default public.current_org_id(),
  titulo text not null,
  slug text not null,                              -- usado no link público /f/:slug
  descricao text,
  status text not null default 'rascunho',         -- 'rascunho' | 'publicada'
  created_at timestamptz not null default now()
);
create unique index if not exists pesquisas_org_slug_idx on public.pesquisas (org_id, slug);

-- Perguntas da pesquisa
create table if not exists public.pesquisa_perguntas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid default public.current_org_id(),
  pesquisa_id uuid not null references public.pesquisas(id) on delete cascade,
  ordem int not null default 0,
  titulo text not null,
  descricao text,
  tipo text not null default 'texto_curto',        -- 'texto_curto' | 'texto_longo' | 'multipla_escolha' | 'sim_nao'
  obrigatoria boolean not null default true,
  opcoes jsonb not null default '[]'::jsonb,        -- [{id, label}] para múltipla escolha
  logica jsonb not null default '[]'::jsonb,        -- [{quando_opcao_id|quando_valor, ir_para_pergunta_id}]
  created_at timestamptz not null default now()
);
create index if not exists pesquisa_perguntas_pesquisa_idx on public.pesquisa_perguntas (pesquisa_id, ordem);

-- Respostas coletadas (uma linha por respondente)
create table if not exists public.pesquisa_respostas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  pesquisa_id uuid not null references public.pesquisas(id) on delete cascade,
  respostas jsonb not null default '{}'::jsonb,     -- { pergunta_id: valor }
  created_at timestamptz not null default now()
);
create index if not exists pesquisa_respostas_pesquisa_idx on public.pesquisa_respostas (pesquisa_id);

-- ------------------------------------------------------------
-- RLS por organização (mesmo padrão das demais tabelas de cliente)
-- ------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  tabelas text[] := array['pesquisas','pesquisa_perguntas','pesquisa_respostas'];
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
