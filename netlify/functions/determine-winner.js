const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async () => {
  try {

    // 1️⃣ Get the latest voting period
    const { data: period, error: periodError } = await supabase
      .from('voting_periods')
      .select('*')
      .order('start_time', { ascending: false })
      .limit(1)
      .single();

    if (periodError || !period) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No voting period found' })
      };
    }

    // 2️⃣ Get votes within this time window
    const { data: votes, error: voteError } = await supabase
      .from('votes')
      .select('story_id')
      .gte('created_at', period.start_time)
      .lte('created_at', period.end_time);

    if (voteError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: voteError.message })
      };
    }

    if (!votes || votes.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: false, message: 'No votes cast in this period.' })
      };
    }

    // 3️⃣ Count votes per story
    const counts = {};
    votes.forEach(v => {
      counts[v.story_id] = (counts[v.story_id] || 0) + 1;
    });

    // 4️⃣ Find highest vote count
    let winnerId = null;
    let maxVotes = 0;

    for (const storyId in counts) {
      if (counts[storyId] > maxVotes) {
        maxVotes = counts[storyId];
        winnerId = storyId;
      }
    }

    // 5️⃣ Store winner
    const { error: updateError } = await supabase
      .from('voting_periods')
      .update({ winner_id: winnerId })
      .eq('id', period.id);

    if (updateError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: updateError.message })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        winner_id: winnerId,
        vote_count: maxVotes
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};