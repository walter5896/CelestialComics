// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const votingOpen = document.getElementById('voting-open');
  const votingClosed = document.getElementById('voting-closed');
  const storyGrid = document.getElementById('story-grid');
  const loginPrompt = document.getElementById('login-prompt');

  if (!votingOpen || !votingClosed || !storyGrid) return;

  // ---- Load Voting State ----
  // TODO: Replace with real voting state from Supabase
  const votingIsOpen = true;

  // ---- Update UI Based on Voting State ----
  if (votingIsOpen) {
    votingOpen.style.display = 'block';
    votingClosed.style.display = 'none';
  } else {
    votingOpen.style.display = 'none';
    votingClosed.style.display = 'block';
    return;
  }

  // ---- Load stories dynamically from Supabase ----
  const { data: stories, error: storyError } = await supabase
    .from('stories')
    .select('*')
    .order('created_at', { ascending: true });

  if (storyError) {
    console.error('Error loading stories:', storyError);
    storyGrid.innerHTML = '<p class="error">Failed to load stories. Try again later.</p>';
    return;
  }

  // ---- Render story cards ----
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

  // ---- Update voting UI (login prompt + button state) ----
  function updateVotingUI() {
    const user = getCurrentUser();

    const voteButtons = document.querySelectorAll('.vote-btn');

    if (!user) {
      voteButtons.forEach(btn => btn.disabled = true);
      if (loginPrompt) loginPrompt.style.display = 'block';
    } else {
      voteButtons.forEach(btn => btn.disabled = false);
      if (loginPrompt) loginPrompt.style.display = 'none';
    }
  }

  updateVotingUI();

  // ---- Attach vote handlers ----
  document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const user = getCurrentUser();
      if (!user) {
        alert('You must be logged in to vote!');
        return;
      }

      const storyId = btn.dataset.storyId;

      if (!storyId) {
        alert('Missing story ID!');
        return;
      }

      const { error } = await supabase
        .from('votes')
        .insert([{ story_id: storyId, user_id: user.id }]);

      if (error) {
        if (error.code === '23505') {
          alert('You already voted for this story!');
        } else {
          console.error('Vote error:', error);
          alert('Error submitting vote. Try again.');
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
