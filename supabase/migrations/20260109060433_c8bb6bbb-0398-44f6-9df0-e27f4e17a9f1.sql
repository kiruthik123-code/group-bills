-- 1) Add phone_number to profiles for contact lookups
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone_number text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_key
ON public.profiles (phone_number)
WHERE phone_number IS NOT NULL;

-- 2) Contacts table: stores user->contact_user relationships
CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT contacts_contact_user_id_fkey
    FOREIGN KEY (contact_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own contacts"
ON public.contacts
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS contacts_unique_pair
ON public.contacts(user_id, contact_user_id);

-- 3) Direct messages table for 1:1 chat
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_sender_fkey
    FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT direct_messages_receiver_fkey
    FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Users can send messages only to users with whom they share at least one group
CREATE POLICY "Users can send dms to users in shared groups"
ON public.direct_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.group_members gm1
    JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = auth.uid()
      AND gm2.user_id = receiver_id
  )
);

-- Users can view only their own DMs and only while a shared group exists
CREATE POLICY "Users can view dms with users in shared groups"
ON public.direct_messages
FOR SELECT
TO authenticated
USING (
  (sender_id = auth.uid() OR receiver_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.group_members gm1
    JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = auth.uid()
      AND gm2.user_id = CASE
        WHEN auth.uid() = sender_id THEN receiver_id
        ELSE sender_id
      END
  )
);

-- Only the recipient can update (e.g., mark as read)
CREATE POLICY "Message recipients can update read status"
ON public.direct_messages
FOR UPDATE
TO authenticated
USING (receiver_id = auth.uid())
WITH CHECK (receiver_id = auth.uid());

-- 4) Group invites table for contact-based invites
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_status') THEN
    CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'declined');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.group_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  status public.invite_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

ALTER TABLE public.group_invites
  ADD CONSTRAINT group_invites_inviter_fkey
    FOREIGN KEY (inviter_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT group_invites_invitee_fkey
    FOREIGN KEY (invitee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

-- Group members can create invites for groups they belong to
CREATE POLICY "Group members can invite contacts"
ON public.group_invites
FOR INSERT
TO authenticated
WITH CHECK (
  inviter_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = group_id
      AND gm.user_id = auth.uid()
  )
);

-- Inviter and invitee can view the invite
CREATE POLICY "Users can view their invites"
ON public.group_invites
FOR SELECT
TO authenticated
USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

-- Only invitee can change status (accept/decline)
CREATE POLICY "Invitee can respond to invite"
ON public.group_invites
FOR UPDATE
TO authenticated
USING (invitee_id = auth.uid())
WITH CHECK (invitee_id = auth.uid());

-- Prevent multiple concurrent pending invites for the same group/user
CREATE UNIQUE INDEX IF NOT EXISTS group_invites_unique_pending
ON public.group_invites(group_id, invitee_id)
WHERE status = 'pending';

-- 5) Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_invites;