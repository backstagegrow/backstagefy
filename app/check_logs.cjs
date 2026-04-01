const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from('logs')
    .select('created_at, level, message, meta')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error("DB Error:", error);
  } else {
    for (const log of data) {
      console.log(`[${log.created_at}] ${log.level}: ${log.message}`);
      if (log.meta && Object.keys(log.meta).length > 0) {
        console.log(`  Meta: ${JSON.stringify(log.meta).substring(0, 200)}`);
      }
    }
  }
}

run();
