-- Contas de anúncio selecionadas por organização (filtro do dashboard).
alter table public.meta_config
  add column if not exists contas jsonb not null default '[]'::jsonb;
