
-- Create storage bucket for audio files
INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', true);

-- Allow public read access
CREATE POLICY "Public audio access" ON storage.objects FOR SELECT USING (bucket_id = 'audio');

-- Allow service role uploads (from edge functions)
CREATE POLICY "Service role upload audio" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'audio');
