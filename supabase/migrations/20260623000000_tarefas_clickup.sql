-- ============================================================
-- Card de tarefa estilo ClickUp
-- Novos campos em tarefas (datas, tempo estimado, etiquetas),
-- prioridade no padrão ClickUp (urgente/alta/normal/baixa) e
-- tabelas de subtarefas e checklist.
-- ============================================================

-- 1. Novas colunas em tarefas
alter table public.tarefas add column if not exists data_inicio date;
alter table public.tarefas add column if not exists data_vencimento date;
alter table public.tarefas add column if not exists tempo_estimado int;      -- minutos
alter table public.tarefas add column if not exists etiquetas text[] not null default '{}';

-- 2. Prioridade padrão ClickUp: media -> normal; default normal
update public.tarefas set prioridade = 'normal' where prioridade = 'media' or prioridade is null;
alter table public.tarefas alter column prioridade set default 'normal';

-- 3. Subtarefas
create table if not exists public.tarefa_subtarefas (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  titulo text not null,
  concluida boolean not null default false,
  ordem int not null default 0,
  org_id uuid default public.current_org_id(),
  created_at timestamptz not null default now()
);
create index if not exists tarefa_subtarefas_tarefa_id_idx on public.tarefa_subtarefas(tarefa_id);

-- 4. Checklist
create table if not exists public.tarefa_checklist (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  item text not null,
  concluido boolean not null default false,
  ordem int not null default 0,
  org_id uuid default public.current_org_id(),
  created_at timestamptz not null default now()
);
create index if not exists tarefa_checklist_tarefa_id_idx on public.tarefa_checklist(tarefa_id);

-- 5. RLS por organização (mesmo template das demais tabelas)
do $$
declare
  t text;
  tabelas text[] := array['tarefa_subtarefas','tarefa_checklist'];
begin
  foreach t in array tabelas
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_org_isolation', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.is_super_admin() or org_id = public.current_org_id()) '
      || 'with check (public.is_super_admin() or org_id = public.current_org_id());',
      t || '_org_isolation', t
    );
  end loop;
end $$;
