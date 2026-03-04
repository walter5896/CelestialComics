// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

/* =======================
   FETCH FUNCTIONS
======================= */

export async function fetchStoriesWithVotes() {
  try {
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select('id, title, image_url');
    if (storiesError) throw storiesError;

    const storyIds = stories.map(s => s.id);

    const { data: votesData, error: votesError } = await supabase
      .from('votes')
      .select('story_id');
    if (votesError) throw votesError;

    const voteCounts = votesData.reduce((acc, v) => {
      acc[String(v.story_id)] = (acc[String(v.story_id)] || 0) + 1;
      return acc;
    }, {});

    const { data: votingPeriods, error: votingError } = await supabase
      .from('voting_periods')
      .select('start_time, end_time')
      .order('start_time', { ascending: false })
      .limit(1);
    if (votingError) throw votingError;

    const now = new Date();
    let globalStatus = 'upcoming';
    if (votingPeriods && votingPeriods.length > 0) {
      const { start_time, end_time } = votingPeriods[0];
      const start = new Date(start_time);
      const end = new Date(end_time);
      if (now < start) globalStatus = 'upcoming';
      else if (now >= start && now <= end) globalStatus = 'open';
      else globalStatus = 'closed';
    }

    return stories.map(story => ({
      ...story,
      vote_count: voteCounts[String(story.id)] || 0,
      voting_status: globalStatus
    }));
  } catch (err) {
    console.error('Error fetching stories with votes:', err);
    return [];
  }
}

export async function fetchUserVotes() {
  const user = await getCurrentUserAsync();
  if (!user) return [];
  const { data, error } = await supabase
    .from('votes')
    .select('story_id')
    .eq('user_id', user.id);
  if (error) { console.error(error); return []; }
  return data.map(v => String(v.story_id));
}

export async function fetchSavedStories() {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false, data: [] };
  const { data, error } = await supabase
    .from('saved_stories')
    .select('story_id, stories(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return { success: false, data: [] }; }
  const stories = data.map(item => item.stories);
  return { success: true, data: stories };
}

/* =======================
   VOTE / SAVE FUNCTIONS
======================= */

export async function submitVote(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) { alert('You must be logged in to vote!'); return false; }

  // Check voting period again before allowing vote
  const { data: votingPeriods } = await supabase
    .from('voting_periods')
    .select('start_time, end_time')
    .order('start_time', { ascending: false })
    .limit(1);
  const now = new Date();
  const { start_time, end_time } = votingPeriods[0] || {};
  if (start_time && end_time) {
    const start = new Date(start_time);
    const end = new Date(end_time);
    if (now < start || now > end) {
      alert('Voting has ended. You cannot vote anymore.');
      return false;
    }
  }

  const { error } = await supabase.from('votes')
    .insert([{ story_id: storyId, user_id: user.id }]);
  if (error) {
    if (error.code === '23505') alert('You already voted!');
    else console.error(error);
    return false;
  }
  return true;
}

export async function recantVote(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false, error: 'Not logged in' };

  // Disable recant if voting period is closed
  const { data: votingPeriods } = await supabase
    .from('voting_periods')
    .select('start_time, end_time')
    .order('start_time', { ascending: false })
    .limit(1);
  const now = new Date();
  const { start_time, end_time } = votingPeriods[0] || {};
  if (start_time && end_time) {
    const start = new Date(start_time);
    const end = new Date(end_time);
    if (now > end) return { success: false, error: 'Voting is closed. Cannot recant.' };
  }

  const { error } = await supabase
    .from('votes')
    .delete()
    .eq('user_id', user.id)
    .eq('story_id', storyId);
  if (error) return { success: false, error };
  return { success: true };
}

export async function saveStory(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false };
  const { error } = await supabase
    .from('saved_stories')
    .insert({ user_id: user.id, story_id: storyId });
  if (error && error.code !== '23505') {
    console.error(error); return { success: false };
  }
  return { success: true };
}

export async function unsaveStory(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false };
  const { error } = await supabase
    .from('saved_stories')
    .delete()
    .eq('user_id', user.id)
    .eq('story_id', storyId);
  if (error) { console.error(error); return { success: false }; }
  return { success: true };
}

/* =======================
   RENDERERS
======================= */

export function renderStoriesForVote(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  stories.forEach(story => {
    const voteCount = story.vote_count || 0;
    const status = story.voting_status || 'upcoming';
    const card = document.createElement('article');
    card.className = 'story-card';

    let voteBtnText = `Vote (${voteCount})`;
    let voteBtnDisabled = false;

    if (status === 'upcoming') {
      voteBtnText = 'Voting starts soon';
      voteBtnDisabled = true;
    } else if (status === 'closed') {
      voteBtnText = `Voting Closed (${voteCount})`;
      voteBtnDisabled = true;
    }

    card.innerHTML = `
      <img src="${story.image_url}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <div class="story-actions">
        <button class="btn btn-primary vote-btn"
          data-story-id="${story.id}"
          data-vote-count="${voteCount}" ${voteBtnDisabled ? 'disabled' : ''}>
          ${voteBtnText}
        </button>
        <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>
      </div>
    `;
    container.appendChild(card);
  });
}

/* =======================
   BUTTON HANDLERS
======================= */

export function attachVoteListeners(containerId = 'story-grid') {
  document.querySelectorAll(`#${containerId} .vote-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      const storyId = btn.dataset.storyId;
      const success = await submitVote(storyId);
      if (success) location.reload();
    });
  });
}

export function attachRecantListeners(containerId) {
  document.querySelectorAll(`#${containerId} .recant-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
      const storyId = btn.dataset.storyId;
      const res = await recantVote(storyId);
      if (res.success) location.reload();
      else if (res.error) alert(res.error);
    });
  });
}

export function attachSaveListeners(containerId = 'story-grid', savedStoryIds = []) {
  document.querySelectorAll(`#${containerId} .save-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
      const storyId = btn.dataset.storyId;
      const alreadySaved = savedStoryIds.includes(String(storyId));
      if (alreadySaved) {
        await unsaveStory(storyId);
        btn.textContent = 'Save Story';
        const idx = savedStoryIds.indexOf(String(storyId));
        if (idx > -1) savedStoryIds.splice(idx, 1);
      } else {
        await saveStory(storyId);
        btn.textContent = 'Saved';
        savedStoryIds.push(String(storyId));
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