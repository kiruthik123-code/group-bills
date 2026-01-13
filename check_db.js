import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const { data, error } = await supabase.from('profiles').select('*').limit(1);
  if (error) {
    console.error('Error connecting to Supabase or table missing:', error.message);
  } else {
    console.log('Successfully connected to Supabase and profiles table exists.');
  }
}

check();
