// /js/winner.js
import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  const winnerEmpty = document.getElementById('winner-empty');
  const winnerDetails = document.getElementById('winner-details');
  const winnerNameEl = document.getElementById('winner-name');
  const winnerStoryEl = document.getElementById('winner-story');
  const winnerImageEl = document.getElementById('winner-image');
  const winnerLinkEl = document.getElementById('winner-link');

  try {
    const { data: period, error: periodError } = await supabase
      .from('voting_periods')
      .select('winner_id')
      .order('end_time', { ascending: false })
      .limit(1)
      .single();

    if (periodError) throw periodError;

    if (!period?.winner_id) {
      winnerEmpty.style.display = 'block';
      winnerDetails.style.display = 'none';
      return;
    }

    const { data: winnerData, error: winnerError } = await supabase
      .from('stories')
      .select('id, title, image_url')
      .eq('id', period.winner_id)
      .single();

    if (winnerError || !winnerData) {
      winnerEmpty.style.display = 'block';
      winnerDetails.style.display = 'none';
      return;
    }

    // Populate DOM
    winnerEmpty.style.display = 'none';
    winnerDetails.style.display = 'block';
    winnerNameEl.textContent = winnerData.title;
    winnerStoryEl.textContent = 'Read the full story below.';
    if (winnerImageEl && winnerData.image_url) {
      winnerImageEl.src = winnerData.image_url;
      winnerImageEl.alt = winnerData.title;
    }

    // Set correct story page link
    if (winnerLinkEl) {
      winnerLinkEl.href = `/story/?id=${winnerData.id}`;
      winnerLinkEl.textContent = 'Read Full Story';
    }

  } catch (err) {
    console.error('Error fetching winner:', err);
    winnerEmpty.style.display = 'block';
    winnerDetails.style.display = 'none';
  }
});