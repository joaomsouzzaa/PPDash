-- Modelo A do Google Sheets: tokens por organização.
-- O client_id/client_secret do app OAuth são GLOBAIS (do dono do SaaS, via
-- secrets GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET). Aqui guardamos só os tokens
-- de cada organização (access/refresh/email), com PK = org_id.

delete from public.google_config where org_id is null;

alter table public.google_config drop constraint if exists google_config_singleton;
alter table public.google_config drop constraint if exists google_config_pkey;
alter table public.google_config drop column if exists id;
alter table public.google_config alter column org_id set not null;
alter table public.google_config add constraint google_config_pkey primary key (org_id);
