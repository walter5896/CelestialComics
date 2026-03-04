// /js/singleStoryRestrict.js
import { fetchUserVotes } from './vote.js';

/**
 * Restrict voting on a single story page based on story status.
 * story: the story object loaded on the page
 * voteBtn: the vote button element
 */
export async function restrictSingleStoryVoting(story, voteBtn) {
  if (!story || !voteBtn) return;

  const userVotes = await fetchUserVotes();
  const storyId = String(story.id);
  const hasVoted = userVotes.includes(storyId);

  switch (story.voting_status) {
    case 'closed':
      voteBtn.disabled = true;
      voteBtn.textContent = `Voting Closed (${voteBtn.dataset.voteCount || 0})`;
      break;
    case 'upcoming':
      voteBtn.disabled = true;
      voteBtn.textContent = 'Voting Starts Soon';
      break;
    case 'open':
      voteBtn.disabled = hasVoted;
      voteBtn.textContent = hasVoted
        ? `Voted (${voteBtn.dataset.voteCount || 0})`
        : `Vote (${voteBtn.dataset.voteCount || 0})`;
      break;
    default:
      voteBtn.disabled = true;
      voteBtn.textContent = 'Voting Unavailable';
  }
}