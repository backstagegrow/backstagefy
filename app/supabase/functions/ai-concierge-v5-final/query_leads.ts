
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
    .from('leads')
    .select('*')
    .limit(1);

if (error) {
    console.error("Error:", error);
} else {
    if (data && data.length > 0) {
        console.log("Columns:", Object.keys(data[0]));
        console.log("Sample Data:", data[0]);
    } else {
        console.log("Table 'leads' exists but is empty.");
    }
}
