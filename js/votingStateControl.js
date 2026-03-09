// /js/votingStateControl.js
import { fetchStoriesWithVotes, fetchUserVotes } from './vote.js';

/**
 * Disable voting/recant buttons based on voting status
 * containerId: the HTML container where your story cards are
 */
export async function enforceVotingRules(containerId = 'story-grid') {
  const stories = await fetchStoriesWithVotes();
  const userVotes = await fetchUserVotes();

  const userVoteMap = new Map(
    userVotes.map(v => [String(v.story_id), Number(v.vote_count) || 0])
  );

  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll('.vote-btn, .recant-btn').forEach(btn => {
    const storyId = String(btn.dataset.storyId);
    const story = stories.find(s => String(s.id) === storyId);
    if (!story) return;

    const userVoteCountForStory = userVoteMap.get(storyId) || 0;

    if (story.voting_status === 'closed') {
      btn.disabled = true;

      if (btn.classList.contains('vote-btn')) {
        btn.textContent = `Voting Closed (${btn.dataset.voteCount || 0})`;
      } else if (btn.classList.contains('recant-btn')) {
        btn.textContent = 'Cannot Recant - Voting Closed';
      }
    } else if (story.voting_status === 'upcoming') {
      btn.disabled = true;

      if (btn.classList.contains('vote-btn')) {
        btn.textContent = 'Voting Starts Soon';
      } else if (btn.classList.contains('recant-btn')) {
        btn.textContent = 'Cannot Recant - Voting Not Started';
      }
    } else if (story.voting_status === 'open') {
      if (btn.classList.contains('vote-btn')) {
        btn.disabled = false;
        btn.textContent = userVoteCountForStory > 0
          ? `Add Vote (${btn.dataset.voteCount || 0})`
          : `Vote (${btn.dataset.voteCount || 0})`;
      } else if (btn.classList.contains('recant-btn')) {
        btn.disabled = userVoteCountForStory <= 0;
        btn.textContent = userVoteCountForStory > 0
          ? `Recant Vote (${userVoteCountForStory})`
          : 'No Votes to Recant';
      }
    }
  });
}