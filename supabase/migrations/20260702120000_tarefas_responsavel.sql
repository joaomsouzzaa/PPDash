-- Workflow: separa "Agente" (IA) de "Responsável" (usuário real da equipe).
-- agente_id continua apontando pro agente de IA; responsavel_id passa a apontar
-- pro membro da org (auth.users). RLS já isola tarefas por org_id = current_org_id().
alter table public.tarefas
  add column if not exists responsavel_id uuid references auth.users(id) on delete set null;

create index if not exists tarefas_responsavel_id_idx on public.tarefas(responsavel_id);
