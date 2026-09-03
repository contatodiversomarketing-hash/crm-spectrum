GRANT UPDATE, DELETE ON public.interacoes_ia TO authenticated;
DROP POLICY IF EXISTS "Autenticados podem apagar interacoes" ON public.interacoes_ia;
CREATE POLICY "Autenticados podem apagar interacoes" ON public.interacoes_ia FOR DELETE TO authenticated USING (true);
DROP POLICY IF EXISTS "Autenticados podem editar interacoes" ON public.interacoes_ia;
CREATE POLICY "Autenticados podem editar interacoes" ON public.interacoes_ia FOR UPDATE TO authenticated USING (true) WITH CHECK (true);