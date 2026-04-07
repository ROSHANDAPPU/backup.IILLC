import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

(async () => {
    const { data, error } = await supabase.from('shifts').select('*, venues(name), profiles!shifts_photographer_id_fkey(full_name)').limit(1);
    console.log("Shifts Error:", JSON.stringify(error, null, 2));
})();
