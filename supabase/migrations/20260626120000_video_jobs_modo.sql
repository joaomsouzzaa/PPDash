-- Vídeo Editor: modo do job (corte simples vs edição editorial completa) + timeline da edição.
alter table public.video_jobs add column if not exists modo text not null default 'corte';   -- 'corte' | 'completo'
alter table public.video_jobs add column if not exists timeline jsonb;                          -- timeline.json da edição (auditoria + base do editor futuro)
