-- Fase 5b: ai_config passa a ser por organização.
-- Antes a PK era (provider) — global. Agora (org_id, provider), permitindo
-- que cada organização tenha sua própria chave por provedor.

delete from public.ai_config where org_id is null;

alter table public.ai_config drop constraint if exists ai_config_pkey;
alter table public.ai_config alter column org_id set not null;
alter table public.ai_config add constraint ai_config_pkey primary key (org_id, provider);
