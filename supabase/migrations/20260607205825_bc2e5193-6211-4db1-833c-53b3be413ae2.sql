-- Garante leitura/escrita da tabela tarefa_anexos pelo frontend (anon/authenticated).
-- Sem isso a galeria de artes fica vazia mesmo com os registros existindo.
grant select, insert, update, delete on public.tarefa_anexos to anon, authenticated, service_role;

alter table public.tarefa_anexos enable row level security;

drop policy if exists "tarefa_anexos_all" on public.tarefa_anexos;
create policy "tarefa_anexos_all" on public.tarefa_anexos
  for all to anon, authenticated
  using (true) with check (true);