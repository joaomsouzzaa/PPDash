-- ============================================================
-- Meta Ads Manager: espelho de campanhas + pasta de criativos do Drive
-- Página Growth → Meta Ads (criar/duplicar/editar campanhas no Gerenciador).
-- Isolamento por organização (RLS), igual às demais tabelas de cliente.
-- ============================================================

-- Snapshot/espelho das campanhas do Gerenciador de Anúncios (por org).
create table if not exists public.meta_campanhas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  account_id text not null,
  meta_campaign_id text not null,
  nome text,
  objetivo text,
  status text,
  daily_budget numeric,
  lifetime_budget numeric,
  estrutura jsonb not null default '{}'::jsonb, -- adsets/ads aninhados
  last_synced_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, meta_campaign_id)
);

-- Pasta default do Google Drive com os criativos (por org).
create table if not exists public.meta_ads_drive_config (
  org_id uuid primary key,
  pasta_criativos_id text,
  pasta_criativos_nome text,
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- RLS por organização (mesmo padrão de 20260611210000_rls_isolamento_org)
-- ------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  tabelas text[] := array['meta_campanhas','meta_ads_drive_config'];
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
