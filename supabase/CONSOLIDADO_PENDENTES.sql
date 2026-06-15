-- ============================================================
-- SQL CONSOLIDADO — features recentes (idempotente, pode rodar 1x)
-- Designer (projetos), Pacotes de Artes, Google Sheets, logs, anexos
--
-- IMPORTANTE: este arquivo é multi-tenant. Cada tabela tem org_id e as
-- policies isolam por organização (org_id = current_org_id()), igual às
-- migrations 20260611200000_saas_foundation / 20260611210000_rls_isolamento_org.
-- NUNCA reabrir com "using (true)" / "grant ... to anon": isso vaza dados
-- (e tokens em google_config) entre clientes. Edge functions usam service_role
-- e ignoram RLS normalmente.
-- ============================================================

-- ---------- tarefa_anexos (artes geradas no card de Design) ----------
create table if not exists public.tarefa_anexos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  tipo text not null default 'imagem',
  url text,
  prompt text,
  origem text not null default 'higgsfield',
  status text not null default 'pronto',
  org_id uuid,
  created_at timestamptz not null default now()
);
alter table public.tarefa_anexos add column if not exists org_id uuid;
alter table public.tarefa_anexos alter column url drop not null;
create index if not exists tarefa_anexos_tarefa_id_idx on public.tarefa_anexos(tarefa_id);

-- ---------- notificacao_logs: coluna cidade ----------
alter table public.notificacao_logs add column if not exists cidade text;

-- ---------- Repositório de Projetos (Designer) ----------
create table if not exists public.projetos_design (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  cores text,
  logo_posicao text not null default 'baixo-centro',
  palavras_chave text,
  org_id uuid,
  created_at timestamptz not null default now()
);
alter table public.projetos_design add column if not exists palavras_chave text;
alter table public.projetos_design add column if not exists org_id uuid;

create table if not exists public.projeto_assets (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.projetos_design(id) on delete cascade,
  tipo text not null default 'referencia',
  url text not null,
  descricao text,
  org_id uuid,
  created_at timestamptz not null default now()
);
alter table public.projeto_assets add column if not exists org_id uuid;
create index if not exists projeto_assets_projeto_id_idx on public.projeto_assets(projeto_id);

-- ---------- Pacotes de Artes ----------
create table if not exists public.pacotes_arte (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  org_id uuid,
  created_at timestamptz not null default now()
);
alter table public.pacotes_arte add column if not exists org_id uuid;

create table if not exists public.pacote_artes (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid not null references public.pacotes_arte(id) on delete cascade,
  url text not null,
  ordem int not null default 0,
  campos jsonb not null default '[]'::jsonb,
  org_id uuid,
  created_at timestamptz not null default now()
);
alter table public.pacote_artes add column if not exists org_id uuid;
create index if not exists pacote_artes_pacote_id_idx on public.pacote_artes(pacote_id);

create table if not exists public.pacote_geracoes (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid references public.pacotes_arte(id) on delete set null,
  pacote_nome text,
  valores jsonb not null default '{}'::jsonb,
  zip_url text,
  qtd int not null default 0,
  org_id uuid,
  created_at timestamptz not null default now()
);
alter table public.pacote_geracoes add column if not exists org_id uuid;

-- ---------- Google Sheets ----------
-- google_config guarda tokens/segredos: a policy NÃO pode expor a anon.
create table if not exists public.google_config (
  id int primary key default 1,
  client_id text,
  client_secret text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  email text,
  org_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.google_config add column if not exists org_id uuid;

alter table public.notificacoes add column if not exists sheets_ativo boolean not null default false;
alter table public.notificacoes add column if not exists sheets_spreadsheet_id text;
alter table public.notificacoes add column if not exists sheets_spreadsheet_nome text;
alter table public.notificacoes add column if not exists sheets_aba text;
alter table public.notificacoes add column if not exists sheets_mapa jsonb not null default '{}'::jsonb;

-- ============================================================
-- RLS + trigger de org_id (isolamento por organização)
-- Depende de public.current_org_id() e public.is_super_admin()
-- (criadas em 20260611200000_saas_foundation.sql).
-- ============================================================
do $$
declare
  t text;
  pol record;
  tabelas text[] := array[
    'tarefa_anexos','projetos_design','projeto_assets',
    'pacotes_arte','pacote_artes','pacote_geracoes','google_config'
  ];
begin
  foreach t in array tabelas
  loop
    -- remove qualquer policy antiga (inclusive as abertas "using(true)")
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I;', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role;', t);

    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.is_super_admin() or org_id = public.current_org_id()) '
      || 'with check (public.is_super_admin() or org_id = public.current_org_id());',
      t || '_org_isolation', t
    );

    -- auto-preenche org_id no insert
    execute format('drop trigger if exists set_org_id_trg on public.%I;', t);
    execute format(
      'create trigger set_org_id_trg before insert on public.%I '
      || 'for each row execute function public.set_org_id();', t
    );
  end loop;
end $$;

-- ---------- Storage buckets (leitura pública, escrita isolada por org) ----------
insert into storage.buckets (id, name, public) values ('artes-tarefas', 'artes-tarefas', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('projeto-assets', 'projeto-assets', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('artes-base', 'artes-base', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('pacotes-gerados', 'pacotes-gerados', true) on conflict (id) do nothing;

drop policy if exists buckets_publicos_read on storage.objects;
drop policy if exists buckets_publicos_write on storage.objects;
drop policy if exists buckets_org_insert on storage.objects;
drop policy if exists buckets_org_update on storage.objects;
drop policy if exists buckets_org_delete on storage.objects;

create policy buckets_publicos_read on storage.objects for select
  using (bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados'));

create policy buckets_org_insert on storage.objects for insert to authenticated
  with check (
    bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados')
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text)
  );

create policy buckets_org_update on storage.objects for update to authenticated
  using (
    bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados')
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text)
  );

create policy buckets_org_delete on storage.objects for delete to authenticated
  using (
    bucket_id in ('artes-tarefas','projeto-assets','artes-base','pacotes-gerados')
    and (public.is_super_admin() or (storage.foldername(name))[1] = public.current_org_id()::text)
  );
