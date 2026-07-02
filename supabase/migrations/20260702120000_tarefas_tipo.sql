-- Tipo de conteúdo do card do Workflow: 'reels' (vídeo) ou 'estatico' (post/carrossel).
-- Define qual inteligência de referência o card usa (roteiro de vídeo vs briefing de design).
alter table public.tarefas add column if not exists tipo text not null default 'reels';
