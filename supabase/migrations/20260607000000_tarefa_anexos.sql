-- Anexos gerados para tarefas (artes do Higgsfield, etc.)
create table if not exists public.tarefa_anexos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  tipo text not null default 'imagem',          -- 'imagem' | 'video'
  url text not null,                              -- URL da arte gerada
  prompt text,                                    -- prompt enviado ao Higgsfield
  origem text not null default 'higgsfield',
  status text not null default 'pronto',          -- 'gerando' | 'pronto' | 'erro'
  created_at timestamptz not null default now()
);

create index if not exists tarefa_anexos_tarefa_id_idx on public.tarefa_anexos(tarefa_id);

alter table public.tarefa_anexos enable row level security;

-- Mesma política aberta usada nas demais tabelas do app (ver backlog: fechar por
-- usuário/organização na fase de multi-usuário/RLS).
drop policy if exists "tarefa_anexos_all" on public.tarefa_anexos;
create policy "tarefa_anexos_all" on public.tarefa_anexos
  for all using (true) with check (true);
