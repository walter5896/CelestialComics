import { supabase } from './supabase.js';

/* =========================
   DATE FORMATTER
========================= */
function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString();
}

/* =========================
   ROUND STATUS DERIVER
========================= */
function deriveRoundStatus(period) {
  if (!period) return 'none';
  if (period.finalized_at) return 'finalized';
  if (period.closed_at) return 'closed';

  const now = new Date();
  const start = new Date(period.start_time);
  const end = new Date(period.end_time);

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'open';
  return 'closed';
}

/* =========================
   STATUS PILL RENDERER
========================= */
function getStatusPill(status) {
  return `<span class="status-pill ${status}">${status}</span>`;
}

/* =========================
   CURRENT ROUND FETCHER
========================= */
async function fetchCurrentRound() {
  const { data, error } = await supabase
    .from('voting_periods')
    .select(`
      id,
      start_time,
      end_time,
      closed_at,
      finalized_at,
      winner_id,
      winning_vote_count
    `)
    .is('finalized_at', null)
    .order('id', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

/* =========================
   PAST FINALIZED ROUNDS FETCHER
========================= */
async function fetchPastFinalizedRounds() {
  const { data, error } = await supabase
    .from('voting_periods')
    .select(`
      id,
      start_time,
      end_time,
      closed_at,
      finalized_at,
      winner_id,
      winning_vote_count
    `)
    .not('finalized_at', 'is', null)
    .order('finalized_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/* =========================
   STORIES MAP FETCHER
========================= */
async function fetchStoriesMap() {
  const { data, error } = await supabase
    .from('stories')
    .select(`
      id,
      title,
      author,
      cover_image_url,
      image_url,
      active,
      story_status
    `);

  if (error) throw error;

  const map = new Map();
  (data || []).forEach((story) => {
    map.set(String(story.id), story);
  });

  return map;
}

/* =========================
   ROUND VOTES FETCHER
========================= */
async function fetchVotesForRound(roundId) {
  if (!roundId) return [];

  const { data, error } = await supabase
    .from('votes')
    .select('story_id, vote_count')
    .eq('voting_period_id', roundId);

  if (error) throw error;
  return data || [];
}

/* =========================
   CURRENT ROUND SUMMARY RENDERER
========================= */
function renderCurrentRoundSummary(round) {
  const container = document.getElementById('current-round-summary');
  if (!container) return;

  if (!round) {
    container.innerHTML = `<p class="history-empty">No active or pending concept tournament exists right now.</p>`;
    return;
  }

  const status = deriveRoundStatus(round);

  container.innerHTML = `
    ${getStatusPill(status)}
    <p><strong>Tournament ID:</strong> ${round.id}</p>
    <p><strong>Start:</strong> ${formatDateTime(round.start_time)}</p>
    <p><strong>End:</strong> ${formatDateTime(round.end_time)}</p>
    <p><strong>Closed At:</strong> ${formatDateTime(round.closed_at)}</p>
  `;
}

/* =========================
   STANDINGS RENDERER
========================= */
function renderCurrentStandings(round, storiesMap, votes) {
  const container = document.getElementById('current-standings-list');
  if (!container) return;

  if (!round) {
    container.innerHTML = `<p class="history-empty">No current standings to display.</p>`;
    return;
  }

  const totals = new Map();

  votes.forEach((vote) => {
    const storyId = String(vote.story_id);
    const count = Number(vote.vote_count) || 0;
    totals.set(storyId, (totals.get(storyId) || 0) + count);
  });

  const standings = Array.from(storiesMap.values())
    .filter((story) => story.active && story.story_status === 'active_vote')
    .map((story) => ({
      ...story,
      totalVotes: totals.get(String(story.id)) || 0
    }))
    .sort((a, b) => b.totalVotes - a.totalVotes || a.title.localeCompare(b.title));

  if (!standings.length) {
    container.innerHTML = `<p class="history-empty">No active concept competitors are in this tournament right now.</p>`;
    return;
  }

  container.innerHTML = standings
    .map((story, index) => {
      return `
        <div class="standing-card">
          <div class="standing-rank">#${index + 1}</div>
          <div class="standing-title">${story.title}</div>
          <div class="standing-meta">
            ${story.author ? `By ${story.author} · ` : ''}${story.totalVotes} vote${story.totalVotes === 1 ? '' : 's'}
          </div>
          <div class="standing-actions">
            <a href="/gallery/story.html?id=${story.id}">View Concept Details</a>
          </div>
        </div>
      `;
    })
    .join('');
}

/* =========================
   PAST WINNERS RENDERER
========================= */
function renderPastWinners(rounds, storiesMap) {
  const container = document.getElementById('past-winners-list');
  if (!container) return;

  if (!rounds.length) {
    container.innerHTML = `<p class="history-empty">No past winning concepts yet.</p>`;
    return;
  }

  container.innerHTML = rounds
    .map((round) => {
      const story = storiesMap.get(String(round.winner_id));
      const title = story?.title || 'Unknown Concept';
      const author = story?.author || '';
      const winnerLink = story ? `/gallery/story.html?id=${story.id}` : '#';

      return `
        <div class="winner-card">
          <div class="winner-title">${title}</div>
          <div class="winner-meta">
            <strong>Tournament:</strong> ${round.id}<br>
            ${author ? `<strong>Author:</strong> ${author}<br>` : ''}
            <strong>Winning Votes:</strong> ${round.winning_vote_count ?? '—'}<br>
            <strong>Finalized At:</strong> ${formatDateTime(round.finalized_at)}
          </div>
          <div class="winner-actions">
            <a href="${winnerLink}">View Winning Concept</a>
          </div>
        </div>
      `;
    })
    .join('');
}

/* =========================
   PAGE INITIALIZER
========================= */
async function initHistoryPage() {
  try {
    const [currentRound, pastRounds, storiesMap] = await Promise.all([
      fetchCurrentRound(),
      fetchPastFinalizedRounds(),
      fetchStoriesMap()
    ]);

    const currentRoundVotes = currentRound
      ? await fetchVotesForRound(currentRound.id)
      : [];

    renderCurrentRoundSummary(currentRound);
    renderCurrentStandings(currentRound, storiesMap, currentRoundVotes);
    renderPastWinners(pastRounds, storiesMap);
  } catch (err) {
    console.error('Error loading tournament history:', err);

    const currentRoundSummary = document.getElementById('current-round-summary');
    const currentStandingsList = document.getElementById('current-standings-list');
    const pastWinnersList = document.getElementById('past-winners-list');

    if (currentRoundSummary) {
      currentRoundSummary.innerHTML = `<p class="history-empty">Failed to load current tournament.</p>`;
    }

    if (currentStandingsList) {
      currentStandingsList.innerHTML = `<p class="history-empty">Failed to load current standings.</p>`;
    }

    if (pastWinnersList) {
      pastWinnersList.innerHTML = `<p class="history-empty">Failed to load past winners.</p>`;
    }
  }
}

document.addEventListener('DOMContentLoaded', initHistoryPage);