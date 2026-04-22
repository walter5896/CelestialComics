// /js/history.js
import { supabase } from './supabase.js';
import { setStories, setVotingPeriod, clearVotingPeriod } from './state.js';

const currentRoundSummaryEl = document.getElementById('current-round-summary');
const currentStandingsListEl = document.getElementById('current-standings-list');
const pastWinnersListEl = document.getElementById('past-winners-list');

let historyInitialized = false;

/* =========================
   GENERIC HELPERS
========================= */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function encodeId(value) {
  return encodeURIComponent(String(value ?? ''));
}

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

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'closed';
  }

  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'open';
  return 'closed';
}

/* =========================
   STATUS PILL RENDERER
========================= */

function getStatusPill(status) {
  const safeStatus = escapeHtml(status);
  return `<span class="status-pill ${safeStatus}">${safeStatus}</span>`;
}

/* =========================
   EMPTY / ERROR HELPERS
========================= */

function renderCurrentRoundError(message = 'Failed to load current tournament.') {
  if (currentRoundSummaryEl) {
    currentRoundSummaryEl.innerHTML = `<p class="history-empty">${escapeHtml(message)}</p>`;
  }
}

function renderStandingsError(message = 'Failed to load current standings.') {
  if (currentStandingsListEl) {
    currentStandingsListEl.innerHTML = `<p class="history-empty">${escapeHtml(message)}</p>`;
  }
}

function renderPastWinnersError(message = 'Failed to load past winners.') {
  if (pastWinnersListEl) {
    pastWinnersListEl.innerHTML = `<p class="history-empty">${escapeHtml(message)}</p>`;
  }
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

  const safeStories = data || [];
  setStories(safeStories);

  const map = new Map();
  safeStories.forEach((story) => {
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
  if (!currentRoundSummaryEl) return;

  if (!round) {
    currentRoundSummaryEl.innerHTML = `
      <p class="history-empty">No active or pending concept tournament exists right now.</p>
    `;
    return;
  }

  const status = deriveRoundStatus(round);

  currentRoundSummaryEl.innerHTML = `
    ${getStatusPill(status)}
    <p><strong>Tournament ID:</strong> ${escapeHtml(round.id)}</p>
    <p><strong>Start:</strong> ${escapeHtml(formatDateTime(round.start_time))}</p>
    <p><strong>End:</strong> ${escapeHtml(formatDateTime(round.end_time))}</p>
    <p><strong>Closed At:</strong> ${escapeHtml(formatDateTime(round.closed_at))}</p>
  `;
}

/* =========================
   STANDINGS RENDERER
========================= */

function renderCurrentStandings(round, storiesMap, votes) {
  if (!currentStandingsListEl) return;

  if (!round) {
    currentStandingsListEl.innerHTML = `
      <p class="history-empty">No current standings to display.</p>
    `;
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
    .sort((a, b) => b.totalVotes - a.totalVotes || String(a.title || '').localeCompare(String(b.title || '')));

  if (!standings.length) {
    currentStandingsListEl.innerHTML = `
      <p class="history-empty">No active concept competitors are in this tournament right now.</p>
    `;
    return;
  }

  currentStandingsListEl.innerHTML = standings
    .map((story, index) => {
      const safeTitle = escapeHtml(story.title || 'Untitled Story');
      const safeAuthor = escapeHtml(story.author || '');
      const safeVotes = Number(story.totalVotes) || 0;
      const safeStoryId = encodeId(story.id);

      return `
        <div class="standing-card">
          <div class="standing-rank">#${index + 1}</div>
          <div class="standing-title">${safeTitle}</div>
          <div class="standing-meta">
            ${safeAuthor ? `By ${safeAuthor} · ` : ''}${safeVotes} vote${safeVotes === 1 ? '' : 's'}
          </div>
          <div class="standing-actions">
            <a href="/gallery/story.html?id=${safeStoryId}">View Concept Details</a>
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
  if (!pastWinnersListEl) return;

  if (!Array.isArray(rounds) || !rounds.length) {
    pastWinnersListEl.innerHTML = `
      <p class="history-empty">No past winning concepts yet.</p>
    `;
    return;
  }

  pastWinnersListEl.innerHTML = rounds
    .map((round) => {
      const story = storiesMap.get(String(round.winner_id));
      const safeTitle = escapeHtml(story?.title || 'Unknown Concept');
      const safeAuthor = escapeHtml(story?.author || '');
      const safeRoundId = escapeHtml(round.id);
      const safeWinningVotes = escapeHtml(round.winning_vote_count ?? '—');
      const safeFinalizedAt = escapeHtml(formatDateTime(round.finalized_at));
      const winnerLink = story ? `/gallery/story.html?id=${encodeId(story.id)}` : '#';

      return `
        <div class="winner-card">
          <div class="winner-title">${safeTitle}</div>
          <div class="winner-meta">
            <strong>Tournament:</strong> ${safeRoundId}<br>
            ${safeAuthor ? `<strong>Author:</strong> ${safeAuthor}<br>` : ''}
            <strong>Winning Votes:</strong> ${safeWinningVotes}<br>
            <strong>Finalized At:</strong> ${safeFinalizedAt}
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
  if (historyInitialized) return;
  historyInitialized = true;

  try {
    const [currentRound, pastRounds, storiesMap] = await Promise.all([
      fetchCurrentRound(),
      fetchPastFinalizedRounds(),
      fetchStoriesMap()
    ]);

    if (currentRound) {
      setVotingPeriod(currentRound);
    } else {
      clearVotingPeriod();
    }

    const currentRoundVotes = currentRound
      ? await fetchVotesForRound(currentRound.id)
      : [];

    renderCurrentRoundSummary(currentRound);
    renderCurrentStandings(currentRound, storiesMap, currentRoundVotes);
    renderPastWinners(pastRounds, storiesMap);
  } catch (err) {
    console.error('Error loading tournament history:', err);
    renderCurrentRoundError();
    renderStandingsError();
    renderPastWinnersError();
  }
}

document.addEventListener('DOMContentLoaded', initHistoryPage);