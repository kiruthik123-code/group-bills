-- Add expense_id column to settlements table to track which expenses have been paid
ALTER TABLE public.settlements ADD COLUMN expense_id uuid;

-- Add foreign key constraint
ALTER TABLE public.settlements ADD CONSTRAINT settlements_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE;

-- Update RLS policies to include the new column if needed
-- The existing policies should still work since we're only adding a column