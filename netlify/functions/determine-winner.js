// /.netlify/functions/determine-winner.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAdminUser(token) {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new Error('Invalid user token');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (profileError) throw profileError;

  if (!profile || profile.role !== 'admin') {
    throw new Error('Admin access required');
  }

  return user;
}

async function getLatestClosedUnfinalizedPeriod() {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('voting_periods')
    .select('id, start_time, end_time, status, finalized_at, winner_id')
    .lt('end_time', nowIso)
    .is('finalized_at', null)
    .order('end_time', { ascending: false })
    .limit(1);

  if (error) throw error;

  return data?.[0] || null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing auth token' })
    };
  }

  try {
    const adminUser = await getAdminUser(token);

    const period = await getLatestClosedUnfinalizedPeriod();

    if (!period) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          message: 'No closed, unfinalized voting period was found.'
        })
      };
    }

    const { data: votes, error: voteError } = await supabase
      .from('votes')
      .select('story_id, vote_count')
      .eq('voting_period_id', period.id);

    if (voteError) throw voteError;

    if (!votes || votes.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          message: 'No votes were cast in this voting period.',
          period_id: period.id
        })
      };
    }

    const counts = {};

    votes.forEach(vote => {
      const storyId = String(vote.story_id);
      const count = Number(vote.vote_count) || 0;
      counts[storyId] = (counts[storyId] || 0) + count;
    });

    const voteTotals = Object.entries(counts)
      .map(([story_id, total_votes]) => ({
        story_id,
        total_votes
      }))
      .sort((a, b) => b.total_votes - a.total_votes);

    const topCount = voteTotals[0]?.total_votes || 0;
    const topStories = voteTotals.filter(item => item.total_votes === topCount);

    const storyIds = voteTotals.map(item => item.story_id);

    const { data: stories, error: storyError } = await supabase
      .from('stories')
      .select('id, title')
      .in('id', storyIds);

    if (storyError) throw storyError;

    const titleMap = {};
    (stories || []).forEach(story => {
      titleMap[String(story.id)] = story.title;
    });

    const enrichedTotals = voteTotals.map(item => ({
      ...item,
      title: titleMap[item.story_id] || 'Untitled Story'
    }));

    if (topStories.length > 1) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          reason: 'tie_detected',
          message: 'Tie detected. No winner finalized.',
          period_id: period.id,
          vote_totals: enrichedTotals
        })
      };
    }

    const winnerStoryId = enrichedTotals[0].story_id;
    const winnerTitle = enrichedTotals[0].title;
    const winningVoteCount = enrichedTotals[0].total_votes;

    const { data: finalizedPeriod, error: finalizeError } = await supabase
      .from('voting_periods')
      .update({
        winner_id: winnerStoryId,
        winning_vote_count: winningVoteCount,
        finalized_at: new Date().toISOString(),
        finalized_by: adminUser.id,
        status: 'finalized'
      })
      .eq('id', period.id)
      .is('finalized_at', null)
      .select()
      .single();

    if (finalizeError) throw finalizeError;

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        period_id: period.id,
        winner_id: winnerStoryId,
        winner_title: winnerTitle,
        vote_count: winningVoteCount,
        vote_totals: enrichedTotals,
        finalized_period: finalizedPeriod
      })
    };
  } catch (err) {
    console.error('determine-winner error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Server error' })
    };
  }
};