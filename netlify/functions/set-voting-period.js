// /.netlify/functions/set-voting-period.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { start_time, end_time } = JSON.parse(event.body);

  if (!start_time || !end_time) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing start or end time' }) };
  }

  try {
    // Fetch latest voting period
    const { data: periods, error: fetchError } = await supabase
      .from('voting_periods')
      .select('id')
      .order('start_time', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    if (periods && periods.length > 0) {
      // Update existing period
      const { error } = await supabase
        .from('voting_periods')
        .update({ start_time, end_time })
        .eq('id', periods[0].id);

      if (error) throw error;
    } else {
      // No period exists yet — insert a new one
      const { error } = await supabase
        .from('voting_periods')
        .insert([{ start_time, end_time }]);

      if (error) throw error;
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}