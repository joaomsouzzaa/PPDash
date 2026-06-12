-- Limite de instâncias de WhatsApp por plano (modelo revenda UAZAPI).
alter table public.planos
  add column if not exists max_instancias int not null default 1;

update public.planos set max_instancias = 1 where slug = 'starter';
update public.planos set max_instancias = 3 where slug = 'pro';
update public.planos set max_instancias = 10 where slug = 'premium';

-- Instâncias de WhatsApp provisionadas por organização (cada uma na UAZAPI).
create table if not exists public.whatsapp_instancias (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null,
  instance_token text,
  numero text,
  status text not null default 'desconectado',
  created_at timestamptz not null default now()
);
alter table public.whatsapp_instancias enable row level security;
grant select, insert, update, delete on public.whatsapp_instancias to authenticated;

drop policy if exists whatsapp_instancias_org on public.whatsapp_instancias;
create policy whatsapp_instancias_org on public.whatsapp_instancias for all to authenticated
  using (public.is_super_admin() or org_id = public.current_org_id())
  with check (public.is_super_admin() or org_id = public.current_org_id());

create trigger set_org_id_trg before insert on public.whatsapp_instancias
  for each row execute function public.set_org_id();
