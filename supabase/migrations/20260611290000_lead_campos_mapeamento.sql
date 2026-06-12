-- Campos personalizados de leads + mapeamento de CRM, por organização.

-- Valores dos campos personalizados ficam neste JSONB (chave -> valor).
alter table public.leads add column if not exists custom jsonb not null default '{}'::jsonb;

-- Definição dos campos personalizados de cada org (aparecem como colunas na UI).
create table if not exists public.lead_campos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  chave text not null,                         -- slug usado dentro do JSONB custom
  label text not null,                         -- nome exibido na coluna
  tipo text not null default 'texto',          -- texto | numero | data | booleano
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, chave)
);

-- Mapeamento: campo da nossa app  <-  chave que o webhook do CRM envia.
-- app_field: chave padrão (ex.: "nome") ou "custom:<chave>" para campos personalizados.
create table if not exists public.lead_mapeamento (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  app_field text not null,
  crm_key text not null,
  created_at timestamptz not null default now(),
  unique (org_id, app_field)
);

-- RLS por organização + auto-preenchimento de org_id.
do $$
declare t text;
begin
  foreach t in array array['lead_campos','lead_mapeamento']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_org', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_super_admin() or org_id = public.current_org_id()) with check (public.is_super_admin() or org_id = public.current_org_id());', t||'_org', t);
    execute format('drop trigger if exists set_org_id_trg on public.%I;', t);
    execute format('create trigger set_org_id_trg before insert on public.%I for each row execute function public.set_org_id();', t);
  end loop;
end $$;
