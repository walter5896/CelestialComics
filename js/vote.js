// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

/* =======================
   UTILITY FUNCTIONS
======================= */

export async function getCurrentVotingStatus() {
  try {
    const { data: periods, error } = await supabase
      .from('voting_periods')
      .select('start_time, end_time')
      .order('start_time', { ascending: false })
      .limit(1);
    if (error) throw error;

    const now = new Date();
    if (!periods || periods.length === 0) return 'upcoming';

    const { start_time, end_time } = periods[0];
    const start = new Date(start_time);
    const end = new Date(end_time);

    if (now < start) return 'upcoming';
    else if (now >= start && now <= end) return 'open';
    else return 'closed';
  } catch (err) {
    console.error('Error fetching voting status:', err);
    return 'upcoming';
  }
}

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

    const globalStatus = await getCurrentVotingStatus();

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

  // Check voting status
  const status = await getCurrentVotingStatus();
  if (status !== 'open') {
    alert('Voting is currently closed.');
    return false;
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

  const status = await getCurrentVotingStatus();
  if (status !== 'open') return { success: false, error: 'Voting is closed' };

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
  if (error && error.code !== '23505') { console.error(error); return { success: false }; }
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
   CREATE STORY CARD
======================= */

export function createStoryCard(story, includeVote = false, includeSave = false, includeRecant = false, savedStoryIds = []) {
  const card = document.createElement('article');
  card.className = 'story-card';

  const alreadySaved = savedStoryIds.includes(String(story.id));
  const saveBtnText = alreadySaved ? 'Unsave' : 'Save Story';

  let buttonsHTML = '';

  if (includeVote) {
    const voteCount = story.vote_count || 0;
    const status = story.voting_status || 'upcoming';
    const disabledText = status === 'upcoming' ? 'Voting starts soon' :
                         status === 'closed' ? `Voting Closed (${voteCount})` :
                         null;
    const disabledAttr = disabledText ? 'disabled' : '';
    const btnText = disabledText || `Vote (${voteCount})`;

    buttonsHTML += `<button class="btn btn-primary vote-btn" data-story-id="${story.id}" data-vote-count="${voteCount}" ${disabledAttr}>${btnText}</button>`;
  }

  if (includeSave) {
    buttonsHTML += `<button class="btn btn-secondary save-btn" data-story-id="${story.id}">${saveBtnText}</button>`;
  }

  if (includeRecant) {
    buttonsHTML += `<button class="btn btn-primary recant-btn" data-story-id="${story.id}">Recant Vote</button>`;
  }

  buttonsHTML += `<a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>`;

  card.innerHTML = `
    <img src="${story.image_url}" alt="${story.title}" />
    <h3>${story.title}</h3>
    <div class="story-actions">
      ${buttonsHTML}
    </div>
  `;
  return card;
}

/* =======================
   RENDER FUNCTIONS
======================= */

export function renderStories(stories, containerId = 'story-grid', options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  stories.forEach(story => {
    const card = createStoryCard(
      story,
      options.includeVote,
      options.includeSave,
      options.includeRecant,
      options.savedStoryIds || []
    );
    container.appendChild(card);
  });
}

/* =======================
   EVENT ATTACHERS
======================= */

export function attachVoteListeners(containerId = 'story-grid') {
  document.querySelectorAll(`#${containerId} .vote-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
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
    });
  });
}

export function attachSaveListeners(containerId, savedStoryIds = []) {
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
        btn.textContent = 'Unsave';
        savedStoryIds.push(String(storyId));
      }
    });
  });
}

/* =======================
   INIT VOTING FOR PAGE
======================= */

export async function initVoting(containerId = 'story-grid') {
  const user = await getCurrentUserAsync();
  if (!user) return false;

  const stories = await fetchStoriesWithVotes();
  renderStories(stories, containerId, { includeVote: true });

  const userVotes = await fetchUserVotes();
  updateVoteButtons(userVotes, stories);

  attachVoteListeners(containerId);

  return stories;
}

export function updateVoteButtons(userVotes, stories) {
  document.querySelectorAll('.vote-btn').forEach(btn => {
    const storyId = btn.dataset.storyId;
    const story = stories.find(s => String(s.id) === String(storyId));
    if (!story) return;

    const status = story.voting_status || 'upcoming';
    if (status === 'open') {
      if (userVotes.includes(String(storyId))) {
        btn.disabled = true;
        btn.textContent = `Voted (${btn.dataset.voteCount || 0})`;
        btn.classList.add('voted');
      } else {
        btn.disabled = false;
        btn.textContent = `Vote (${btn.dataset.voteCount || 0})`;
        btn.classList.remove('voted');
      }
    } else if (status === 'upcoming') {
      btn.disabled = true;
      btn.textContent = 'Voting starts soon';
    } else if (status === 'closed') {
      btn.disabled = true;
      btn.textContent = `Voting Closed (${btn.dataset.voteCount || 0})`;
    }
  });
}