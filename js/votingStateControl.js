// /js/votingStateControl.js
import { fetchStoriesWithVotes, fetchUserVotes } from './vote.js';

/**
 * Disable voting/recant buttons if voting is closed
 * containerId: the HTML container where your story cards are
 */
export async function enforceVotingRules(containerId = 'story-grid') {
  // Fetch stories with vote counts & global voting status
  const stories = await fetchStoriesWithVotes();
  const userVotes = await fetchUserVotes();

  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll('.vote-btn, .recant-btn').forEach(btn => {
    const storyId = btn.dataset.storyId;
    const story = stories.find(s => String(s.id) === String(storyId));
    if (!story) return;

    if (story.voting_status === 'closed') {
      btn.disabled = true;

      // Update text based on button type
      if (btn.classList.contains('vote-btn')) {
        btn.textContent = `Voting Closed (${btn.dataset.voteCount || 0})`;
      } else if (btn.classList.contains('recant-btn')) {
        btn.textContent = 'Cannot Recant - Voting Closed';
      }
    } else if (story.voting_status === 'upcoming') {
      if (btn.classList.contains('vote-btn')) {
        btn.disabled = true;
        btn.textContent = 'Voting Starts Soon';
      } else if (btn.classList.contains('recant-btn')) {
        btn.disabled = true;
        btn.textContent = 'Cannot Recant - Voting Not Started';
      }
    } else if (story.voting_status === 'open') {
      // Enable buttons if voting is open
      if (btn.classList.contains('vote-btn')) {
        btn.disabled = userVotes.includes(String(storyId));
        btn.textContent = userVotes.includes(String(storyId))
          ? `Voted (${btn.dataset.voteCount || 0})`
          : `Vote (${btn.dataset.voteCount || 0})`;
      } else if (btn.classList.contains('recant-btn')) {
        btn.disabled = !userVotes.includes(String(storyId));
        btn.textContent = 'Recant Vote';
      }
    }
  });
}