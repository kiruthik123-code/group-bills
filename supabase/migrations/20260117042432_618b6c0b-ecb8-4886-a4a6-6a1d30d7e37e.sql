-- Add a stored emoji/icon for each group expense
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS category_icon text NOT NULL DEFAULT '🧾';

COMMENT ON COLUMN public.expenses.category_icon IS 'Emoji icon representing the expense category (e.g., 🍽️, 🛒, 🚕).';