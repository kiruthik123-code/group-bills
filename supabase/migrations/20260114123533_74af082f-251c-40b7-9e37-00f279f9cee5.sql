-- Secure avatar storage bucket and fix function search_path

-- 1. Make avatars bucket private
UPDATE storage.buckets
SET public = false
WHERE id = 'avatars';

-- 2. Replace overly permissive public SELECT policy on avatar images
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- Authenticated users can view avatars of users in their groups
CREATE POLICY "Authenticated users can view avatars in their groups"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.group_members gm1 ON gm1.user_id = p.id
    JOIN public.group_members gm2 ON gm2.group_id = gm1.group_id
    WHERE (storage.foldername(name))[1] = p.id::text
      AND gm2.user_id = auth.uid()
  )
);

-- Users can always view their own avatar
CREATE POLICY "Users can view their own avatar"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Ensure update_updated_at_column has a fixed search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;