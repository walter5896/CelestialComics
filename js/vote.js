// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

/**
 * Fetch stories with votes and voting status
 */
export async function fetchStoriesWithVotes() {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select(`
        id, title, image_url,
        votes: votes(story_id),
        voting_status: voting_status(status)
      `);

    if (error) throw error;

    return data.map(story => ({
      ...story,
      vote_count: story.votes.length,
      voting_status: story.voting_status?.status || 'upcoming'
    }));
  } catch (err) {
    console.error('Error fetching stories:', err);
    return [];
  }
}

/**
 * Fetch current user's votes
 */
export async function fetchUserVotes() {
  const user = getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('votes')
    .select('story_id')
    .eq('user_id', user.id);

  if (error) {
    console.error('Error fetching user votes:', error);
    return [];
  }

  return data.map(v => v.story_id);
}

/**
 * Render stories and vote buttons
 */
export function renderStories(stories, userVotes = [], containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  stories.forEach(story => {
    const btnText = story.voting_status === 'open'
      ? userVotes.includes(story.id)
        ? `Voted (${story.vote_count})`
        : `Vote (${story.vote_count})`
      : story.voting_status === 'upcoming'
        ? 'Voting starts soon'
        : `Voting Closed (${story.vote_count})`;

    const btnDisabled = story.voting_status !== 'open' || userVotes.includes(story.id);

    const card = document.createElement('article');
    card.className = 'story-card';
    card.innerHTML = `
      <img src="${story.image_url}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <div class="story-actions">
        <button
          class="btn btn-primary vote-btn ${userVotes.includes(story.id) ? 'voted' : ''}"
          data-story-id="${story.id}"
          data-vote-count="${story.vote_count}"
          ${btnDisabled ? 'disabled' : ''}
        >
          ${btnText}
        </button>
        <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>
      </div>
    `;
    container.appendChild(card);
  });
}

/**
 * Submit a vote
 */
export async function submitVote(storyId) {
  const user = getCurrentUser();
  if (!user) {
    alert('You must be logged in to vote!');
    return false;
  }

  const { error } = await supabase
    .from('votes')
    .insert([{ story_id: storyId, user_id: user.id }]);

  if (error) {
    if (error.code === '23505') alert('You already voted!');
    else console.error('Vote error:', error);
    return false;
  }

  return true;
}

/**
 * Recant a vote
 */
export async function recantVote(storyId) {
  const user = getCurrentUser();
  if (!user) return { success: false, error: 'Not logged in' };

  const { error } = await supabase
    .from('votes')
    .delete()
    .eq('user_id', user.id)
    .eq('story_id', storyId);

  if (error) return { success: false, error };

  return { success: true };
}

/**
 * Initialize voting UI
 */
export async function initVoting(containerId = 'story-grid') {
  const stories = await fetchStoriesWithVotes();
  const userVotes = await fetchUserVotes();
  renderStories(stories, userVotes, containerId);

  // Add click listeners for vote buttons
  document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const storyId = btn.dataset.storyId;
      const success = await submitVote(storyId);
      if (success) {
        initVoting(containerId); // refresh UI after vote
      }
    });
  });
}
