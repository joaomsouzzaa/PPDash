-- Fase 5b: token de webhook único por organização.
-- Cada cliente recebe URLs de webhook exclusivas que carimbam org_id nos dados.

alter table public.organizations
  add column if not exists webhook_token text;

update public.organizations
  set webhook_token = encode(gen_random_bytes(16), 'hex')
  where webhook_token is null;

alter table public.organizations
  alter column webhook_token set default encode(gen_random_bytes(16), 'hex');

create unique index if not exists organizations_webhook_token_key
  on public.organizations(webhook_token);
