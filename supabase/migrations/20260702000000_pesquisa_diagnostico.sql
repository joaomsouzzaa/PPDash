-- ============================================================
-- Diagnóstico de Franqueabilidade (IA) nas Pesquisas.
-- Acrescenta ao construtor genérico de pesquisas o suporte a:
--  - pilar por pergunta (agrupa perguntas pontuadas em pilares p/ score por pilar);
--  - campo de captura por pergunta (nome/negocio/instagram/segmento/faturamento),
--    usado para montar o schema de entrada da IA;
--  - análise gerada por IA + score determinístico, salvos junto da resposta (cache).
-- Colunas herdam a RLS por org já criada em 20260625000000_pesquisas.sql.
-- ============================================================

-- Pilar do diagnóstico + papel de captura (ambos opcionais).
alter table public.pesquisa_perguntas
  add column if not exists pilar text,   -- ex: 'Rentabilidade' (null p/ perguntas não pontuadas)
  add column if not exists campo text;   -- 'nome' | 'negocio' | 'instagram' | 'segmento' | 'faturamento'

-- Score determinístico (geral + por pilar) e análise da IA (cache por resposta).
alter table public.pesquisa_respostas
  add column if not exists score jsonb,                                 -- { score_geral_pct, score_por_pilar: [{pilar, pct}] }
  add column if not exists analise jsonb,                               -- schema de saída do relatório
  add column if not exists analise_status text not null default 'pendente', -- 'pendente' | 'gerada' | 'erro'
  add column if not exists analise_criada_em timestamptz;
