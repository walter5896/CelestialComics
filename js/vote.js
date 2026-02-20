// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

/**
 * Fetch stories with vote counts and voting state
 */
export async function fetchStories() {
  try {
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

    // Fetch voting states from the view
    const { data: votingStates, error: vsError } = await supabase
      .from('voting_status')
      .select('story_id, status, start_time')
      .in('story_id', storyIds);

    if (vsError) throw vsError;

    const stateMap = {};
    votingStates.forEach(vs => {
      stateMap[vs.story_id] = { status: vs.status, start_time: vs.start_time };
    });

    // Merge everything
    return stories.map(story => ({
      ...story,
      vote_count: voteCounts[story.id] || 0,
      voting: stateMap[story.id] || { status: 'upcoming', start_time: null }
    }));
  } catch (err) {
    console.error('Error fetching stories:', err);
    return [];
  }
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

    const voteButtonId = `vote-btn-${story.id}`;
    const countdownId = `countdown-${story.id}`;

    card.innerHTML = `
      <img src="${story.image_url}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <div class="story-actions">
        <button
          id="${voteButtonId}"
          class="btn btn-primary vote-btn"
          data-story-id="${story.id}"
          data-vote-count="${story.vote_count}"
        >
          Vote (${story.vote_count})
        </button>
        <span id="${countdownId}" class="vote-countdown"></span>
        <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>
      </div>
    `;
    container.appendChild(card);

    // Initialize vote button state
    updateVoteButton(story, getCurrentUser());
  });
}

/**
 * Update vote button based on user votes and voting state
 */
export function updateVoteButton(story, user) {
  const btn = document.getElementById(`vote-btn-${story.id}`);
  const countdownEl = document.getElementById(`countdown-${story.id}`);

  if (!btn) return;

  const hasVoted = user?.id && story.voting?.status === 'open'; // placeholder
  const votingStatus = story.voting?.status || 'upcoming';

  if (votingStatus === 'upcoming') {
    btn.textContent = 'Voting starts soon';
    btn.disabled = true;

    if (story.voting.start_time) {
      startCountdown(story.id, story.voting.start_time);
    }
  } else if (votingStatus === 'open') {
    btn.disabled = false;
    btn.textContent = `Vote (${story.vote_count})`;
    btn.onclick = async () => {
      const success = await submitVote(story.id);
      if (success) {
        btn.disabled = true;
        btn.textContent = `Voted (${story.vote_count + 1})`;
      }
    };
  } else if (votingStatus === 'closed') {
    btn.textContent = `Voting Closed (${story.vote_count})`;
    btn.disabled = true;
  }
}

/**
 * Countdown timer for upcoming votes
 */
function startCountdown(storyId, startTime) {
  const countdownEl = document.getElementById(`countdown-${storyId}`);
  if (!countdownEl) return;

  const interval = setInterval(() => {
    const now = new Date();
    const diff = new Date(startTime) - now;
    if (diff <= 0) {
      clearInterval(interval);
      // Refresh the vote button to open state
      fetchStories().then(stories => {
        const story = stories.find(s => s.id === storyId);
        updateVoteButton(story, getCurrentUser());
      });
      return;
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    countdownEl.textContent = `${hours}h ${minutes}m ${seconds}s`;
  }, 1000);
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
