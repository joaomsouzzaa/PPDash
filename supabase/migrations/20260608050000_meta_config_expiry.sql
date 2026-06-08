-- Guarda a validade do token do Meta no banco para a conexão persistir entre
-- navegadores/computadores (antes o token vivia só no localStorage).
alter table public.meta_config add column if not exists token_expires_at bigint;
alter table public.meta_config add column if not exists user_name text;
