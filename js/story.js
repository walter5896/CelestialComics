// /js/story.js
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

/** Get URL query parameter */
export function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

/** Submit a vote for a story */
export async function submitVote(storyId) {
  const user = getCurrentUser();
  if (!user) {
    alert('You must be logged in to vote!');
    return false;
  }

  const { error } = await supabase
    .from('votes')
    .insert([{ story_id: storyId, user_id: user.id }]);

  if (error) {
    if (error.code === '23505') alert('You already voted!');
    else {
      console.error('Vote error:', error);
      alert('Error submitting vote.');
    }
    return false;
  }

  return true;
}

/** Save story to profile */
export async function saveStory(storyId) {
  const user = getCurrentUser();
  if (!user) {
    alert('You must be logged in to save stories!');
    return false;
  }

  const { data: existing, error: checkError } = await supabase
    .from('saved_stories')
    .select('id')
    .eq('story_id', storyId)
    .eq('user_id', user.id)
    .single();

  if (checkError && checkError.code !== 'PGRST116') {
    console.error('Check saved story error:', checkError);
    return false;
  }

  if (existing) {
    alert('Story already saved!');
    return false;
  }

  const { error } = await supabase
    .from('saved_stories')
    .insert([{ story_id: storyId, user_id: user.id }]);

  if (error) {
    console.error('Save story error:', error);
    alert('Failed to save story.');
    return false;
  }

  alert('Story saved!');
  return true;
}

/** Load and render a story */
export async function loadStory() {
  const storyId = getQueryParam('id');

  if (!storyId) {
    document.querySelector('.story-title').textContent = 'No story specified';
    return;
  }

  try {
    const { data: story, error } = await supabase
      .from('stories')
      .select('*')
      .eq('id', storyId)
      .single();

    if (error || !story) {
      console.error('Story fetch error:', error);
      document.querySelector('.story-title').textContent = 'Story not found';
      return;
    }

    // Inject into DOM
    document.querySelector('.story-title').textContent = story.title;
    document.querySelector('.story-meta').textContent = `By ${story.author} | Published ${story.published_at}`;
    const heroImg = document.querySelector('.story-hero-img');
    heroImg.src = story.image_url;
    heroImg.alt = story.title;
    document.querySelector('.story-content').innerHTML = story.content;

    // Setup vote button
    const voteBtn = document.querySelector('.story-cta .btn-primary');
    voteBtn.dataset.storyId = story.id;
    voteBtn.addEventListener('click', async () => {
      const success = await submitVote(story.id);
      if (success) {
        voteBtn.disabled = true;
        voteBtn.textContent = 'Voted';
      }
    });

    // Setup save button
    const saveBtn = document.querySelector('.story-cta .btn-secondary');
    saveBtn.dataset.storyId = story.id;
    saveBtn.addEventListener('click', async () => {
      const success = await saveStory(story.id);
      if (success) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saved';
      }
    });

  } catch (err) {
    console.error('Unexpected error loading story:', err);
    document.querySelector('.story-title').textContent = 'Error loading story';
  }
}
