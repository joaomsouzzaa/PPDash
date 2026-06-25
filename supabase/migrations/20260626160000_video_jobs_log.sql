-- Vídeo Editor: log de progresso ao vivo (atividade por atividade + % real).
alter table public.video_jobs add column if not exists log jsonb;
