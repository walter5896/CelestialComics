// /js/singleStoryRestrict.js
import { fetchUserVotes } from './vote.js';

function getPublicVoteCount(voteBtn) {
  const count = Number(voteBtn?.dataset?.voteCount);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function setVoteButtonState(voteBtn, { disabled, text, voted = false }) {
  if (!voteBtn) return;

  voteBtn.disabled = !!disabled;
  voteBtn.textContent = text || 'Voting Unavailable';
  voteBtn.classList.toggle('voted', !!voted);
  voteBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
}

/**
 * Restrict voting on a single story page based on story status.
 * story: the story object loaded on the page
 * voteBtn: the vote button element
 */
export async function restrictSingleStoryVoting(story, voteBtn) {
  if (!story || !voteBtn) return;

  const storyId = String(story.id || '');
  const publicVoteCount = getPublicVoteCount(voteBtn);

  if (!storyId) {
    setVoteButtonState(voteBtn, {
      disabled: true,
      text: 'Voting Unavailable'
    });
    return;
  }

  // If the story itself is not part of the active vote pool,
  // do not allow voting even if a stale voting_status value exists.
  if (story.story_status !== 'active_vote') {
    setVoteButtonState(voteBtn, {
      disabled: true,
      text: `Voting Unavailable (${publicVoteCount})`
    });
    return;
  }

  try {
    const userVotes = await fetchUserVotes();
    const existingVote = Array.isArray(userVotes)
      ? userVotes.find((v) => String(v.story_id) === storyId)
      : null;

    const userVoteCount = existingVote ? Number(existingVote.vote_count) || 0 : 0;
    const isVoted = userVoteCount > 0;

    switch (story.voting_status) {
      case 'closed':
        setVoteButtonState(voteBtn, {
          disabled: true,
          text: `Voting Closed (${publicVoteCount})`,
          voted: false
        });
        break;

      case 'upcoming':
        setVoteButtonState(voteBtn, {
          disabled: true,
          text: 'Voting Starts Soon',
          voted: false
        });
        break;

      case 'open':
        setVoteButtonState(voteBtn, {
          disabled: false,
          text: isVoted
            ? `Add Vote (${publicVoteCount})`
            : `Vote (${publicVoteCount})`,
          voted: isVoted
        });
        break;

      default:
        setVoteButtonState(voteBtn, {
          disabled: true,
          text: 'Voting Unavailable',
          voted: false
        });
    }
  } catch (error) {
    console.error('Error restricting single story voting:', error);

    setVoteButtonState(voteBtn, {
      disabled: true,
      text: 'Voting Unavailable',
      voted: false
    });
  }
}