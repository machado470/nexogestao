import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wmvnayqjhzzsbmsjthzc.supabase.co';
const supabaseKey = 'sb_publishable_WyFI0oNejQvzRqYRdd9iQA_YzRfEgNU';

export const supabase = createClient(supabaseUrl, supabaseKey);
