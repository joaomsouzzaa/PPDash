
-- Allow public users to update vendas
CREATE POLICY "Permitir atualização de vendas"
ON public.vendas
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Allow public users to delete vendas
CREATE POLICY "Permitir exclusão de vendas"
ON public.vendas
FOR DELETE
USING (true);
