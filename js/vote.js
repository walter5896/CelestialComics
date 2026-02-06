// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const votingOpen = document.getElementById('voting-open');
  const votingClosed = document.getElementById('voting-closed');
  const storyGrid = document.getElementById('story-grid');

  if (!votingOpen || !votingClosed || !storyGrid) return;

  // ---- Force voting open (for now) ----
  votingOpen.style.display = 'block';
  votingClosed.style.display = 'none';

  // ---- Load stories from Supabase ----
  const { data: stories, error } = await supabase
    .from('stories')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    console.error('Failed to load stories:', error);
    storyGrid.innerHTML = '<p class="error">Failed to load stories.</p>';
    return;
  }

  // ---- Render stories ----
  storyGrid.innerHTML = '';
  stories.forEach(story => {
    const card = document.createElement('article');
    card.className = 'story-card';
    card.innerHTML = `
      <img src="${story.image_url}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <button class="btn btn-primary vote-btn" data-story-id="${story.id}">
        Vote
      </button>
    `;
    storyGrid.appendChild(card);
  });

  // ---- Login prompt UI ----
  const loginPrompt = document.getElementById('login-prompt');

  function updateVotingUI() {
    const user = getCurrentUser();
    const voteButtons = document.querySelectorAll('.vote-btn');

    if (!user) {
      voteButtons.forEach(btn => (btn.disabled = true));
      if (loginPrompt) loginPrompt.style.display = 'block';
    } else {
      voteButtons.forEach(btn => (btn.disabled = false));
      if (loginPrompt) loginPrompt.style.display = 'none';
    }
  }

  updateVotingUI();

  // ---- Vote handler ----
  document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const user = getCurrentUser();
      if (!user) {
        alert('You must be logged in to vote!');
        return;
      }

      const storyId = btn.dataset.storyId;

      const { error } = await supabase
        .from('votes')
        .insert([{ story_id: storyId, user_id: user.id }]);

      if (error) {
        if (error.code === '23505') {
          alert('You already voted!');
        } else {
          console.error('Vote error:', error);
          alert('Error submitting vote.');
        }
      } else {
        alert('Vote submitted! Thank you.');
        btn.disabled = true;
      }
    });
  });

  // ---- Listen for auth changes ----
  supabase.auth.onAuthStateChange(() => {
    updateVotingUI();
  });
});
