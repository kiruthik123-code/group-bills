-- Add invite fields to groups and enforce unique memberships

-- 1) Add invite_code and invite_link to groups
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS invite_code text,
  ADD COLUMN IF NOT EXISTS invite_link text;

-- Ensure invite_code is unique for joining via code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'groups_invite_code_key'
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_invite_code_key UNIQUE (invite_code);
  END IF;
END $$;

-- 2) Prevent duplicate group memberships
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_members_unique_member'
  ) THEN
    ALTER TABLE public.group_members
      ADD CONSTRAINT group_members_unique_member UNIQUE (group_id, user_id);
  END IF;
END $$;