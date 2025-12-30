-- Add UPI ID field to user profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS upi_id text;