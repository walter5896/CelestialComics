// /js/winner.js
import { supabase } from './supabase.js';

function getWinnerImage(story) {
  return story?.cover_image_url || story?.image_url || '';
}

function showEmptyState(winnerEmpty, winnerDetails) {
  if (winnerEmpty) winnerEmpty.style.display = 'block';
  if (winnerDetails) winnerDetails.style.display = 'none';
}

function getWinnerCta(story) {
  if (story.story_status === 'released') {
    return {
      href: `/comics/story.html?id=${story.id}`,
      text: 'Preview & Purchase Comic'
    };
  }

  return {
    href: `/gallery/story.html?id=${story.id}`,
    text: 'View Concept Details'
  };
}

function getWinnerMetaText(story) {
  const authorText = story.author ? `By ${story.author}` : 'Author not listed';

  if (story.story_status === 'released') {
    const releaseText = story.release_date
      ? `Released: ${new Date(story.release_date).toLocaleDateString()}`
      : 'Released comic';

    return `${authorText} • ${releaseText}`;
  }

  const productionText = story.production_stage_label
    ? `Production Stage: ${story.production_stage_label}`
    : 'Production Stage: In Production';

  return `${authorText} • ${productionText}`;
}

function getWinnerStatusLabel(story) {
  if (story.story_status === 'released') {
    return story.production_stage_label || 'Released';
  }

  return story.production_stage_label || 'Winner in Production';
}

function getWinnerDescription(story) {
  if (story.description) return story.description;

  if (story.story_status === 'released') {
    return 'This comic has been released and is now available to preview and purchase.';
  }

  return 'This winning concept is currently in production.';
}

function showWinnerState({
  winnerEmpty,
  winnerDetails,
  winnerNameEl,
  winnerStoryEl,
  winnerMetaEl,
  winnerImageEl,
  winnerLinkEl,
  winnerStatusLabelEl,
  winnerData
}) {
  if (winnerEmpty) winnerEmpty.style.display = 'none';
  if (winnerDetails) winnerDetails.style.display = 'block';

  if (winnerNameEl) {
    winnerNameEl.textContent = winnerData.title || 'Untitled Project';
  }

  if (winnerStoryEl) {
    winnerStoryEl.textContent = getWinnerDescription(winnerData);
  }

  if (winnerMetaEl) {
    winnerMetaEl.textContent = getWinnerMetaText(winnerData);
  }

  if (winnerStatusLabelEl) {
    winnerStatusLabelEl.textContent = getWinnerStatusLabel(winnerData);
  }

  if (winnerImageEl) {
    const imageUrl = getWinnerImage(winnerData);

    if (imageUrl) {
      winnerImageEl.src = imageUrl;
      winnerImageEl.alt = winnerData.title || 'Winning Project';
      winnerImageEl.style.display = 'block';
    } else {
      winnerImageEl.removeAttribute('src');
      winnerImageEl.alt = 'No winner image available';
      winnerImageEl.style.display = 'none';
    }
  }

  if (winnerLinkEl) {
    const cta = getWinnerCta(winnerData);
    winnerLinkEl.href = cta.href;
    winnerLinkEl.textContent = cta.text;
  }
}

async function fetchFeaturedWinnerProject() {
  const { data, error } = await supabase
    .from('stories')
    .select(`
      id,
      title,
      author,
      description,
      image_url,
      cover_image_url,
      story_status,
      production_stage_label,
      release_date,
      active
    `)
    .eq('active', true)
    .in('story_status', ['winner_in_production', 'released'])
    .order('release_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;

  const stories = data || [];

  const releasedStory = stories.find((story) => story.story_status === 'released');
  if (releasedStory) return releasedStory;

  const inProductionStory = stories.find(
    (story) => story.story_status === 'winner_in_production'
  );
  return inProductionStory || null;
}

async function initWinnerPage() {
  const winnerEmpty = document.getElementById('winner-empty');
  const winnerDetails = document.getElementById('winner-details');
  const winnerNameEl = document.getElementById('winner-name');
  const winnerStoryEl = document.getElementById('winner-story');
  const winnerMetaEl = document.getElementById('winner-meta');
  const winnerImageEl = document.getElementById('winner-image');
  const winnerLinkEl = document.getElementById('winner-link');
  const winnerStatusLabelEl = document.getElementById('winner-status-label');

  try {
    const winnerData = await fetchFeaturedWinnerProject();

    if (!winnerData) {
      showEmptyState(winnerEmpty, winnerDetails);
      return;
    }

    showWinnerState({
      winnerEmpty,
      winnerDetails,
      winnerNameEl,
      winnerStoryEl,
      winnerMetaEl,
      winnerImageEl,
      winnerLinkEl,
      winnerStatusLabelEl,
      winnerData
    });
  } catch (err) {
    console.error('Error fetching winner:', err);
    showEmptyState(winnerEmpty, winnerDetails);
  }
}

document.addEventListener('DOMContentLoaded', initWinnerPage);