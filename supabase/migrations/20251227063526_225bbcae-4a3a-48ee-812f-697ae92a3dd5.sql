-- Allow authenticated users to look up groups by invite code

-- Keep existing creator/member policies, add an extra SELECT policy for authenticated users
CREATE POLICY "Authenticated users can view groups by invite"
ON public.groups
FOR SELECT
TO authenticated
USING (true);