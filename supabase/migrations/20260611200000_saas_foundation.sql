-- ============================================================
-- Fase 1: Fundação SaaS multi-tenant (auth, organizações, planos)
-- Não-destrutivo: mantém o app atual funcionando (RLS aberto continua
-- até a Fase 5). Adiciona org_id (nullable) + trigger de auto-preenchimento.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- PLANOS ----------
create table if not exists public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text unique not null,
  preco numeric not null default 0,
  modulos jsonb not null default '[]'::jsonb,   -- ex: ["eventos","inside","analytics","growth"]
  max_usuarios int not null default 5,
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- ORGANIZATIONS (clientes) ----------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text unique,
  plano_id uuid references public.planos(id),
  status text not null default 'ativo',          -- ativo | suspenso
  created_at timestamptz not null default now(),
  created_by uuid
);

-- ---------- PROFILES (1:1 com auth.users) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  org_id uuid references public.organizations(id) on delete set null,
  papel text not null default 'user',            -- super_admin | client_admin | user
  status text not null default 'ativo',          -- pendente | ativo | inativo
  created_at timestamptz not null default now()
);

-- ---------- USER_MODULOS (acesso por usuário dentro do plano da org) ----------
create table if not exists public.user_modulos (
  user_id uuid not null references public.profiles(id) on delete cascade,
  modulo_key text not null,
  primary key (user_id, modulo_key)
);

-- ---------- CONVITES ----------
create table if not exists public.convites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  papel text not null default 'user',
  modulos jsonb not null default '[]'::jsonb,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pendente',        -- pendente | aceito | expirado
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Helpers (SECURITY DEFINER => não recursam em RLS de profiles)
-- ============================================================
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_papel()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'super_admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_client_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel in ('client_admin','super_admin') from public.profiles where id = auth.uid()), false);
$$;

-- Cria profile automaticamente quando um usuário do Auth é criado
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS das tabelas de controle
-- ============================================================
alter table public.planos        enable row level security;
alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.user_modulos  enable row level security;
alter table public.convites      enable row level security;

grant select, insert, update, delete on public.planos, public.organizations, public.profiles, public.user_modulos, public.convites to authenticated;
grant select on public.planos to anon;

-- PLANOS: todos autenticados leem; só super admin escreve
drop policy if exists planos_read on public.planos;
create policy planos_read on public.planos for select to authenticated, anon using (true);
drop policy if exists planos_write on public.planos;
create policy planos_write on public.planos for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- ORGANIZATIONS: super admin tudo; membros leem a própria
drop policy if exists orgs_super on public.organizations;
create policy orgs_super on public.organizations for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists orgs_member_read on public.organizations;
create policy orgs_member_read on public.organizations for select to authenticated using (id = public.current_org_id());
drop policy if exists orgs_admin_update on public.organizations;
create policy orgs_admin_update on public.organizations for update to authenticated
  using (id = public.current_org_id() and public.current_papel() = 'client_admin');

-- PROFILES: vê o próprio; super admin tudo; client_admin vê/gere a própria org
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_super on public.profiles;
create policy profiles_super on public.profiles for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists profiles_org_read on public.profiles;
create policy profiles_org_read on public.profiles for select to authenticated
  using (org_id = public.current_org_id() and public.is_client_admin());
drop policy if exists profiles_org_manage on public.profiles;
create policy profiles_org_manage on public.profiles for update to authenticated
  using (org_id = public.current_org_id() and public.current_papel() = 'client_admin')
  with check (org_id = public.current_org_id());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- USER_MODULOS: dono lê; client_admin/super gerem dentro da org
drop policy if exists user_modulos_self on public.user_modulos;
create policy user_modulos_self on public.user_modulos for select to authenticated using (user_id = auth.uid());
drop policy if exists user_modulos_admin on public.user_modulos;
create policy user_modulos_admin on public.user_modulos for all to authenticated
  using (public.is_super_admin() or (public.current_papel() = 'client_admin'
         and exists (select 1 from public.profiles p where p.id = user_modulos.user_id and p.org_id = public.current_org_id())))
  with check (public.is_super_admin() or (public.current_papel() = 'client_admin'
         and exists (select 1 from public.profiles p where p.id = user_modulos.user_id and p.org_id = public.current_org_id())));

-- CONVITES: super/client_admin da org gerem
drop policy if exists convites_admin on public.convites;
create policy convites_admin on public.convites for all to authenticated
  using (public.is_super_admin() or (public.is_client_admin() and org_id = public.current_org_id()))
  with check (public.is_super_admin() or (public.is_client_admin() and org_id = public.current_org_id()));

-- ============================================================
-- org_id em todas as tabelas de dados + trigger de auto-preenchimento
-- (nullable, não quebra nada agora)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'agentes','ai_config','base_conhecimento','cidades','conversas','google_config',
    'insights_trafego','kanban_colunas','leads','mensagens','meta_config','notificacao_logs',
    'notificacoes','pacote_artes','pacote_geracoes','pacotes_arte','produtos','projeto_assets',
    'projetos_design','tags','tarefa_anexos','tarefa_respostas','tarefas','vendas','whatsapp_config'
  ]
  loop
    execute format('alter table public.%I add column if not exists org_id uuid;', t);
  end loop;
end $$;

create or replace function public.set_org_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is null then
    new.org_id := public.current_org_id();
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'agentes','ai_config','base_conhecimento','cidades','conversas','google_config',
    'insights_trafego','kanban_colunas','leads','mensagens','meta_config','notificacao_logs',
    'notificacoes','pacote_artes','pacote_geracoes','pacotes_arte','produtos','projeto_assets',
    'projetos_design','tags','tarefa_anexos','tarefa_respostas','tarefas','vendas','whatsapp_config'
  ]
  loop
    execute format('drop trigger if exists set_org_id_trg on public.%I;', t);
    execute format('create trigger set_org_id_trg before insert on public.%I for each row execute function public.set_org_id();', t);
  end loop;
end $$;

-- ============================================================
-- Seed: planos padrão
-- ============================================================
insert into public.planos (nome, slug, preco, modulos, max_usuarios, ordem) values
  ('Starter', 'starter', 97,  '["eventos"]'::jsonb, 3, 1),
  ('Pro',     'pro',     297, '["eventos","inside","analytics"]'::jsonb, 10, 2),
  ('Premium', 'premium', 597, '["eventos","inside","analytics","growth"]'::jsonb, 50, 3)
on conflict (slug) do nothing;
