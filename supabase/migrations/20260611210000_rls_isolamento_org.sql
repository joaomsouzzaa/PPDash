-- ============================================================
-- Fase 5a: Isolamento de dados por organização (RLS)
-- Remove as políticas abertas (anon=true) das tabelas de dados e
-- aplica isolamento: cada usuário só enxerga linhas da própria org.
-- Super admin enxerga tudo. Edge functions (service_role) ignoram RLS.
-- ============================================================

do $$
declare
  t text;
  pol record;
  tabelas text[] := array[
    'agentes','ai_config','base_conhecimento','cidades','conversas','google_config',
    'insights_trafego','kanban_colunas','leads','mensagens','meta_config','notificacao_logs',
    'notificacoes','pacote_artes','pacote_geracoes','pacotes_arte','produtos','projeto_assets',
    'projetos_design','tags','tarefa_anexos','tarefa_respostas','tarefas','vendas','whatsapp_config'
  ];
begin
  foreach t in array tabelas
  loop
    -- remove todas as políticas existentes da tabela
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I;', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security;', t);

    -- tira acesso do papel anônimo; mantém o autenticado
    execute format('revoke all on public.%I from anon;', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);

    -- isolamento por organização
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (public.is_super_admin() or org_id = public.current_org_id()) '
      || 'with check (public.is_super_admin() or org_id = public.current_org_id());',
      t || '_org_isolation', t
    );
  end loop;
end $$;
