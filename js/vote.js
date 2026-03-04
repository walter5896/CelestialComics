// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

/* =======================
   HELPER: Voting Status
======================= */
export async function getCurrentVotingPeriod() {
  try {
    const { data: periods, error } = await supabase
      .from('voting_periods')
      .select('start_time, end_time')
      .order('start_time', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!periods || periods.length === 0) return null;

    return periods[0];
  } catch (err) {
    console.error('Error fetching voting period:', err);
    return null;
  }
}

export async function isVotingOpen() {
  const period = await getCurrentVotingPeriod();
  if (!period) return false;

  const now = new Date();
  const start = new Date(period.start_time);
  const end = new Date(period.end_time);
  return now >= start && now <= end;
}

export async function getVotingStatus() {
  const period = await getCurrentVotingPeriod();
  if (!period) return 'upcoming';

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
    // Fetch all stories
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select('id, title, image_url');
    if (storiesError) throw storiesError;

    // Count votes per story
    const { data: votesData, error: votesError } = await supabase
      .from('votes')
      .select('story_id');
    if (votesError) throw votesError;

    const voteCounts = votesData.reduce((acc, v) => {
      acc[String(v.story_id)] = (acc[String(v.story_id)] || 0) + 1;
      return acc;
    }, {});

    // Attach voting status
    const status = await getVotingStatus();

    return stories.map(story => ({
      ...story,
      vote_count: voteCounts[String(story.id)] || 0,
      voting_status: status
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

  const votingOpen = await isVotingOpen();
  if (!votingOpen) {
    alert('Voting has ended. You cannot vote anymore.');
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

  const votingOpen = await isVotingOpen();
  if (!votingOpen) {
    return { success: false, error: 'Voting has ended. You cannot recant your vote.' };
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
   RENDER FUNCTIONS
======================= */

function createStoryCard(story, includeVote = false, includeSave = false, includeRecant = false) {
  const card = document.createElement('article');
  card.className = 'story-card';

  let actionsHTML = '';

  // Vote button
  if (includeVote) {
    let btnText = `Vote (${story.vote_count || 0})`;
    let disabled = '';
    const status = story.voting_status || 'upcoming';
    if (status === 'upcoming') { btnText = 'Voting starts soon'; disabled = 'disabled'; }
    else if (status === 'closed') { btnText = `Voting Closed (${story.vote_count || 0})`; disabled = 'disabled'; }

    actionsHTML += `<button class="btn btn-primary vote-btn" data-story-id="${story.id}" ${disabled}>${btnText}</button>`;
  }

  // Save button
  if (includeSave) {
    actionsHTML += `<button class="btn btn-secondary save-btn" data-story-id="${story.id}">Save Story</button>`;
  }

  // Recant button
  if (includeRecant) {
    actionsHTML += `<button class="btn btn-primary recant-btn" data-story-id="${story.id}">Recant Vote</button>`;
  }

  // Always include read more
  actionsHTML += `<a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>`;

  card.innerHTML = `
    <img src="${story.image_url}" alt="${story.title}" />
    <h3>${story.title}</h3>
    <div class="story-actions">${actionsHTML}</div>
  `;
  return card;
}

export function renderStoriesForHome(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  stories.forEach(story => container.appendChild(createStoryCard(story)));
}

export function renderStoriesForGallery(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  stories.forEach(story => container.appendChild(createStoryCard(story)));
}

export function renderStoriesForVote(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  stories.forEach(story => container.appendChild(createStoryCard(story, true)));
}

export function renderStoriesForProfile(votedStories, savedStories, votedContainerId, savedContainerId) {
  const votedContainer = document.getElementById(votedContainerId);
  const savedContainer = document.getElementById(savedContainerId);

  if (votedContainer) {
    votedContainer.innerHTML = '';
    votedStories.forEach(story => votedContainer.appendChild(createStoryCard(story, false, false, true)));
  }

  if (savedContainer) {
    savedContainer.innerHTML = '';
    savedStories.forEach(story => savedContainer.appendChild(createStoryCard(story)));
  }
}

/* =======================
   BUTTON HANDLERS
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

export function attachRecantListeners(containerId) {
  document.querySelectorAll(`#${containerId} .recant-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
      const storyId = btn.dataset.storyId;
      const res = await recantVote(storyId);
      if (res.success) location.reload();
      else alert(res.error || 'Cannot recant vote.');
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

/* =======================
   INIT
======================= */

export async function initVoting(containerId = 'story-grid') {
  const user = await getCurrentUserAsync();
  if (!user) return false; // not logged in

  const stories = await fetchStoriesWithVotes();
  renderStoriesForVote(stories, containerId);

  const userVotes = await fetchUserVotes();
  document.querySelectorAll('.vote-btn').forEach(btn => {
    const storyId = btn.dataset.storyId;
    if (userVotes.includes(String(storyId))) {
      btn.disabled = true;
      btn.classList.add('voted');
      btn.textContent = `Voted (${btn.dataset.voteCount || 0})`;
    }
  });

  attachVoteListeners(containerId);

  return stories;
}