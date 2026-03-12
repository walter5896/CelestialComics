// /js/winner.js

// =========================
// IMPORTS
// =========================
// Import the shared Supabase client for reading winner and story data.
import { supabase } from './supabase.js';

// =========================
// IMAGE RESOLVER
// =========================
// Returns the best available image for the winning story.
function getWinnerImage(story) {
  return story?.cover_image_url || story?.image_url || '';
}

// =========================
// EMPTY STATE RENDERER
// =========================
// Shows the "no winner yet" state and hides the winner card.
function showEmptyState(winnerEmpty, winnerDetails) {
  if (winnerEmpty) winnerEmpty.style.display = 'block';
  if (winnerDetails) winnerDetails.style.display = 'none';
}

// =========================
// WINNER STATE RENDERER
// =========================
// Shows the winner card and fills in all winner details.
function showWinnerState({
  winnerEmpty,
  winnerDetails,
  winnerNameEl,
  winnerStoryEl,
  winnerMetaEl,
  winnerImageEl,
  winnerLinkEl,
  winnerData,
  winnerPeriod
}) {
  if (winnerEmpty) winnerEmpty.style.display = 'none';
  if (winnerDetails) winnerDetails.style.display = 'block';

  if (winnerNameEl) {
    winnerNameEl.textContent = winnerData.title || 'Untitled Story';
  }

  if (winnerStoryEl) {
    winnerStoryEl.textContent = winnerData.description || 'Read the full winning story below.';
  }

  if (winnerMetaEl) {
    const authorText = winnerData.author ? `By ${winnerData.author}` : 'Author not listed';
    const votesText = winnerPeriod?.winning_vote_count != null
      ? `Winning Votes: ${winnerPeriod.winning_vote_count}`
      : 'Winning vote count unavailable';

    winnerMetaEl.textContent = `${authorText} • ${votesText}`;
  }

  if (winnerImageEl) {
    const imageUrl = getWinnerImage(winnerData);

    if (imageUrl) {
      winnerImageEl.src = imageUrl;
      winnerImageEl.alt = winnerData.title || 'Winning Story';
      winnerImageEl.style.display = 'block';
    } else {
      winnerImageEl.removeAttribute('src');
      winnerImageEl.alt = 'No winner image available';
      winnerImageEl.style.display = 'none';
    }
  }

  if (winnerLinkEl) {
    winnerLinkEl.href = `/gallery/story.html?id=${winnerData.id}`;
    winnerLinkEl.textContent = 'Read Full Story';
  }
}

// =========================
// LATEST FINALIZED ROUND FETCHER
// =========================
// Fetches the most recently finalized round only.
// This prevents older winners from being shown accidentally.
async function fetchLatestFinalizedWinnerPeriod() {
  const { data, error } = await supabase
    .from('voting_periods')
    .select(`
      id,
      winner_id,
      winning_vote_count,
      finalized_at,
      start_time,
      end_time
    `)
    .not('finalized_at', 'is', null)
    .order('finalized_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// =========================
// WINNING STORY FETCHER
// =========================
// Loads the story record for the finalized winner.
async function fetchWinningStory(winnerId) {
  const { data, error } = await supabase
    .from('stories')
    .select(`
      id,
      title,
      author,
      description,
      image_url,
      cover_image_url
    `)
    .eq('id', winnerId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// =========================
// WINNER PAGE INITIALIZER
// =========================
// Loads the latest finalized winner and renders the winner page.
async function initWinnerPage() {
  const winnerEmpty = document.getElementById('winner-empty');
  const winnerDetails = document.getElementById('winner-details');
  const winnerNameEl = document.getElementById('winner-name');
  const winnerStoryEl = document.getElementById('winner-story');
  const winnerMetaEl = document.getElementById('winner-meta');
  const winnerImageEl = document.getElementById('winner-image');
  const winnerLinkEl = document.getElementById('winner-link');

  try {
    // =========================
    // FETCH LATEST FINALIZED ROUND
    // =========================
    const winnerPeriod = await fetchLatestFinalizedWinnerPeriod();

    if (!winnerPeriod?.winner_id) {
      showEmptyState(winnerEmpty, winnerDetails);
      return;
    }

    // =========================
    // FETCH WINNING STORY
    // =========================
    const winnerData = await fetchWinningStory(winnerPeriod.winner_id);

    if (!winnerData) {
      showEmptyState(winnerEmpty, winnerDetails);
      return;
    }

    // =========================
    // RENDER WINNER
    // =========================
    showWinnerState({
      winnerEmpty,
      winnerDetails,
      winnerNameEl,
      winnerStoryEl,
      winnerMetaEl,
      winnerImageEl,
      winnerLinkEl,
      winnerData,
      winnerPeriod
    });
  } catch (err) {
    console.error('Error fetching winner:', err);
    showEmptyState(winnerEmpty, winnerDetails);
  }
}

// =========================
// DOM READY BOOTSTRAP
// =========================
// Starts winner-page loading once the DOM is ready.
document.addEventListener('DOMContentLoaded', initWinnerPage);