-- Allow anyone to upload to the audio bucket (it's already public for reading)
CREATE POLICY "Allow public upload to audio bucket"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'audio');

-- Allow public update/upsert to audio bucket
CREATE POLICY "Allow public update to audio bucket"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'audio');
