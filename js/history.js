// /js/history.js

// =========================
// IMPORTS
// =========================
import { supabase } from './supabase.js';


// =========================
// FETCH FINALIZED ROUNDS
// =========================
async function fetchFinalizedRounds() {

  const { data, error } = await supabase
    .from('voting_periods')
    .select(`
      id,
      winner_id,
      winning_vote_count,
      finalized_at
    `)
    .not('finalized_at', 'is', null)
    .order('finalized_at', { ascending: false });

  if (error) throw error;

  return data || [];
}


// =========================
// FETCH STORY
// =========================
async function fetchStory(storyId) {

  const { data, error } = await supabase
    .from('stories')
    .select(`
      id,
      title,
      author,
      cover_image_url,
      image_url
    `)
    .eq('id', storyId)
    .maybeSingle();

  if (error) throw error;

  return data;
}


// =========================
// CREATE CARD
// =========================
function createHistoryCard(period, story) {

  const card = document.createElement('div');
  card.className = 'story-card';

  const image = story.cover_image_url || story.image_url || '';

  const finalizedDate = new Date(period.finalized_at).toLocaleDateString();

  card.innerHTML = `
  
    <img src="${image}" alt="${story.title}" />

    <h3>${story.title}</h3>

    <p>
      ${story.author ? `By ${story.author}` : ''}
    </p>

    <p>
      Winning Votes: ${period.winning_vote_count}
    </p>

    <p>
      Finalized: ${finalizedDate}
    </p>

    <a class="btn btn-primary" href="/gallery/story.html?id=${story.id}">
      Read Story
    </a>

  `;

  return card;
}


// =========================
// LOAD HISTORY
// =========================
async function loadHistory() {

  const historyList = document.getElementById('history-list');
  const historyEmpty = document.getElementById('history-empty');

  try {

    const periods = await fetchFinalizedRounds();

    if (!periods.length) {
      historyEmpty.style.display = 'block';
      return;
    }

    for (const period of periods) {

      if (!period.winner_id) continue;

      const story = await fetchStory(period.winner_id);

      if (!story) continue;

      const card = createHistoryCard(period, story);

      historyList.appendChild(card);

    }

  } catch (err) {

    console.error('History load error:', err);

    historyEmpty.style.display = 'block';

  }

}


// =========================
// PAGE INIT
// =========================
document.addEventListener('DOMContentLoaded', loadHistory);