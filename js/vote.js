// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
  const votingOpen = document.getElementById('voting-open');
  const votingClosed = document.getElementById('voting-closed');
  if (!votingOpen || !votingClosed) return;

  // ---------- Functions ----------

  async function fetchStories() {
    const { data: stories, error } = await supabase
      .from('stories')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching stories:', error);
      return [];
    }
    return stories;
  }

  async function fetchUserVotes(userId) {
    if (!userId) return [];
    const { data: votes, error } = await supabase
      .from('votes')
      .select('story_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user votes:', error);
      return [];
    }
    return votes.map(v => v.story_id);
  }

  async function renderStories() {
    const user = getCurrentUser();
    const stories = await fetchStories();
    const votedStoryIds = await fetchUserVotes(user?.id);

    const storyGrid = votingOpen.querySelector('.story-grid');
    storyGrid.innerHTML = ''; // clear existing stories

    stories.forEach(story => {
      const card = document.createElement('article');
      card.className = 'story-card';
      card.innerHTML = `
        <img src="${story.image_url || '/assets/images/placeholder.jpg'}" alt="${story.title}" />
        <h3>${story.title}</h3>
        <button class="btn btn-primary vote-btn" data-story="${story.id}">Vote</button>
      `;
      storyGrid.appendChild(card);

      const btn = card.querySelector('.vote-btn');
      btn.disabled = !user || votedStoryIds.includes(story.id);

      btn.addEventListener('click', async () => {
        if (!user) {
          alert('You must be logged in to vote!');
          return;
        }

        const { data, error } = await supabase
          .from('votes')
          .insert([{ story_id: story.id, user_id: user.id }]);

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
  }

  function updateVotingUI() {
    const user = getCurrentUser();

    if (!user) {
      votingOpen.querySelectorAll('.vote-btn').forEach(btn => btn.disabled = true);
      if (!document.getElementById('login-prompt')) {
        const loginPrompt = document.createElement('p');
        loginPrompt.id = 'login-prompt';
        loginPrompt.textContent = 'Please log in to vote!';
        loginPrompt.style.color = 'red';
        votingOpen.prepend(loginPrompt);
      }
    } else {
      const prompt = document.getElementById('login-prompt');
      if (prompt) prompt.remove();
    }
  }

  function updateVotingState() {
    votingOpen.style.display = 'block';
    votingClosed.style.display = 'none';
  }

  // ---------- Initial Setup ----------
  updateVotingState();
  await renderStories();
  updateVotingUI();

  // ---------- Listen for auth changes ----------
  supabase.auth.onAuthStateChange(async () => {
    updateVotingUI();
    await renderStories();
  });
});
