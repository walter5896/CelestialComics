// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

/**
 * Fetch all stories with vote counts and voting status
 */
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
    const { data: votingData, error: votingError } = await supabase
      .from('voting_status')
      .select('story_id, status')
      .in('story_id', storyIds);

    if (votingError) throw votingError;

    const votingMap = {};
    votingData.forEach(v => {
      votingMap[String(v.story_id)] = v.status;
    });

    // Merge
    return stories.map(story => ({
      ...story,
      vote_count: voteCounts[String(story.id)] || 0,
      voting_status: votingMap[String(story.id)] || 'upcoming',
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
  const user = await getCurrentUserAsync();
  if (!user) return [];
  const { data, error } = await supabase
    .from('votes')
    .select('story_id')
    .eq('user_id', user.id);
  if (error) {
    console.error('Error fetching user votes:', error);
    return [];
  }
  return data.map(v => String(v.story_id));
}

/**
 * Fetch saved stories for current user
 */
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

  const stories = data.map(item => item.stories);
  return { success: true, data: stories };
}

/**
 * Save a story
 */
export async function saveStory(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false, error: 'Not authenticated' };
  const { error } = await supabase
    .from('saved_stories')
    .insert({ user_id: user.id, story_id: storyId });

  if (error) {
    if (error.code === '23505') return { success: true }; // already saved
    console.error('Error saving story:', error);
    return { success: false, error };
  }
  return { success: true };
}

/**
 * Unsave a story
 */
export async function unsaveStory(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false, error: 'Not authenticated' };
  const { error } = await supabase
    .from('saved_stories')
    .delete()
    .eq('user_id', user.id)
    .eq('story_id', storyId);

  if (error) {
    console.error('Error unsaving story:', error);
    return { success: false, error };
  }
  return { success: true };
}

/**
 * Submit vote
 */
export async function submitVote(storyId) {
  const user = await getCurrentUserAsync();
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
 * Recant vote
 */
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

/**
 * Render stories into a container
 */
export function renderStories(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  stories.forEach(story => {
    const isSavedText = story.isSaved ? 'Saved' : 'Save Story';
    const card = document.createElement('article');
    card.className = 'story-card';
    card.innerHTML = `
      <img src="${story.image_url}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <div class="story-actions">
        <button class="btn btn-primary vote-btn"
          data-story-id="${story.id}"
          data-vote-count="${story.vote_count || 0}">
          Vote (${story.vote_count || 0})
        </button>
        <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">
          Read More
        </a>
        <button class="btn btn-secondary save-btn"
          data-story-id="${story.id}"
          data-is-saved="${story.isSaved ? 1 : 0}">
          ${isSavedText}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

/**
 * Update vote button states
 */
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

/**
 * Initialize voting UI and Save/Unsave buttons
 * Works for Home, Gallery, or any container
 */
export async function initVoting(containerId = 'story-grid') {
  const stories = await fetchStoriesWithVotes();
  const userVotes = await fetchUserVotes();

  // Fetch saved stories for current user
  const savedStoriesData = await fetchSavedStories();
  const savedStoryIds = savedStoriesData.success
    ? savedStoriesData.data.map(s => String(s.id))
    : [];

  // Mark saved
  stories.forEach(s => s.isSaved = savedStoryIds.includes(String(s.id)));

  renderStories(stories, containerId);
  updateVoteButtons(userVotes, stories);

  // Vote click
  document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const storyId = btn.dataset.storyId;
      const success = await submitVote(storyId);
      if (success) await initVoting(containerId);
    });
  });

  // Save/Unsave click
  document.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const storyId = btn.dataset.storyId;
      const storyObj = stories.find(s => String(s.id) === String(storyId));
      if (!storyObj) return;

      if (storyObj.isSaved) {
        const result = await unsaveStory(storyId);
        if (result.success) {
          storyObj.isSaved = false;
          btn.textContent = 'Save Story';
          btn.dataset.isSaved = '0';
        }
      } else {
        const result = await saveStory(storyId);
        if (result.success) {
          storyObj.isSaved = true;
          btn.textContent = 'Saved';
          btn.dataset.isSaved = '1';
        }
      }
    });
  });
}