// /js/vote.js
import { supabase } from './supabase.js';
import { getCurrentUserAsync } from './auth.js';

/* ------------------- STORIES + VOTES ------------------- */
export async function fetchStoriesWithVotes() {
  try {
    const { data: stories, error: storiesError } = await supabase
      .from('stories')
      .select('id, title, image_url');

    if (storiesError) throw storiesError;

    const storyIds = stories.map(s => s.id);

    // Vote counts
    const { data: votesData, error: votesError } = await supabase
      .from('votes')
      .select('story_id')
      .in('story_id', storyIds);

    if (votesError) throw votesError;

    const voteCounts = votesData.reduce((acc, v) => {
      acc[String(v.story_id)] = (acc[String(v.story_id)] || 0) + 1;
      return acc;
    }, {});

    // Voting status
    const { data: votingDataRaw, error: votingError } = await supabase
      .from('voting_status')
      .select('story_id, status')
      .in('story_id', storyIds);

    if (votingError) throw votingError;

    const votingMap = {};
    votingDataRaw.forEach(v => votingMap[String(v.story_id)] = v.status);

    // Merge
    return stories.map(story => ({
      ...story,
      vote_count: voteCounts[String(story.id)] || 0,
      voting_status: votingMap[String(story.id)] || 'upcoming'
    }));

  } catch (err) {
    console.error('Error fetching stories with votes:', err);
    return [];
  }
}

/* ------------------- USER VOTES ------------------- */
export async function fetchUserVotes() {
  const user = await getCurrentUserAsync();
  if (!user) return [];
  const { data, error } = await supabase
    .from('votes')
    .select('story_id')
    .eq('user_id', user.id);

  if (error) { console.error('Error fetching user votes:', error); return []; }
  return data.map(v => String(v.story_id));
}

export async function submitVote(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) { alert('You must be logged in to vote!'); return false; }

  const { error } = await supabase
    .from('votes')
    .insert([{ story_id: storyId, user_id: user.id }]);

  if (error) {
    if (error.code === '23505') alert('You already voted!');
    else console.error('Vote error:', error);
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

/* ------------------- SAVED STORIES ------------------- */
export async function saveStory(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false, error: 'Not authenticated' };
  const { error } = await supabase
    .from('saved_stories')
    .insert({ user_id: user.id, story_id: storyId });

  if (error) {
    if (error.code === '23505') return { success: true }; // already saved
    console.error('Save story error:', error);
    return { success: false, error };
  }
  return { success: true };
}

export async function unsaveStory(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false, error: 'Not authenticated' };
  const { error } = await supabase
    .from('saved_stories')
    .delete()
    .eq('user_id', user.id)
    .eq('story_id', storyId);

  if (error) { console.error('Unsave story error:', error); return { success: false, error }; }
  return { success: true };
}

export async function isStorySaved(storyId) {
  const user = await getCurrentUserAsync();
  if (!user) return false;

  const { data, error } = await supabase
    .from('saved_stories')
    .select('id')
    .eq('user_id', user.id)
    .eq('story_id', storyId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return false; // no row found
    console.error('Error checking saved story:', error);
    return false;
  }

  return !!data;
}

export async function fetchSavedStories() {
  const user = await getCurrentUserAsync();
  if (!user) return { success: false, data: [] };

  const { data, error } = await supabase
    .from('saved_stories')
    .select('story_id, stories(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) { console.error('Fetch saved stories error:', error); return { success: false, data: [] }; }
  return { success: true, data: data.map(item => item.stories) };
}

/* ------------------- RENDER ------------------- */
export function renderStories(stories, containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  stories.forEach(story => {
    const card = document.createElement('article');
    card.className = 'story-card';

    const saveText = story.isSaved ? 'Saved' : 'Save Story';

    card.innerHTML = `
      <img src="${story.image_url}" alt="${story.title}" />
      <h3>${story.title}</h3>
      <div class="story-actions">
        <button class="btn btn-primary vote-btn" data-story-id="${story.id}" data-vote-count="${story.vote_count || 0}">
          Vote (${story.vote_count || 0})
        </button>
        <a href="/gallery/story.html?id=${story.id}" class="btn btn-link">Read More</a>
        <button class="btn btn-secondary save-btn" data-story-id="${story.id}">${saveText}</button>
      </div>
    `;

    container.appendChild(card);
  });
}

export function updateVoteButtons(userVotes, stories) {
  if (!stories || !Array.isArray(stories)) return;

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

/* ------------------- UNIVERSAL SAVE/UNSAVE ------------------- */
export async function initSaveButtons(containerId = 'story-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const user = await getCurrentUserAsync();
  if (!user) return;

  const buttons = container.querySelectorAll('.save-btn');

  for (const btn of buttons) {
    const storyId = btn.dataset.storyId;
    const saved = await isStorySaved(storyId);
    btn.textContent = saved ? 'Saved' : 'Save Story';

    btn.addEventListener('click', async () => {
      if (btn.textContent === 'Saved') {
        await unsaveStory(storyId);
        btn.textContent = 'Save Story';
      } else {
        await saveStory(storyId);
        btn.textContent = 'Saved';
      }
    });
  }
}