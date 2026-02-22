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

    // Vote counts
    const { data: votesData, error: votesError } = await supabase
      .from('votes')
      .select('story_id')
      .in('story_id', storyIds);

    if (votesError) throw votesError;

    const voteCounts = votesData.reduce((acc, v) => {
      acc[String(v.story_id)] = (acc[String(v.story_id)] || 0) + 1;
      return acc;
    }, {});

    // Voting status
    const { data: votingDataRaw, error: votingError } = await supabase
      .from('voting_status')
      .select('story_id, status')
      .in('story_id', storyIds);

    if (votingError) throw votingError;

    const votingMap = {};
    votingDataRaw.forEach(v => {
      votingMap[String(v.story_id)] = v.status;
    });

    return stories.map(story => ({
      ...story,
      vote_count: voteCounts[String(story.id)] || 0,
      voting_status: votingMap[String(story.id)] || 'upcoming'
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

/* =======================
   RENDERERS
======================= */

export function renderStoriesForVote(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  stories.forEach(story => {
    const voteCount = story.vote_count || 0;
    const card = document.createElement('article');
    card.className = 'story-card';
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

/* =======================
   BUTTON HANDLERS
======================= */

export function updateVoteButtons(userVotes, stories) {
  document.querySelectorAll('.vote-btn').forEach(btn => {
    const storyId = btn.dataset.storyId;
    const story = stories.find(s => String(s.id) === String(storyId));
    if (!story) return;

    const status = story.voting_status || 'upcoming';
    const count = btn.dataset.voteCount || 0;

    if (status === 'open') {
      if (userVotes.includes(String(storyId))) {
        btn.disabled = true;
        btn.textContent = `Voted (${count})`;
        btn.classList.add('voted');
      } else {
        btn.disabled = false;
        btn.textContent = `Vote (${count})`;
        btn.classList.remove('voted');
      }
    } else if (status === 'upcoming') {
      btn.disabled = true;
      btn.textContent = 'Voting starts soon';
    } else if (status === 'closed') {
      btn.disabled = true;
      btn.textContent = `Voting Closed (${count})`;
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

/* =======================
   INIT VOTING
======================= */

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