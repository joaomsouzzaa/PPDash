-- Palavras-chave para auto-detectar o projeto a partir do briefing/copy.
-- Ex.: "workshop scale, ws, scale" → puxa o repositório ao gerar a arte.
alter table public.projetos_design add column if not exists palavras_chave text;
