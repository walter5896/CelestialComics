// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

document.addEventListener('DOMContentLoaded', () => {
  const votingOpen = document.getElementById('voting-open');
  const votingClosed = document.getElementById('voting-closed');
  if (!votingOpen || !votingClosed) return;

  const voteButtons = votingOpen.querySelectorAll('.vote-btn');

  // ---------- Functions ----------

  // Force voting to be open for testing
  function updateVotingState() {
    votingOpen.style.display = 'block';
    votingClosed.style.display = 'none';
    voteButtons.forEach(btn => btn.disabled = !getCurrentUser());
  }

  // Enable/disable buttons and show login prompt if not logged in
  function updateVotingUI() {
    const user = getCurrentUser();

    if (!user) {
      voteButtons.forEach(btn => btn.disabled = true);
      if (!document.getElementById('login-prompt')) {
        const loginPrompt = document.createElement('p');
        loginPrompt.id = 'login-prompt';
        loginPrompt.textContent = 'Please log in to vote!';
        loginPrompt.style.color = 'red';
        votingOpen.prepend(loginPrompt);
      }
    } else {
      voteButtons.forEach(btn => btn.disabled = false);
      const prompt = document.getElementById('login-prompt');
      if (prompt) prompt.remove();
    }
  }

  // ---------- Initial Setup ----------
  updateVotingState();
  updateVotingUI();

  // ---------- Vote Button Handlers ----------
  voteButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const user = getCurrentUser();
      if (!user) {
        alert('You must be logged in to vote!');
        return;
      }

      const storyId = btn.dataset.story;

      const { data, error } = await supabase
        .from('votes')
        .insert([{ story_id: storyId, user_id: user.id }]);

      if (error) {
        if (error.code === '23505') alert('You already voted!');
        else {
          console.error('Vote error:', error);
          alert('Error submitting vote. Try again.');
        }
      } else {
        alert('Vote submitted! Thank you.');
        btn.disabled = true;
      }
    });
  });

  // ---------- Listen for auth changes ----------
  supabase.auth.onAuthStateChange(() => {
    updateVotingUI();
  });
});
