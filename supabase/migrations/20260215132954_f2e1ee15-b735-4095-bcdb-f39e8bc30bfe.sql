
CREATE TABLE public.cidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  data_evento TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de cidades" ON public.cidades FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de cidades" ON public.cidades FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de cidades" ON public.cidades FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de cidades" ON public.cidades FOR DELETE USING (true);
