
CREATE TABLE public.produtos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de produtos" ON public.produtos FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de produtos" ON public.produtos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de produtos" ON public.produtos FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de produtos" ON public.produtos FOR DELETE USING (true);
