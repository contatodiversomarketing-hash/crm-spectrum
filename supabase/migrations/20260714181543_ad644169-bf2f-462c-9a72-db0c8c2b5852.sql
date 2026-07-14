
CREATE POLICY "Auth can read lead docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lead-documentos');
CREATE POLICY "Auth can upload lead docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-documentos');
CREATE POLICY "Auth can delete lead docs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lead-documentos');
