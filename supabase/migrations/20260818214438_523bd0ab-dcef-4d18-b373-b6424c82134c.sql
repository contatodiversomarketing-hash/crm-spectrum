CREATE POLICY "Authenticated can delete leads" ON public.leads FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete lead_alertas" ON public.lead_alertas FOR DELETE TO authenticated USING (true);
GRANT DELETE ON public.leads TO authenticated;
GRANT DELETE ON public.lead_alertas TO authenticated;