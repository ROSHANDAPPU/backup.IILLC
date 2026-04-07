import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

(async () => {
    const { data, error } = await supabase.from('deposits').select('*, shifts(total_sales, final_pay, venues(name)), profiles!deposits_photographer_id_fkey(full_name)').eq('is_confirmed', false);
    console.log("Data:", JSON.stringify(data, null, 2));
    console.log("Error:", JSON.stringify(error, null, 2));
})();
