-- Liga/desliga do webhook de leads do CRM por organização.
-- Quando false, a função webhook-leads ignora os eventos (responde 200 sem gravar).
alter table public.organizations
  add column if not exists webhook_leads_ativo boolean not null default true;
