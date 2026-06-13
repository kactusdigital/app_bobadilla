import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://xupvocrzkqffwgekpqrp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1cHZvY3J6a3FmZndnZWtwcXJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDQ1MDksImV4cCI6MjA5MTQyMDUwOX0.8slWzLwZ_hZc70OGZnPljqvbUirDG5jzS4fsNo8WwYA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('config_v4').select('*');
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
