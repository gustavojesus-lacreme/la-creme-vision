DROP POLICY IF EXISTS barber_photos_read ON storage.objects;
CREATE POLICY barber_photos_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'barber-photos' AND (storage.foldername(name))[1] = (auth.uid())::text);