-- Allow members to delete their own group membership (leave groups)
CREATE POLICY "Members can leave groups"
ON public.group_members
FOR DELETE
TO authenticated
USING (user_id = auth.uid());