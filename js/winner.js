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
    // 1️⃣ Get the latest voting period
    const { data: period, error: periodError } = await supabase
      .from('voting_periods')
      .select('winner_id')
      .order('end_time', { ascending: false })
      .limit(1)
      .single();

    if (periodError) throw periodError;

    // 2️⃣ Check if a winner exists
    if (!period?.winner_id) {
      winnerEmpty.style.display = 'block';
      winnerDetails.style.display = 'none';
      return;
    }

    // 3️⃣ Fetch winner story (columns that actually exist)
    const { data: winnerData, error: winnerError } = await supabase
      .from('stories')
      .select('id, title, image_url')
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

    // Title
    winnerNameEl.textContent = winnerData.title || 'Winning Story';

    // Placeholder description (optional; you can add description later)
    winnerStoryEl.textContent = 'Story details not available.';

    // Image
    if (winnerImageEl && winnerData.image_url) {
      winnerImageEl.src = winnerData.image_url;
      winnerImageEl.alt = winnerData.title;
      winnerImageEl.style.display = 'block';
    } else if (winnerImageEl) {
      winnerImageEl.style.display = 'none';
    }

    // Link to story page
    if (winnerLinkEl) {
      winnerLinkEl.href = `/story.html?id=${winnerData.id}`;
      winnerLinkEl.textContent = 'Read Full Story';
    }

  } catch (err) {
    console.error('Error fetching winner:', err);
    winnerEmpty.style.display = 'block';
    winnerDetails.style.display = 'none';
  }
});