// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

/**
 * Fetch stories with vote counts and voting state
 */
export async function fetchStoriesWithVotes() {
  try {
    // Fetch all stories
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select('id, title, image_url');

    if (storiesError) throw storiesError;

    const storyIds = stories.map(s => s.id);

    // Fetch vote counts
    const { data: votesData, error: votesError } = await supabase
      .from('votes')
      .select('story_id')
      .in('story_id', storyIds);

    if (votesError) throw votesError;

    const voteCounts = votesData.reduce((acc, v) => {
      acc[v.story_id] = (acc[v.story_id] || 0) + 1;
      return acc;
    }, {});

    // Fetch voting state for all stories from the view
    const { data: votingData, error: votingError } = await supabase
      .from('voting_status')
      .select('story_id, status')
      .in('story_id', storyIds);

    if (votingError) throw votingError;

    const votingMap = {};
    votingData.forEach(v => {
      votingMap[v.story_id] = v.status; // 'open', 'upcoming', 'closed'
    });

    // Merge vote counts and voting state into stories
    return stories.map(story => ({
      ...story,
      vote_count: voteCounts[story.id] || 0,
      voting_status: votingMap[story.id] || 'upcoming'
    }));
  } catch (err) {
    console.error('Error fetching stories with votes:', err);
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
 * Render stories into container
 */
export function renderStories(stories, containerId = 'story-grid') {
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
        <button
          class="btn btn-primary vote-btn"
          data-story-id="${story.id}"
          data-vote-count="${story.vote_count}"
        >
          Vote (${story.vote_count})
        </button>
        <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">
          Read More
        </a>
      </div>
    `;

    container.appendChild(card);
  });
}

/**
 * Update vote buttons based on voting state and user votes
 */
export function updateVoteButtons(userVotes, stories) {
  document.querySelectorAll('.vote-btn').forEach(btn => {
    const storyId = btn.dataset.storyId;
    const story = stories.find(s => s.id === storyId);
    const status = story?.voting_status || 'upcoming';

    if (status === 'open') {
      if (userVotes.includes(storyId)) {
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
