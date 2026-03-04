// /js/singleStoryRestrict.js
import { fetchUserVotes } from './vote.js';

/**
 * Restrict voting/recanting on a single story page based on story status.
 * story: the story object loaded on the page
 * voteBtn: the vote button element
 * recantBtn: optional recant button element
 */
export async function restrictSingleStoryVoting(story, voteBtn, recantBtn = null) {
  const userVotes = await fetchUserVotes();
  const storyId = String(story.id);

  if (story.voting_status === 'closed') {
    voteBtn.disabled = true;
    voteBtn.textContent = `Voting Closed (${voteBtn.dataset.voteCount || 0})`;

    if (recantBtn) {
      recantBtn.disabled = true;
      recantBtn.textContent = 'Cannot Recant - Voting Closed';
    }

  } else if (story.voting_status === 'upcoming') {
    voteBtn.disabled = true;
    voteBtn.textContent = 'Voting Starts Soon';

    if (recantBtn) {
      recantBtn.disabled = true;
      recantBtn.textContent = 'Cannot Recant - Voting Not Started';
    }

  } else if (story.voting_status === 'open') {
    const hasVoted = userVotes.includes(storyId);

    voteBtn.disabled = hasVoted;
    voteBtn.textContent = hasVoted
      ? `Voted (${voteBtn.dataset.voteCount || 0})`
      : `Vote (${voteBtn.dataset.voteCount || 0})`;

    if (recantBtn) {
      recantBtn.disabled = !hasVoted;
      recantBtn.textContent = hasVoted ? 'Recant Vote' : 'Recant Disabled';
    }
  }
}