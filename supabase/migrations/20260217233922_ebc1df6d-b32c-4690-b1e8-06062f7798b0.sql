-- Create tags table
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de tags" ON public.tags FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de tags" ON public.tags FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de tags" ON public.tags FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de tags" ON public.tags FOR DELETE USING (true);

-- Seed existing tags from leads
INSERT INTO public.tags (nome)
SELECT DISTINCT trim(unnest(string_to_array(tags, ',')))
FROM public.leads
WHERE tags IS NOT NULL AND tags != ''
ON CONFLICT (nome) DO NOTHING;