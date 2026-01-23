-- ============================================
-- CREATE INDIVIDUAL_EXPENSES TABLE
-- Run this in your Supabase SQL Editor
-- ============================================

-- Create the table
CREATE TABLE IF NOT EXISTS public.individual_expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    category TEXT DEFAULT 'Other' NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.individual_expenses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own individual expenses" ON public.individual_expenses;
DROP POLICY IF EXISTS "Users can insert their own individual expenses" ON public.individual_expenses;
DROP POLICY IF EXISTS "Users can update their own individual expenses" ON public.individual_expenses;
DROP POLICY IF EXISTS "Users can delete their own individual expenses" ON public.individual_expenses;

-- Create RLS Policies
CREATE POLICY "Users can view their own individual expenses" 
ON public.individual_expenses
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own individual expenses" 
ON public.individual_expenses
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own individual expenses" 
ON public.individual_expenses
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own individual expenses" 
ON public.individual_expenses
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_individual_expenses_user_id ON public.individual_expenses (user_id);
CREATE INDEX IF NOT EXISTS idx_individual_expenses_date ON public.individual_expenses (date);
CREATE INDEX IF NOT EXISTS idx_individual_expenses_category ON public.individual_expenses (category);

-- Verify the table was created
SELECT 'Table created successfully!' AS status;
