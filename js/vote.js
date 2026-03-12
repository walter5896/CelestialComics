// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

/* =======================
   VOTING PERIOD HELPERS
======================= */

// Fetch the latest unfinalized voting period.
// This is the round the public voting UI should care about.
async function fetchCurrentVotingPeriod() {
  const { data, error } = await supabase
    .from('voting_periods')
    .select('id, start_time, end_time, status, winner_id, finalized_at, winning_vote_count')
    .is('finalized_at', null)
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching current voting period:', error);
    return null;
  }

  return data?.[0] || null;
}

// Fetch the currently open voting period for vote submission/recant logic.
async function fetchOpenVotingPeriod() {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('voting_periods')
    .select('id, start_time, end_time, status, finalized_at')
    .is('finalized_at', null)
    .lte('start_time', nowIso)
    .gte('end_time', nowIso)
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching open voting period:', error);
    return null;
  }

  return data?.[0] || null;
}

// Derive the public voting state for the current round.
// Prefer the stored DB status first, then fall back to date math if needed.
function deriveVotingStatus(period) {
  if (!period) return 'closed';
  if (period.finalized_at) return 'closed';

  if (period.status === 'open' || period.status === 'closed' || period.status === 'upcoming') {
    return period.status;
  }

  const now = new Date();
  const start = new Date(period.start_time);
  const end = new Date(period.end_time);

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'open';
  return 'closed';
}

/* =======================
   FETCH FUNCTIONS
======================= */

export async function fetchStoriesWithVotes() {
  try {
    // Use the latest UNFINALIZED round as the current round.
    const currentPeriod = await fetchCurrentVotingPeriod();
    const currentVotingStatus = deriveVotingStatus(currentPeriod);
    const currentVotingPeriodId = currentPeriod?.id || null;

    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select('id, title, image_url, cover_image_url, author, description, active')
      .eq('active', true);

    if (storiesError) throw storiesError;

    let votesQuery = supabase.from('votes').select('story_id, vote_count');

    if (currentVotingPeriodId) {
      votesQuery = votesQuery.eq('voting_period_id', currentVotingPeriodId);
    } else {
      // No active round means no visible current-round votes.
      return (stories || []).map(story => ({
        ...story,
        vote_count: 0,
        voting_status: 'closed'
      }));
    }

    const { data: votesData, error: votesError } = await votesQuery;

    if (votesError) throw votesError;

    const voteCounts = (votesData || []).reduce((acc, vote) => {
      const storyId = String(vote.story_id);
      const count = Number(vote.vote_count) || 0;
      acc[storyId] = (acc[storyId] || 0) + count;
      return acc;
    }, {});

    return (stories || []).map(story => ({
      ...story,
      vote_count: voteCounts[String(story.id)] || 0,
      voting_status: currentVotingStatus
    }));
  } catch (err) {
    console.error('Error fetching stories with votes:', err);
    return [];
  }
}

export async function fetchUserVotes() {
  const user = await getCurrentUserAsync();
  if (!user) return [];

  const currentPeriod = await fetchCurrentVotingPeriod();
  const currentVotingPeriodId = currentPeriod?.id || null;

  try {
    let query = supabase
      .from('votes')
      .select('story_id, vote_count, voting_period_id')
      .eq('user_id', user.id);

    if (currentVotingPeriodId) {
      query = query.eq('voting_period_id', currentVotingPeriodId);
    } else {
      return [];
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching user votes:', error);
      return [];
    }

    return (data || []).map(v => ({
      story_id: String(v.story_id),
      vote_count: Number(v.vote_count) || 0,
      voting_period_id: v.voting_period_id
    }));
  } catch (err) {
    console.error('Unexpected error fetching user votes:', err);
    return [];
  }
}

export async function fetchUserVoteBalance() {
  const user = await getCurrentUserAsync();
  if (!user) return 0;

  const { data, error } = await supabase
    .from('profiles')
    .select('vote_balance')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching vote balance:', error);
    return 0;
  }

  return Number(data?.vote_balance) || 0;
}

export async function fetchSavedStories() {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false, data: [] };

  const { data, error } = await supabase
    .from('saved_stories')
    .select('story_id, stories(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching saved stories:', error);
    return { success: false, data: [] };
  }

  const stories = (data || []).map(item => item.stories).filter(Boolean);
  return { success: true, data: stories };
}

/* =======================
   VOTE / SAVE FUNCTIONS
======================= */

export async function submitVote(storyId, amount = 1) {
  const user = await getCurrentUserAsync();
  if (!user) {
    alert('You must be logged in to vote!');
    return { success: false, reason: 'not_logged_in' };
  }

  const openVotingPeriod = await fetchOpenVotingPeriod();
  if (!openVotingPeriod) {
    return { success: false, reason: 'voting_closed' };
  }

  const votingPeriodId = openVotingPeriod.id;

  const voteAmount = Number(amount);
  if (!Number.isInteger(voteAmount) || voteAmount <= 0) {
    return { success: false, reason: 'invalid_amount' };
  }

  const currentBalance = await fetchUserVoteBalance();
  if (currentBalance < voteAmount) {
    alert(`You do not have enough votes. Remaining votes: ${currentBalance}`);
    return {
      success: false,
      reason: 'insufficient_balance',
      balance: currentBalance
    };
  }

  const { data: existingVote, error: existingVoteError } = await supabase
    .from('votes')
    .select('id, vote_count, voting_period_id')
    .eq('user_id', user.id)
    .eq('story_id', storyId)
    .eq('voting_period_id', votingPeriodId)
    .maybeSingle();

  if (existingVoteError) {
    console.error('Error checking existing vote:', existingVoteError);
    return { success: false, reason: 'vote_lookup_failed' };
  }

  if (existingVote) {
    const newVoteCount = (Number(existingVote.vote_count) || 0) + voteAmount;

    const { error: updateVoteError } = await supabase
      .from('votes')
      .update({ vote_count: newVoteCount })
      .eq('id', existingVote.id);

    if (updateVoteError) {
      console.error('Error updating vote count:', updateVoteError);
      return { success: false, reason: 'vote_update_failed' };
    }
  } else {
    const { error: insertVoteError } = await supabase
      .from('votes')
      .insert([
        {
          user_id: user.id,
          story_id: storyId,
          vote_count: voteAmount,
          voting_period_id: votingPeriodId
        }
      ]);

    if (insertVoteError) {
      console.error('Error inserting vote:', insertVoteError);
      return { success: false, reason: 'vote_insert_failed' };
    }
  }

  const newBalance = currentBalance - voteAmount;

  const { error: balanceError } = await supabase
    .from('profiles')
    .update({ vote_balance: newBalance })
    .eq('id', user.id);

  if (balanceError) {
    console.error('Error updating vote balance:', balanceError);
    return { success: false, reason: 'balance_update_failed' };
  }

  return {
    success: true,
    amount: voteAmount,
    balance: newBalance,
    voting_period_id: votingPeriodId
  };
}

export async function recantVote(storyId, amount = 1) {
  const user = await getCurrentUserAsync();
  if (!user) {
    return { success: false, reason: 'not_logged_in' };
  }

  const openVotingPeriod = await fetchOpenVotingPeriod();
  if (!openVotingPeriod) {
    return { success: false, reason: 'voting_closed' };
  }

  const votingPeriodId = openVotingPeriod.id;

  const recantAmount = Number(amount);
  if (!Number.isInteger(recantAmount) || recantAmount <= 0) {
    return { success: false, reason: 'invalid_amount' };
  }

  const { data: existingVote, error: voteError } = await supabase
    .from('votes')
    .select('id, vote_count, voting_period_id')
    .eq('user_id', user.id)
    .eq('story_id', storyId)
    .eq('voting_period_id', votingPeriodId)
    .maybeSingle();

  if (voteError) {
    console.error('Error fetching existing vote for recant:', voteError);
    return { success: false, reason: 'vote_lookup_failed' };
  }

  if (!existingVote) {
    return { success: false, reason: 'no_vote_found' };
  }

  const currentVoteCount = Number(existingVote.vote_count) || 0;
  if (currentVoteCount < recantAmount) {
    return { success: false, reason: 'recant_amount_too_high' };
  }

  const remainingVoteCount = currentVoteCount - recantAmount;

  if (remainingVoteCount === 0) {
    const { error: deleteError } = await supabase
      .from('votes')
      .delete()
      .eq('id', existingVote.id);

    if (deleteError) {
      console.error('Error deleting vote row:', deleteError);
      return { success: false, reason: 'vote_delete_failed' };
    }
  } else {
    const { error: updateError } = await supabase
      .from('votes')
      .update({ vote_count: remainingVoteCount })
      .eq('id', existingVote.id);

    if (updateError) {
      console.error('Error reducing vote count:', updateError);
      return { success: false, reason: 'vote_update_failed' };
    }
  }

  const currentBalance = await fetchUserVoteBalance();
  const newBalance = currentBalance + recantAmount;

  const { error: balanceError } = await supabase
    .from('profiles')
    .update({ vote_balance: newBalance })
    .eq('id', user.id);

  if (balanceError) {
    console.error('Error restoring vote balance:', balanceError);
    return { success: false, reason: 'balance_update_failed' };
  }

  return {
    success: true,
    amount: recantAmount,
    balance: newBalance,
    voting_period_id: votingPeriodId
  };
}

export async function saveStory(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false, reason: 'not_logged_in' };

  const { error } = await supabase
    .from('saved_stories')
    .insert({ user_id: user.id, story_id: storyId });

  if (error) {
    if (error.code === '23505') {
      return { success: false, reason: 'already_saved' };
    }

    console.error('Error saving story:', error);
    return { success: false, reason: 'save_failed' };
  }

  return { success: true };
}

export async function unsaveStory(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false, reason: 'not_logged_in' };

  const { error } = await supabase
    .from('saved_stories')
    .delete()
    .eq('user_id', user.id)
    .eq('story_id', storyId);

  if (error) {
    console.error('Error unsaving story:', error);
    return { success: false, reason: 'unsave_failed' };
  }

  return { success: true };
}

/* =======================
   RENDERERS
======================= */

function getStoryImage(story) {
  return story.cover_image_url || story.image_url || '';
}

export function renderStoriesForHome(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  stories.forEach(story => {
    const card = document.createElement('article');
    card.className = 'story-card';
    card.innerHTML = `
      <img src="${getStoryImage(story)}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <div class="story-actions">
        <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>
      </div>
    `;
    container.appendChild(card);
  });
}

export function renderStoriesForGallery(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  stories.forEach(story => {
    const card = document.createElement('article');
    card.className = 'story-card';
    card.innerHTML = `
      <img src="${getStoryImage(story)}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <div class="story-actions">
        <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>
      </div>
    `;
    container.appendChild(card);
  });
}

export function renderStoriesForVote(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  stories.forEach(story => {
    const card = document.createElement('article');
    card.className = 'story-card';
    const voteCount = Number(story.vote_count) || 0;

    card.innerHTML = `
      <img src="${getStoryImage(story)}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <div class="story-actions">
        <button
          class="btn btn-primary vote-btn"
          data-story-id="${story.id}"
          data-vote-count="${voteCount}">
          Vote (${voteCount})
        </button>
        <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>
      </div>
    `;

    container.appendChild(card);
  });
}

export function renderStoriesForProfile(votedStories, savedStories, votedContainerId, savedContainerId) {
  const votedContainer = document.getElementById(votedContainerId);
  const savedContainer = document.getElementById(savedContainerId);

  if (votedContainer) {
    votedContainer.innerHTML = '';

    votedStories.forEach(story => {
      const card = document.createElement('article');
      card.className = 'story-card';
      card.innerHTML = `
        <img src="${getStoryImage(story)}" alt="${story.title}" />
        <h3>${story.title}</h3>
        <p>You cast ${story.user_vote_count || 0} vote(s)</p>
        <div class="story-actions">
          <button class="btn btn-primary recant-btn" data-story-id="${story.id}">
            Recant 1 Vote
          </button>
          <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>
        </div>
      `;
      votedContainer.appendChild(card);
    });
  }

  if (savedContainer) {
    savedContainer.innerHTML = '';

    savedStories.forEach(story => {
      const card = document.createElement('article');
      card.className = 'story-card';
      card.innerHTML = `
        <img src="${getStoryImage(story)}" alt="${story.title}" />
        <h3>${story.title}</h3>
        <div class="story-actions">
          <button class="btn btn-secondary unsave-btn" data-story-id="${story.id}">
            Unsave
          </button>
          <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>
        </div>
      `;
      savedContainer.appendChild(card);
    });
  }
}

/* =======================
   BUTTON HANDLERS
======================= */

export function updateVoteButtons(userVotes, stories) {
  const userVoteMap = new Map(
    userVotes.map(v => [String(v.story_id), Number(v.vote_count) || 0])
  );

  document.querySelectorAll('.vote-btn').forEach(btn => {
    const storyId = String(btn.dataset.storyId);
    const story = stories.find(s => String(s.id) === storyId);
    if (!story) return;

    const status = story.voting_status || 'upcoming';
    const userVoteCountForStory = userVoteMap.get(storyId) || 0;
    const publicVoteCount = Number(btn.dataset.voteCount) || 0;

    if (status === 'open') {
      btn.disabled = false;
      btn.textContent = userVoteCountForStory > 0
        ? `Add Vote (${publicVoteCount})`
        : `Vote (${publicVoteCount})`;
      btn.classList.toggle('voted', userVoteCountForStory > 0);
    } else if (status === 'upcoming') {
      btn.disabled = true;
      btn.textContent = 'Voting starts soon';
      btn.classList.remove('voted');
    } else if (status === 'closed') {
      btn.disabled = true;
      btn.textContent = `Voting Closed (${publicVoteCount})`;
      btn.classList.remove('voted');
    }
  });
}

export function attachVoteListeners(containerId = 'story-grid') {
  document.querySelectorAll(`#${containerId} .vote-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Submitting...';

      try {
        const storyId = btn.dataset.storyId;
        const result = await submitVote(storyId, 1);

        if (result.success) {
          location.reload();
          return;
        }

        if (result.reason === 'voting_closed') {
          btn.textContent = 'Voting Closed';
        } else if (result.reason === 'insufficient_balance') {
          btn.textContent = originalText;
        } else {
          btn.textContent = originalText;
        }

        btn.disabled = false;
      } catch (err) {
        console.error('Vote click error:', err);
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}

export function attachSaveListeners(containerId = 'story-grid', savedStoryIds = []) {
  document.querySelectorAll(`#${containerId} .save-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
      const storyId = btn.dataset.storyId;
      const alreadySaved = savedStoryIds.includes(String(storyId));

      if (alreadySaved) {
        const unsaveResult = await unsaveStory(storyId);
        if (!unsaveResult.success) return;

        btn.textContent = 'Save Story';
        const idx = savedStoryIds.indexOf(String(storyId));
        if (idx > -1) savedStoryIds.splice(idx, 1);
      } else {
        const saveResult = await saveStory(storyId);
        if (!saveResult.success && saveResult.reason !== 'already_saved') return;

        btn.textContent = 'Saved';
        if (!savedStoryIds.includes(String(storyId))) {
          savedStoryIds.push(String(storyId));
        }
      }
    });
  });
}

export function attachRecantListeners(containerId) {
  document.querySelectorAll(`#${containerId} .recant-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;

      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Recanting...';

      try {
        const storyId = btn.dataset.storyId;
        const res = await recantVote(storyId, 1);

        if (res.success) {
          location.reload();
          return;
        }

        btn.disabled = false;
        btn.textContent = originalText;

        if (res.reason === 'voting_closed') {
          alert('Voting is closed. You can no longer recant votes for this round.');
        } else {
          alert('Could not recant vote.');
        }
      } catch (err) {
        console.error('Recant click error:', err);
        btn.disabled = false;
        btn.textContent = originalText;
        alert('Could not recant vote.');
      }
    });
  });
}

export function attachUnsaveListeners(containerId) {
  document.querySelectorAll(`#${containerId} .unsave-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
      const storyId = btn.dataset.storyId;
      const res = await unsaveStory(storyId);
      if (res.success) location.reload();
    });
  });
}

export async function initVoting(containerId = 'story-grid') {
  const user = await getCurrentUserAsync();
  if (!user) return false;

  const stories = await fetchStoriesWithVotes();
  renderStoriesForVote(stories, containerId);

  const userVotes = await fetchUserVotes();
  updateVoteButtons(userVotes, stories);
  attachVoteListeners(containerId);

  return stories;
}