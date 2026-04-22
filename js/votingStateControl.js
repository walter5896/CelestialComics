// /js/votingStateControl.js
import { fetchStoriesWithVotes, fetchUserVotes } from './vote.js';

function getPublicVoteCount(btn) {
  const count = Number(btn?.dataset?.voteCount);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function setButtonState(btn, { disabled, text, voted = false }) {
  if (!btn) return;

  btn.disabled = !!disabled;
  btn.textContent = text || 'Voting Unavailable';
  btn.classList.toggle('voted', !!voted);
  btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
}

/**
 * Disable voting/recant buttons based on voting status
 * containerId: the HTML container where your story cards are
 */
export async function enforceVotingRules(containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const [stories, userVotes] = await Promise.all([
      fetchStoriesWithVotes(),
      fetchUserVotes()
    ]);

    const safeStories = Array.isArray(stories) ? stories : [];
    const safeUserVotes = Array.isArray(userVotes) ? userVotes : [];

    const storyMap = new Map(
      safeStories.map((story) => [String(story.id), story])
    );

    const userVoteMap = new Map(
      safeUserVotes.map((vote) => [String(vote.story_id), Number(vote.vote_count) || 0])
    );

    container.querySelectorAll('.vote-btn, .recant-btn').forEach((btn) => {
      const storyId = String(btn.dataset.storyId || '');
      const story = storyMap.get(storyId);

      if (!story) {
        setButtonState(btn, {
          disabled: true,
          text: 'Voting Unavailable',
          voted: false
        });
        return;
      }

      const publicVoteCount = getPublicVoteCount(btn);
      const userVoteCountForStory = userVoteMap.get(storyId) || 0;
      const isVoteButton = btn.classList.contains('vote-btn');
      const isRecantButton = btn.classList.contains('recant-btn');

      if (story.voting_status === 'closed') {
        if (isVoteButton) {
          setButtonState(btn, {
            disabled: true,
            text: `Voting Closed (${publicVoteCount})`,
            voted: false
          });
        } else if (isRecantButton) {
          setButtonState(btn, {
            disabled: true,
            text: 'Cannot Recant - Voting Closed',
            voted: false
          });
        }
        return;
      }

      if (story.voting_status === 'upcoming') {
        if (isVoteButton) {
          setButtonState(btn, {
            disabled: true,
            text: 'Voting Starts Soon',
            voted: false
          });
        } else if (isRecantButton) {
          setButtonState(btn, {
            disabled: true,
            text: 'Cannot Recant - Voting Not Started',
            voted: false
          });
        }
        return;
      }

      if (story.voting_status === 'open') {
        if (isVoteButton) {
          setButtonState(btn, {
            disabled: false,
            text: userVoteCountForStory > 0
              ? `Add Vote (${publicVoteCount})`
              : `Vote (${publicVoteCount})`,
            voted: userVoteCountForStory > 0
          });
        } else if (isRecantButton) {
          setButtonState(btn, {
            disabled: userVoteCountForStory <= 0,
            text: userVoteCountForStory > 0
              ? `Recant Vote (${userVoteCountForStory})`
              : 'No Votes to Recant',
            voted: false
          });
        }
        return;
      }

      setButtonState(btn, {
        disabled: true,
        text: 'Voting Unavailable',
        voted: false
      });
    });
  } catch (error) {
    console.error('Error enforcing voting rules:', error);

    container.querySelectorAll('.vote-btn, .recant-btn').forEach((btn) => {
      setButtonState(btn, {
        disabled: true,
        text: 'Voting Unavailable',
        voted: false
      });
    });
  }
}