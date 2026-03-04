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
    // 1️⃣ Get latest voting period
    const { data: period, error: periodError } = await supabase
      .from('voting_periods')
      .select('winner_id')
      .order('end_time', { ascending: false })
      .limit(1)
      .single();

    if (periodError) throw periodError;

    if (!period?.winner_id) {
      // No winner yet
      winnerEmpty.style.display = 'block';
      winnerDetails.style.display = 'none';
      return;
    }

    // 2️⃣ Fetch winner story
    const { data: winnerData, error: winnerError } = await supabase
      .from('stories')
      .select('id, title, image_url') // Only fetch what we need
      .eq('id', period.winner_id)
      .single();

    if (winnerError || !winnerData) {
      winnerEmpty.style.display = 'block';
      winnerDetails.style.display = 'none';
      return;
    }

    // 3️⃣ Populate DOM
    winnerEmpty.style.display = 'none';
    winnerDetails.style.display = 'block';
    winnerNameEl.textContent = winnerData.title;
    winnerStoryEl.textContent = 'Read the full story below.';
    
    if (winnerImageEl && winnerData.image_url) {
      winnerImageEl.src = winnerData.image_url;
      winnerImageEl.alt = winnerData.title;
    }

    // 4️⃣ Correct link to story page
    if (winnerLinkEl) {
      // Since winner page is in /winner/ and story.html is in /gallery/
      winnerLinkEl.href = `../gallery/story.html?id=${winnerData.id}`;
      winnerLinkEl.textContent = 'Read Full Story';
    }

  } catch (err) {
    console.error('Error fetching winner:', err);
    winnerEmpty.style.display = 'block';
    winnerDetails.style.display = 'none';
  }
});