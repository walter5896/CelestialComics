// /.netlify/functions/determine-winner.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// AUTH / ADMIN HELPERS
// =========================

// Validate the bearer token and ensure the requester is an admin.
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

// =========================
// VOTING PERIOD HELPERS
// =========================

// Determine whether a period should be treated as closed for winner finalization.
// A period is eligible if:
// - it is not finalized
// - and it was manually closed with closed_at
//   OR its scheduled end_time has already passed
function isEffectivelyClosed(period) {
  if (!period) return false;
  if (period.finalized_at) return false;
  if (period.closed_at) return true;

  const now = new Date();
  const end = new Date(period.end_time);

  return now > end;
}

// Fetch the latest unfinalized period that is eligible for winner determination.
// Prefer the highest id because rounds are now created sequentially and only one
// unfinalized round should exist at a time.
async function getLatestClosedUnfinalizedPeriod() {
  const { data, error } = await supabase
    .from('voting_periods')
    .select(`
      id,
      start_time,
      end_time,
      status,
      closed_at,
      finalized_at,
      finalized_by,
      winner_id,
      winning_vote_count
    `)
    .is('finalized_at', null)
    .order('id', { ascending: false })
    .limit(5);

  if (error) throw error;

  const periods = data || [];
  return periods.find(isEffectivelyClosed) || null;
}

// =========================
// VOTE COUNTING HELPERS
// =========================

// Fetch all votes for a specific round and roll them up by story.
async function computeVoteTotalsForPeriod(periodId) {
  const { data: votes, error: voteError } = await supabase
    .from('votes')
    .select('story_id, vote_count')
    .eq('voting_period_id', periodId);

  if (voteError) throw voteError;

  if (!votes || votes.length === 0) {
    return {
      hasVotes: false,
      voteTotals: [],
      topCount: 0,
      topStories: []
    };
  }

  const counts = {};

  votes.forEach(vote => {
    const storyId = String(vote.story_id);
    const count = Number(vote.vote_count) || 0;
    counts[storyId] = (counts[storyId] || 0) + count;
  });

  const rawTotals = Object.entries(counts)
    .map(([story_id, total_votes]) => ({
      story_id,
      total_votes
    }))
    .sort((a, b) => b.total_votes - a.total_votes);

  const storyIds = rawTotals.map(item => item.story_id);

  const { data: stories, error: storyError } = await supabase
    .from('stories')
    .select('id, title')
    .in('id', storyIds);

  if (storyError) throw storyError;

  const titleMap = {};
  (stories || []).forEach(story => {
    titleMap[String(story.id)] = story.title;
  });

  const voteTotals = rawTotals.map(item => ({
    ...item,
    title: titleMap[item.story_id] || 'Untitled Story'
  }));

  const topCount = voteTotals[0]?.total_votes || 0;
  const topStories = voteTotals.filter(item => item.total_votes === topCount);

  return {
    hasVotes: true,
    voteTotals,
    topCount,
    topStories
  };
}

// =========================
// MAIN HANDLER
// =========================

exports.handler = async (event) => {
  // Reject non-POST requests.
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Read bearer token from request headers.
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing auth token' })
    };
  }

  try {
    // Validate requester and ensure they are an admin.
    const adminUser = await getAdminUser(token);

    // Find the latest round that is closed but not yet finalized.
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

    // Double-check effective status for clarity in the response.
    const effectiveStatus = isEffectivelyClosed(period) ? 'closed' : 'not_closed';

    if (effectiveStatus !== 'closed') {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          message: 'This voting period is not closed yet.',
          period_id: period.id
        })
      };
    }

    // Compute vote totals for the selected round.
    const { hasVotes, voteTotals, topCount, topStories } =
      await computeVoteTotalsForPeriod(period.id);

    // If nobody voted in this round, do not finalize a winner.
    if (!hasVotes) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          message: 'No votes were cast in this voting period.',
          period_id: period.id
        })
      };
    }

    // If there is a tie for first place, do not finalize automatically.
    if (topStories.length > 1) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          reason: 'tie_detected',
          message: 'Tie detected. No winner finalized.',
          period_id: period.id,
          vote_totals: voteTotals
        })
      };
    }

    // Resolve the winning story from the computed totals.
    const winnerStoryId = voteTotals[0].story_id;
    const winnerTitle = voteTotals[0].title;
    const winningVoteCount = voteTotals[0].total_votes;

    // Finalize the period while preserving original start/end times.
    // Also normalize status to finalized and stamp finalized_by / finalized_at.
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

    // Return the finalized winner details plus round totals for UI display.
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        period_id: period.id,
        winner_id: winnerStoryId,
        winner_title: winnerTitle,
        vote_count: winningVoteCount,
        vote_totals: voteTotals,
        finalized_period: finalizedPeriod
      })
    };
  } catch (err) {
    console.error('determine-winner error:', err);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || 'Server error'
      })
    };
  }
};