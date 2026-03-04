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
    // 1️⃣ Get the latest voting period with a winner
    const { data: period, error: periodError } = await supabase
      .from('voting_periods')
      .select('winner_id, end_time')
      .order('end_time', { ascending: false })
      .limit(1)
      .single();

    if (periodError) throw periodError;

    // 2️⃣ Determine if a winner exists
    if (!period?.winner_id) {
      winnerEmpty.style.display = 'block';
      winnerDetails.style.display = 'none';
      return;
    }

    // 3️⃣ Fetch winner story (columns that actually exist)
    const { data: winnerData, error: winnerError } = await supabase
      .from('stories')
      .select('id, title, image_url, created_at')
      .eq('id', period.winner_id)
      .single();

    if (winnerError) throw winnerError;

    if (!winnerData) {
      winnerEmpty.style.display = 'block';
      winnerDetails.style.display = 'none';
      return;
    }

    // 4️⃣ Populate DOM
    winnerEmpty.style.display = 'none';
    winnerDetails.style.display = 'block';

    winnerNameEl.textContent = winnerData.title;
    winnerStoryEl.textContent = 'Story details not available.'; // placeholder

    if (winnerImageEl && winnerData.image_url) {
      winnerImageEl.src = winnerData.image_url;
      winnerImageEl.alt = winnerData.title;
    } else if (winnerImageEl) {
      winnerImageEl.style.display = 'none'; // hide image if none
    }

    // Optional: link to story page if route exists
    if (winnerLinkEl) {
      winnerLinkEl.href = `/story/?id=${winnerData.id}`;
    }

    // Optional: show voting period end date
    const endDate = new Date(period.end_time);
    const endDateEl = document.getElementById('winner-end-date');
    if (endDateEl) {
      endDateEl.textContent = `Winner determined after voting ended on ${endDate.toLocaleString()}`;
    }

  } catch (err) {
    console.error('Error fetching winner:', err);
    winnerEmpty.style.display = 'block';
    winnerDetails.style.display = 'none';
  }
});