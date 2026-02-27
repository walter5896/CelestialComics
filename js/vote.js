// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

/* =======================
   FETCH FUNCTIONS
======================= */

// Updated to match global voting window (no per-story voting_status)
export async function fetchStoriesWithVotes() {
  try {
    // Fetch all stories
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select('id, title, image_url');
    if (storiesError) throw storiesError;

    // Fetch all votes
    const { data: votesData, error: votesError } = await supabase
      .from('votes')
      .select('story_id');
    if (votesError) throw votesError;

    // Count votes per story
    const voteCounts = votesData.reduce((acc, v) => {
      acc[String(v.story_id)] = (acc[String(v.story_id)] || 0) + 1;
      return acc;
    }, {});

    // Fetch the latest global voting window
    const { data: votingDataRaw, error: votingError } = await supabase
      .from('voting_status')
      .select('*')
      .limit(1);
    if (votingError) throw votingError;

    const votingStatus = votingDataRaw[0] || {};
    const status = votingStatus.is_open ? 'open' :
                   votingStatus.is_closed ? 'closed' : 'upcoming';

    return stories.map(story => ({
      ...story,
      vote_count: voteCounts[String(story.id)] || 0,
      voting_status: status,
      winner_id: votingStatus.winner_id || null
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

export function renderStoriesForHome(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  stories.forEach(story => {
    const card = document.createElement('article');
    card.className = 'story-card';
    card.innerHTML = `
      <img src="${story.image_url}" alt="${story.title}" />
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
      <img src="${story.image_url}" alt="${story.title}" />
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
    const voteCount = story.vote_count || 0;
    card.innerHTML = `
      <img src="${story.image_url}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <div class="story-actions">
        <button class="btn btn-primary vote-btn"
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
        <img src="${story.image_url}" alt="${story.title}" />
        <h3>${story.title}</h3>
        <div class="story-actions">
          <button class="btn btn-primary recant-btn" data-story-id="${story.id}">Recant Vote</button>
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
        <img src="${story.image_url}" alt="${story.title}" />
        <h3>${story.title}</h3>
        <div class="story-actions">
          <button class="btn btn-secondary unsave-btn" data-story-id="${story.id}">Unsave</button>
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
  if (!user) return false; // not logged in

  const stories = await fetchStoriesWithVotes();
  renderStoriesForVote(stories, containerId);

  const userVotes = await fetchUserVotes();
  updateVoteButtons(userVotes, stories);

  attachVoteListeners(containerId);

  return stories;
}