const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function deriveNextRoundStatus(startTime, endTime) {
  const now = new Date();
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'open';
  return 'closed';
}

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
    .select('id, role, email')
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
    .select('id, start_time, end_time, status, winner_id, finalized_at, finalized_by, winning_vote_count')
    .lt('end_time', nowIso)
    .is('finalized_at', null)
    .order('end_time', { ascending: false })
    .limit(1);

  if (error) throw error;

  return data?.[0] || null;
}

async function getOpenOrUpcomingPeriod() {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('voting_periods')
    .select('id, start_time, end_time, status, finalized_at')
    .gte('end_time', nowIso)
    .is('finalized_at', null)
    .order('start_time', { ascending: true })
    .limit(1);

  if (error) throw error;

  return data?.[0] || null;
}

async function computeWinnerPreview(votingPeriodId) {
  const { data: votes, error: voteError } = await supabase
    .from('votes')
    .select('story_id, vote_count')
    .eq('voting_period_id', votingPeriodId);

  if (voteError) throw voteError;

  if (!votes || votes.length === 0) {
    return {
      has_votes: false,
      vote_totals: [],
      tie_detected: false,
      winner_story_id: null,
      winner_title: null,
      winning_vote_count: 0
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
  const tieDetected = topStories.length > 1;

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

  return {
    has_votes: true,
    vote_totals: enrichedTotals,
    tie_detected: tieDetected,
    tied_stories: enrichedTotals.filter(item => item.total_votes === topCount),
    winner_story_id: tieDetected ? null : enrichedTotals[0].story_id,
    winner_title: tieDetected ? null : enrichedTotals[0].title,
    winning_vote_count: topCount
  };
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

    const body = JSON.parse(event.body || '{}');
    const {
      action = 'preview',
      period_id = null,
      create_next_round = false,
      next_start_time = null,
      next_end_time = null
    } = body;

    let targetPeriod = null;

    if (period_id) {
      const { data, error } = await supabase
        .from('voting_periods')
        .select('id, start_time, end_time, status, winner_id, finalized_at, finalized_by, winning_vote_count')
        .eq('id', period_id)
        .single();

      if (error) throw error;
      targetPeriod = data;
    } else {
      targetPeriod = await getLatestClosedUnfinalizedPeriod();
    }

    if (!targetPeriod) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          reason: 'no_eligible_period',
          message: 'No closed, unfinalized voting period was found.'
        })
      };
    }

    const preview = await computeWinnerPreview(targetPeriod.id);

    if (!preview.has_votes) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          reason: 'no_votes',
          message: 'No votes were cast in this period.',
          period: targetPeriod
        })
      };
    }

    const existingFuturePeriod = await getOpenOrUpcomingPeriod();
    const canCreateNextRound = !existingFuturePeriod;

    if (action === 'preview') {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          action: 'preview',
          period: targetPeriod,
          preview,
          can_create_next_round: canCreateNextRound,
          existing_future_period: existingFuturePeriod || null
        })
      };
    }

    if (action !== 'finalize') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid action' })
      };
    }

    if (preview.tie_detected) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          reason: 'tie_detected',
          message: 'A tie was detected. Resolve the tie before finalizing.',
          period: targetPeriod,
          preview,
          can_create_next_round: canCreateNextRound,
          existing_future_period: existingFuturePeriod || null
        })
      };
    }

    const { data: latestCheck, error: latestCheckError } = await supabase
      .from('voting_periods')
      .select('id, finalized_at')
      .eq('id', targetPeriod.id)
      .single();

    if (latestCheckError) throw latestCheckError;

    if (latestCheck?.finalized_at) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          reason: 'already_finalized',
          message: 'This voting period has already been finalized.'
        })
      };
    }

    const finalizePayload = {
      winner_id: preview.winner_story_id,
      winning_vote_count: preview.winning_vote_count,
      finalized_at: new Date().toISOString(),
      finalized_by: adminUser.id,
      status: 'finalized'
    };

    const { data: finalizedPeriod, error: finalizeError } = await supabase
      .from('voting_periods')
      .update(finalizePayload)
      .eq('id', targetPeriod.id)
      .is('finalized_at', null)
      .select()
      .single();

    if (finalizeError) throw finalizeError;

    let nextRound = null;

    if (create_next_round) {
      if (existingFuturePeriod) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: false,
            reason: 'future_period_exists',
            message: 'An open or upcoming voting period already exists.',
            existing_future_period: existingFuturePeriod
          })
        };
      }

      if (!next_start_time || !next_end_time) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'next_start_time and next_end_time are required when create_next_round is true'
          })
        };
      }

      const nextStart = new Date(next_start_time);
      const nextEnd = new Date(next_end_time);

      if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid next round date(s)' })
        };
      }

      if (nextEnd <= nextStart) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Next round end time must be after start time' })
        };
      }

      const nextStatus = deriveNextRoundStatus(next_start_time, next_end_time);

      const { data: insertedRound, error: nextRoundError } = await supabase
        .from('voting_periods')
        .insert([
          {
            start_time: next_start_time,
            end_time: next_end_time,
            status: nextStatus
          }
        ])
        .select()
        .single();

      if (nextRoundError) throw nextRoundError;
      nextRound = insertedRound;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        action: 'finalize',
        finalized_period: finalizedPeriod,
        winner_story_id: preview.winner_story_id,
        winner_title: preview.winner_title,
        winning_vote_count: preview.winning_vote_count,
        next_round: nextRound
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