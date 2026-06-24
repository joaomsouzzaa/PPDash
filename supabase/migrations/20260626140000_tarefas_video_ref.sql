-- Vídeo Editor v3: análise de vídeo de referência por card do Workflow.
-- Guarda { ref_url, ref_id, roteiro, insertion_plan, transcript, drive_url } da análise.
alter table public.tarefas add column if not exists video_ref jsonb;
