-- Reconstrução das tabelas-base ausentes (derivado de types.ts)
-- Idempotente. Cria tabelas, RLS, policies permissivas e grants.

create extension if not exists pgcrypto;

-- agentes
create table if not exists public.agentes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  modelo text,
  parent_id uuid,
  pos_x numeric,
  pos_y numeric,
  provider text,
  slug text,
  system_prompt text,
  ativo boolean default true,
  created_at timestamptz default now()
);

-- ai_config (singleton por provider)
create table if not exists public.ai_config (
  provider text primary key,
  api_key text,
  updated_at timestamptz default now()
);

-- conversas
create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid,
  titulo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- google_config (singleton id=1)
create table if not exists public.google_config (
  id int primary key default 1,
  client_id text,
  client_secret text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  email text,
  updated_at timestamptz not null default now(),
  constraint google_config_singleton check (id = 1)
);
insert into public.google_config (id) values (1) on conflict (id) do nothing;

-- kanban_colunas
create table if not exists public.kanban_colunas (
  id uuid primary key default gen_random_uuid(),
  agente_id uuid,
  nome text not null,
  ordem int,
  created_at timestamptz default now()
);

-- mensagens
create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid,
  role text,
  conteudo text,
  created_at timestamptz default now()
);

-- meta_config
create table if not exists public.meta_config (
  id uuid primary key default gen_random_uuid(),
  access_token text,
  account_id text,
  token_expires_at bigint,
  user_name text,
  updated_at timestamptz default now()
);

-- notificacoes
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  gatilho text not null,
  destinatario text not null,
  destinatario_tipo text not null,
  destinatario_nome text,
  destinatarios jsonb,
  mensagem text not null,
  ativo boolean default true,
  cidade_slug text,
  horario text,
  horario_evento text,
  disparo_dia_evento boolean not null default false,
  sheets_ativo boolean not null default false,
  sheets_aba text,
  sheets_mapa jsonb not null default '{}'::jsonb,
  sheets_spreadsheet_id text,
  sheets_spreadsheet_nome text,
  created_at timestamptz default now()
);

-- notificacao_logs
create table if not exists public.notificacao_logs (
  id uuid primary key default gen_random_uuid(),
  notificacao_id uuid,
  destinatario text,
  mensagem text,
  status text,
  erro text,
  cidade text,
  created_at timestamptz default now()
);

-- tarefas
create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  agente_id uuid,
  coluna_id uuid,
  ordem int,
  origem text,
  prioridade text,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- tarefa_respostas
create table if not exists public.tarefa_respostas (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid,
  autor text,
  conteudo text,
  created_at timestamptz default now()
);

-- tarefa_anexos (FK -> tarefas)
create table if not exists public.tarefa_anexos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  tipo text not null default 'imagem',
  url text,
  prompt text,
  origem text not null default 'higgsfield',
  status text not null default 'pronto',
  created_at timestamptz default now()
);
create index if not exists tarefa_anexos_tarefa_id_idx on public.tarefa_anexos(tarefa_id);

-- whatsapp_config
create table if not exists public.whatsapp_config (
  id uuid primary key default gen_random_uuid(),
  numero text,
  instance text,
  instance_token text,
  admin_token text,
  server_url text,
  status text,
  updated_at timestamptz default now()
);

-- RLS + policies permissivas + grants para todas as tabelas reconstruidas
do $$
declare t text;
begin
  foreach t in array array[
    'agentes','ai_config','conversas','google_config','kanban_colunas','mensagens',
    'meta_config','notificacoes','notificacao_logs','tarefas','tarefa_respostas',
    'tarefa_anexos','whatsapp_config'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_all', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true);', t||'_all', t);
  end loop;
end $$;
