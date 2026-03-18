// /.netlify/functions/determine-winner.js

// =========================
// IMPORTS
// =========================
const { createClient } = require('@supabase/supabase-js');

// =========================
// SUPABASE CLIENT
// =========================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =========================
// ADMIN USER VALIDATOR
// =========================
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
// CLOSED STATE HELPER
// =========================
function isEffectivelyClosed(period) {
  if (!period) return false;
  if (period.finalized_at) return true;
  if (period.closed_at) return true;

  const now = new Date();
  const end = new Date(period.end_time);

  if (Number.isNaN(end.getTime())) return false;

  return now > end;
}

// =========================
// CLOSED UNFINALIZED ROUND FETCHER
// =========================
// Returns the latest round that is effectively closed but not yet finalized.
// A round counts as closed if:
// - closed_at is set, OR
// - end_time has already passed.
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
      winner_id,
      winning_vote_count
    `)
    .is('finalized_at', null)
    .order('id', { ascending: false })
    .limit(10);

  if (error) throw error;

  const periods = data || [];
  return periods.find((period) => !period.finalized_at && isEffectivelyClosed(period)) || null;
}

// =========================
// ROUND VOTE TOTALS FETCHER
// =========================
async function getVoteTotalsForPeriod(periodId) {
  const { data: votes, error: voteError } = await supabase
    .from('votes')
    .select('story_id, vote_count')
    .eq('voting_period_id', periodId);

  if (voteError) throw voteError;

  if (!votes || votes.length === 0) {
    return [];
  }

  const counts = {};

  votes.forEach((vote) => {
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

  const storyIds = rawTotals.map((item) => item.story_id);

  const { data: stories, error: storyError } = await supabase
    .from('stories')
    .select('id, title')
    .in('id', storyIds);

  if (storyError) throw storyError;

  const titleMap = {};
  (stories || []).forEach((story) => {
    titleMap[String(story.id)] = story.title;
  });

  return rawTotals.map((item) => ({
    ...item,
    title: titleMap[item.story_id] || 'Untitled Story'
  }));
}

// =========================
// ROUND FINALIZER
// =========================
// Finalizes the specified round with the provided winning story data.
// This also supports "no winner" finalization when winnerStoryId is null.
async function finalizeRound({
  periodId,
  winnerStoryId = null,
  winningVoteCount = null,
  adminUserId
}) {
  const nowIso = new Date().toISOString();

  const { data: finalizedPeriod, error: finalizeError } = await supabase
    .from('voting_periods')
    .update({
      winner_id: winnerStoryId,
      winning_vote_count: winningVoteCount,
      finalized_at: nowIso,
      finalized_by: adminUserId,
      status: 'finalized',
      closed_at: nowIso
    })
    .eq('id', periodId)
    .is('finalized_at', null)
    .select()
    .single();

  if (finalizeError) throw finalizeError;

  return finalizedPeriod;
}

// =========================
// MAIN HANDLER
// =========================
// Determines the winner automatically when possible, allows an admin
// to manually resolve a tie, and finalizes no-vote rounds with no winner.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing auth token' })
    };
  }

  try {
    const adminUser = await getAdminUser(token);

    const body = JSON.parse(event.body || '{}');
    const selectedWinnerStoryId = body.winner_story_id
      ? String(body.winner_story_id)
      : null;

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

    const voteTotals = await getVoteTotalsForPeriod(period.id);

    // =========================
    // NO-VOTES FINALIZATION
    // =========================
    if (!voteTotals.length) {
      const finalizedPeriod = await finalizeRound({
        periodId: period.id,
        winnerStoryId: null,
        winningVoteCount: null,
        adminUserId: adminUser.id
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          no_votes: true,
          period_id: period.id,
          winner_id: null,
          winner_title: null,
          vote_count: null,
          vote_totals: [],
          message: 'Round finalized with no winner because no votes were cast.',
          finalized_period: finalizedPeriod
        })
      };
    }

    // =========================
    // TIE DETECTION
    // =========================
    const topCount = voteTotals[0]?.total_votes || 0;
    const topStories = voteTotals.filter((item) => item.total_votes === topCount);

    // =========================
    // MANUAL TIE RESOLUTION
    // =========================
    if (selectedWinnerStoryId) {
      const selectedTiedStory = topStories.find(
        (item) => String(item.story_id) === selectedWinnerStoryId
      );

      if (!selectedTiedStory) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Selected winner must be one of the tied top-vote stories.',
            period_id: period.id,
            tied_stories: topStories
          })
        };
      }

      const finalizedPeriod = await finalizeRound({
        periodId: period.id,
        winnerStoryId: selectedTiedStory.story_id,
        winningVoteCount: selectedTiedStory.total_votes,
        adminUserId: adminUser.id
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          tie_resolved: true,
          period_id: period.id,
          winner_id: selectedTiedStory.story_id,
          winner_title: selectedTiedStory.title,
          vote_count: selectedTiedStory.total_votes,
          vote_totals: voteTotals,
          finalized_period: finalizedPeriod
        })
      };
    }

    // =========================
    // AUTO TIE RESPONSE
    // =========================
    if (topStories.length > 1) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          reason: 'tie_detected',
          message: 'Tie detected. Please choose a winner manually.',
          period_id: period.id,
          vote_totals: voteTotals,
          tied_stories: topStories
        })
      };
    }

    // =========================
    // AUTO FINALIZATION
    // =========================
    const winner = voteTotals[0];

    const finalizedPeriod = await finalizeRound({
      periodId: period.id,
      winnerStoryId: winner.story_id,
      winningVoteCount: winner.total_votes,
      adminUserId: adminUser.id
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        period_id: period.id,
        winner_id: winner.story_id,
        winner_title: winner.title,
        vote_count: winner.total_votes,
        vote_totals: voteTotals,
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