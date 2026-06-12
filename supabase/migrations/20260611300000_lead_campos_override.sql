-- Permite renomear/ocultar QUALQUER campo de lead por organização.
-- padrao=true marca um override de um campo padrão (chave = key do catálogo).
-- oculto=true esconde o campo da visão da org.
alter table public.lead_campos
  add column if not exists padrao boolean not null default false,
  add column if not exists oculto boolean not null default false;
