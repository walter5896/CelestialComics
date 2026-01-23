// /js/winner.js
import { supabase } from './supabase.js'; // Make sure supabase.js exports your client

document.addEventListener('DOMContentLoaded', async () => {
  const winnerEmpty = document.getElementById('winner-empty');
  const winnerDetails = document.getElementById('winner-details');
  const winnerNameEl = document.getElementById('winner-name');
  const winnerStoryEl = document.getElementById('winner-story');

  // 1️⃣ Get voting status from Supabase
  const { data: settings, error: settingsError } = await supabase
    .from('settings') // or whatever table you track global voting status
    .select('voting_open')
    .single();

  if (settingsError) {
    console.error('Error fetching voting status:', settingsError);
    // fallback: assume voting is closed
  }

  const isVotingOpen = settings?.voting_open ?? false;

  // 2️⃣ Show the correct page state
  if (isVotingOpen) {
    winnerEmpty.style.display = 'block';
    winnerDetails.style.display = 'none';
  } else {
    winnerEmpty.style.display = 'none';
    winnerDetails.style.display = 'block';

    // 3️⃣ Fetch winner info
    const { data: winnerData, error: winnerError } = await supabase
      .from('stories') // replace with your stories table
      .select('id, title, author, description, image_url')
      .order('votes', { ascending: false }) // assuming you track votes
      .limit(1)
      .single();

    if (winnerError) {
      console.error('Error fetching winner:', winnerError);
      return;
    }

    // 4️⃣ Populate winner details
    if (winnerData) {
      winnerNameEl.textContent = winnerData.title;
      winnerStoryEl.textContent = winnerData.description;

      // Optional: update an image if you have one
      const winnerImageEl = document.getElementById('winner-image');
      if (winnerImageEl && winnerData.image_url) {
        winnerImageEl.src = winnerData.image_url;
        winnerImageEl.alt = winnerData.title;
      }
    }
  }
});
