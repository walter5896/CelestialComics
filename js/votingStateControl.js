// /js/votingStateControl.js
import { fetchStoriesWithVotes, fetchUserVotes } from './vote.js';

/**
 * Disable voting/recant buttons if voting is closed or upcoming.
 * Works for multiple buttons (vote/recant) or a single story page.
 * containerSelector: the HTML container to search buttons in
 */
export async function enforceVotingRules(containerSelector = '.story-cta') {
  // Fetch stories with vote counts & global voting status
  const stories = await fetchStoriesWithVotes();
  const userVotes = await fetchUserVotes();

  const container = document.querySelector(containerSelector);
  if (!container) return;

  container.querySelectorAll('.vote-btn, .recant-btn').forEach(btn => {
    const storyId = btn.dataset.storyId;
    const story = stories.find(s => String(s.id) === String(storyId));
    if (!story) return;

    // Voting is closed
    if (story.voting_status === 'closed') {
      btn.disabled = true;

      if (btn.classList.contains('vote-btn')) {
        btn.textContent = `Voting Closed (${btn.dataset.voteCount || 0})`;
      } else if (btn.classList.contains('recant-btn')) {
        btn.textContent = 'Cannot Recant - Voting Closed';
      }

    // Voting not started yet
    } else if (story.voting_status === 'upcoming') {
      btn.disabled = true;
      if (btn.classList.contains('vote-btn')) {
        btn.textContent = 'Voting Starts Soon';
      } else if (btn.classList.contains('recant-btn')) {
        btn.textContent = 'Cannot Recant - Voting Not Started';
      }

    // Voting is open
    } else if (story.voting_status === 'open') {
      if (btn.classList.contains('vote-btn')) {
        const hasVoted = userVotes.includes(String(storyId));
        btn.disabled = hasVoted;
        btn.textContent = hasVoted
          ? `Voted (${btn.dataset.voteCount || 0})`
          : `Vote (${btn.dataset.voteCount || 0})`;
      } else if (btn.classList.contains('recant-btn')) {
        const hasVoted = userVotes.includes(String(storyId));
        btn.disabled = !hasVoted;
        btn.textContent = hasVoted ? 'Recant Vote' : 'Recant Disabled';
      }
    }
  });
}