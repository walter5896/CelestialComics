// /js/winner.js
import { supabase } from './supabase.js';

function getWinnerImage(story) {
  return story?.cover_image_url || story?.image_url || '';
}

function showEmptyState(winnerEmpty, winnerDetails) {
  if (winnerEmpty) winnerEmpty.style.display = 'block';
  if (winnerDetails) winnerDetails.style.display = 'none';
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
    winnerNameEl.textContent = winnerData.title || 'Untitled Concept';
  }

  if (winnerStoryEl) {
    winnerStoryEl.textContent =
      winnerData.description || 'No concept description available yet.';
  }

  if (winnerMetaEl) {
    const authorText = winnerData.author ? `By ${winnerData.author}` : 'Author not listed';
    const productionText = winnerData.production_stage_label
      ? `Production Stage: ${winnerData.production_stage_label}`
      : 'Production Stage: In Production';

    winnerMetaEl.textContent = `${authorText} • ${productionText}`;
  }

  if (winnerStatusLabelEl) {
    winnerStatusLabelEl.textContent =
      winnerData.production_stage_label || 'Winner in Production';
  }

  if (winnerImageEl) {
    const imageUrl = getWinnerImage(winnerData);

    if (imageUrl) {
      winnerImageEl.src = imageUrl;
      winnerImageEl.alt = winnerData.title || 'Winning Concept';
      winnerImageEl.style.display = 'block';
    } else {
      winnerImageEl.removeAttribute('src');
      winnerImageEl.alt = 'No winner image available';
      winnerImageEl.style.display = 'none';
    }
  }

  if (winnerLinkEl) {
    winnerLinkEl.href = `/gallery/story.html?id=${winnerData.id}`;
    winnerLinkEl.textContent = 'View Concept Details';
  }
}

async function fetchCurrentWinnerInProduction() {
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
      production_stage_label
    `)
    .eq('active', true)
    .eq('story_status', 'winner_in_production')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
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
    const winnerData = await fetchCurrentWinnerInProduction();

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