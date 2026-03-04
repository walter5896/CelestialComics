// /js/voteHandler.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

/* =======================
   VOTING FUNCTIONS
======================= */

export async function submitVote(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) { alert('You must be logged in to vote!'); return false; }

  // Check global voting period
  const { data: periods, error: periodError } = await supabase
    .from('voting_periods')
    .select('start_time, end_time')
    .order('start_time', { ascending: false })
    .limit(1);
  if (periodError) { console.error(periodError); return false; }

  const now = new Date();
  if (periods && periods.length > 0) {
    const start = new Date(periods[0].start_time);
    const end = new Date(periods[0].end_time);
    if (now < start || now > end) {
      alert('Voting is currently closed.');
      return false;
    }
  } else {
    alert('No voting period set.');
    return false;
  }

  const { error } = await supabase
    .from('votes')
    .insert([{ story_id: storyId, user_id: user.id }]);

  if (error) {
    if (error.code === '23505') alert('You already voted!');
    else console.error(error);
    return false;
  }

  return true;
}

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

/* =======================
   BUTTON HELPERS
======================= */

export function updateVoteButtons(userVotes = [], stories = []) {
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

export function attachVoteListeners(containerId = 'story-grid') {
  document.querySelectorAll(`#${containerId} .vote-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
      const storyId = btn.dataset.storyId;
      const success = await submitVote(storyId);
      if (success) location.reload();
    });
  });
}

export function attachRecantListeners(containerId = 'story-grid') {
  document.querySelectorAll(`#${containerId} .recant-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
      const storyId = btn.dataset.storyId;
      const res = await recantVote(storyId);
      if (res.success) location.reload();
    });
  });
}

/* =======================
   INIT FUNCTION
======================= */

export async function initVoting(stories = [], containerId = 'story-grid') {
  const user = await getCurrentUserAsync();
  if (!user) return false; // not logged in

  // Fetch user's votes
  const { data, error } = await supabase
    .from('votes')
    .select('story_id')
    .eq('user_id', user.id);

  const userVotes = (error || !data) ? [] : data.map(v => String(v.story_id));

  // Update buttons
  updateVoteButtons(userVotes, stories);

  // Attach listeners
  attachVoteListeners(containerId);
  attachRecantListeners(containerId);

  return { stories, userVotes };
}