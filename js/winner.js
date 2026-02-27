// /js/winner.js
import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  const winnerEmpty = document.getElementById('winner-empty');
  const winnerDetails = document.getElementById('winner-details');
  const winnerNameEl = document.getElementById('winner-name');
  const winnerStoryEl = document.getElementById('winner-story');
  const winnerImageEl = document.getElementById('winner-image');

  try {
    // 1️⃣ Get the latest voting period with a winner
    const { data: period, error: periodError } = await supabase
      .from('voting_periods')
      .select('winner_id')
      .order('end_time', { ascending: false })
      .limit(1)
      .single();

    if (periodError) throw periodError;

    // 2️⃣ Determine if a winner exists
    if (!period?.winner_id) {
      // No winner yet
      winnerEmpty.style.display = 'block';
      winnerDetails.style.display = 'none';
      return;
    }

    // 3️⃣ Fetch winner story
    const { data: winnerData, error: winnerError } = await supabase
      .from('stories')
      .select('id, title, author, description, image_url, created_at')
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
    winnerStoryEl.textContent = winnerData.description || 'No description available.';
    if (winnerImageEl && winnerData.image_url) {
      winnerImageEl.src = winnerData.image_url;
      winnerImageEl.alt = winnerData.title;
    }

  } catch (err) {
    console.error('Error fetching winner:', err);
    // fallback: show empty winner
    winnerEmpty.style.display = 'block';
    winnerDetails.style.display = 'none';
  }
});