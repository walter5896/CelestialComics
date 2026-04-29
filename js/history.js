// /js/history.js
import { supabase } from './supabase.js';
import { setStories, setVotingPeriod, clearVotingPeriod } from './state.js';

const currentRoundSummaryEl = document.getElementById('current-round-summary');
const currentStandingsListEl = document.getElementById('current-standings-list');
const pastWinnersListEl = document.getElementById('past-winners-list');

const featuredWinnerPanelEl = document.getElementById('featured-winner-panel');
const productionListEl = document.getElementById('production-list');
const releasedListEl = document.getElementById('released-list');

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

function formatDate(value) {
  if (!value) return 'TBA';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString();
}

function getStoryImage(story) {
  return story?.cover_image_url || story?.image_url || '';
}

function getStoryLink(story) {
  if (!story?.id) return '#';

  /*
    This matches the original history.js route.
    If this route is still broken, send me your actual story detail/read file path
    and we’ll change it here in one place.
  */
  return `/gallery/story.html?id=${encodeId(story.id)}`;
}

function getReadLink(story) {
  if (!story?.id) return '#';
  return `/gallery/read.html?id=${encodeId(story.id)}&page=1`;
}

function getStoryDescription(story, fallback = 'More details for this story will be available soon.') {
  return story?.description || fallback;
}

/* =========================
   ROUND STATUS
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

function getRoundStatusLabel(status) {
  switch (status) {
    case 'open':
      return 'Voting Open';
    case 'upcoming':
      return 'Upcoming';
    case 'closed':
      return 'Voting Closed';
    case 'finalized':
      return 'Finalized';
    default:
      return 'No Active Round';
  }
}

function getStatusPill(status) {
  const safeStatus = escapeHtml(status);
  const label = escapeHtml(getRoundStatusLabel(status));

  return `<span class="status-pill ${safeStatus}">${label}</span>`;
}

/* =========================
   PRODUCTION HELPERS
========================= */

function getProductionStageLabel(story) {
  if (story?.story_status === 'released') return 'Released';
  if (story?.story_status === 'winner_in_production') return 'Winner Selected';
  return 'Story Concept';
}

function getProductionProgress(story) {
  if (story?.story_status === 'released') return 100;
  if (story?.story_status === 'winner_in_production') return 20;
  return 20;
}

function getProgressLabel(progress) {
  if (progress >= 100) return 'Complete';
  if (progress >= 85) return 'Preparing Release';
  if (progress >= 70) return 'Final Review';
  if (progress >= 50) return 'Artwork in Progress';
  if (progress >= 35) return 'Story Development';
  return 'Winner Selected';
}

/* =========================
   ERROR HELPERS
========================= */

function renderCurrentRoundError(message = 'Failed to load current tournament.') {
  if (currentRoundSummaryEl) {
    currentRoundSummaryEl.innerHTML = `<div class="winner-empty">${escapeHtml(message)}</div>`;
  }
}

function renderStandingsError(message = 'Failed to load current standings.') {
  if (currentStandingsListEl) {
    currentStandingsListEl.innerHTML = `<div class="winner-empty">${escapeHtml(message)}</div>`;
  }
}

function renderPastWinnersError(message = 'Failed to load past winners.') {
  if (pastWinnersListEl) {
    pastWinnersListEl.innerHTML = `<div class="winner-empty">${escapeHtml(message)}</div>`;
  }
}

function renderFeaturedWinnerError(message = 'Failed to load latest winner.') {
  if (featuredWinnerPanelEl) {
    featuredWinnerPanelEl.innerHTML = `<div class="winner-empty">${escapeHtml(message)}</div>`;
  }
}

function renderProductionError(message = 'Failed to load production stories.') {
  if (productionListEl) {
    productionListEl.innerHTML = `<div class="winner-empty">${escapeHtml(message)}</div>`;
  }
}

function renderReleasedError(message = 'Failed to load released stories.') {
  if (releasedListEl) {
    releasedListEl.innerHTML = `<div class="winner-empty">${escapeHtml(message)}</div>`;
  }
}

/* =========================
   DATA FETCHERS
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

async function fetchStoriesMap() {
  /*
    Only query columns we know are already part of your current story workflow.
    Do NOT query optional production/shop fields here until we add them to Supabase.
  */
  const { data, error } = await supabase
    .from('stories')
    .select(`
      id,
      title,
      author,
      description,
      cover_image_url,
      image_url,
      active,
      story_status,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const safeStories = data || [];
  setStories(safeStories);

  const map = new Map();

  safeStories.forEach((story) => {
    map.set(String(story.id), story);
  });

  return map;
}

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
   CURRENT ROUND SUMMARY
========================= */

function renderCurrentRoundSummary(round) {
  if (!currentRoundSummaryEl) return;

  if (!round) {
    currentRoundSummaryEl.innerHTML = `
      <div class="winner-empty">
        No active or pending concept tournament exists right now.
      </div>
    `;
    return;
  }

  const status = deriveRoundStatus(round);

  currentRoundSummaryEl.innerHTML = `
    ${getStatusPill(status)}
    <p><strong>Start:</strong> ${escapeHtml(formatDateTime(round.start_time))}</p>
    <p><strong>End:</strong> ${escapeHtml(formatDateTime(round.end_time))}</p>
    <p><strong>Closed At:</strong> ${escapeHtml(formatDateTime(round.closed_at))}</p>
  `;
}

/* =========================
   FEATURED LATEST WINNER
========================= */

function renderFeaturedWinner(pastRounds, storiesMap) {
  if (!featuredWinnerPanelEl) return;

  const latestRound = Array.isArray(pastRounds)
    ? pastRounds.find((round) => round?.winner_id)
    : null;

  if (!latestRound) {
    featuredWinnerPanelEl.innerHTML = `
      <div class="featured-winner-layout">
        <div class="featured-winner-art">
          <div class="winner-empty">
            Latest winner artwork will appear here after the next finalized round.
          </div>
        </div>

        <div class="featured-winner-copy">
          <span class="status-pill finalized">Awaiting Winner</span>
          <h2>Winner Coming Soon</h2>
          <p>
            Once a tournament has a finalized winner, this section will feature the selected story,
            concept art, vote result, and production status.
          </p>

          <div class="winner-actions">
            <a href="/vote/" class="btn btn-primary">View Current Vote</a>
            <a href="/gallery/" class="btn btn-secondary">Explore Gallery</a>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const story = storiesMap.get(String(latestRound.winner_id));
  const image = getStoryImage(story);
  const title = story?.title || 'Unknown Winning Story';
  const author = story?.author || '';
  const description = getStoryDescription(
    story,
    'This winning story has been selected by the community and is ready for the next stage of Celestial Comics production.'
  );
  const voteCount = latestRound.winning_vote_count ?? '—';
  const finalizedAt = formatDate(latestRound.finalized_at);
  const storyLink = story ? getStoryLink(story) : '#';

  featuredWinnerPanelEl.innerHTML = `
    <div class="featured-winner-layout">
      <div class="featured-winner-art">
        ${
          image
            ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)} artwork" />`
            : `<div class="winner-empty">No artwork is available for this winner yet.</div>`
        }
      </div>

      <div class="featured-winner-copy">
        <span class="status-pill finalized">Latest Winner</span>
        <h2>${escapeHtml(title)}</h2>

        ${author ? `<p><strong>By ${escapeHtml(author)}</strong></p>` : ''}

        <p>${escapeHtml(description)}</p>

        <p>
          <strong>Winning Votes:</strong> ${escapeHtml(voteCount)}<br>
          <strong>Finalized:</strong> ${escapeHtml(finalizedAt)}
        </p>

        <div class="winner-actions">
          <a href="${storyLink}" class="btn btn-primary">View Winning Story</a>
          <a href="/gallery/" class="btn btn-secondary">Explore Gallery</a>
        </div>
      </div>
    </div>
  `;
}

/* =========================
   PRODUCTION STORIES
========================= */

function renderProductionStories(storiesMap) {
  if (!productionListEl) return;

  const stories = Array.from(storiesMap.values())
    .filter((story) => story?.active !== false)
    .filter((story) => story?.story_status === 'winner_in_production')
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));

  if (!stories.length) {
    productionListEl.innerHTML = `
      <div class="winner-empty">
        No stories are currently marked as in production.
      </div>
    `;
    return;
  }

  productionListEl.innerHTML = stories
    .map((story) => {
      const title = story.title || 'Untitled Story';
      const author = story.author || '';
      const image = getStoryImage(story);
      const stageLabel = getProductionStageLabel(story);
      const progress = getProductionProgress(story);
      const progressLabel = getProgressLabel(progress);
      const description = getStoryDescription(
        story,
        'This winning story is currently moving through the Celestial Comics production pipeline.'
      );

      return `
        <article class="production-card">
          ${
            image
              ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)} artwork" />`
              : ''
          }

          <span class="production-status">${escapeHtml(stageLabel)}</span>

          <h3>${escapeHtml(title)}</h3>

          ${author ? `<p><strong>By ${escapeHtml(author)}</strong></p>` : ''}

          <p>${escapeHtml(description)}</p>

          <div class="production-timeline" aria-label="${escapeHtml(title)} production progress">
            <div class="production-stage-row">
              <div class="production-stage-label">
                <span>${escapeHtml(progressLabel)}</span>
                <span>${escapeHtml(progress)}%</span>
              </div>
              <div class="production-progress-track">
                <div class="production-progress-fill" style="--progress: ${escapeHtml(progress)}%;"></div>
              </div>
            </div>
          </div>

          <div class="production-actions">
            <a href="${getStoryLink(story)}" class="btn btn-primary">View Story</a>
            <a href="/gallery/" class="btn btn-secondary">Gallery</a>
          </div>
        </article>
      `;
    })
    .join('');
}

/* =========================
   RELEASED STORIES
========================= */

function renderReleasedStories(storiesMap) {
  if (!releasedListEl) return;

  const stories = Array.from(storiesMap.values())
    .filter((story) => story?.active !== false)
    .filter((story) => story?.story_status === 'released')
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));

  if (!stories.length) {
    releasedListEl.innerHTML = `
      <div class="winner-empty">
        No stories are currently marked as released.
      </div>
    `;
    return;
  }

  releasedListEl.innerHTML = stories
    .map((story) => {
      const title = story.title || 'Untitled Story';
      const author = story.author || '';
      const image = getStoryImage(story);
      const description = getStoryDescription(
        story,
        'This Celestial Comics story has completed production and is available to explore.'
      );

      return `
        <article class="release-card">
          ${
            image
              ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)} cover" />`
              : ''
          }

          <span class="release-status">Released</span>

          <h3>${escapeHtml(title)}</h3>

          ${author ? `<p><strong>By ${escapeHtml(author)}</strong></p>` : ''}

          <p>${escapeHtml(description)}</p>

          <p>
            <strong>Formats:</strong> Release details coming soon
          </p>

          <div class="release-actions">
            <a href="${getReadLink(story)}" class="btn btn-primary">Read Story</a>
            <a href="/shop/" class="btn btn-secondary">Shop Formats</a>
          </div>
        </article>
      `;
    })
    .join('');
}

/* =========================
   CURRENT STANDINGS
========================= */

function renderCurrentStandings(round, storiesMap, votes) {
  if (!currentStandingsListEl) return;

  if (!round) {
    currentStandingsListEl.innerHTML = `
      <div class="winner-empty">No current standings to display.</div>
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
      <div class="winner-empty">
        No active concept competitors are in this tournament right now.
      </div>
    `;
    return;
  }

  currentStandingsListEl.innerHTML = standings
    .map((story, index) => {
      const title = story.title || 'Untitled Story';
      const author = story.author || '';
      const votesText = Number(story.totalVotes) || 0;
      const image = getStoryImage(story);

      return `
        <article class="standing-card">
          ${
            image
              ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)} artwork" />`
              : ''
          }

          <div class="standing-rank">#${index + 1}</div>
          <h3 class="standing-title">${escapeHtml(title)}</h3>

          <p class="standing-meta">
            ${author ? `By ${escapeHtml(author)} · ` : ''}${votesText} vote${votesText === 1 ? '' : 's'}
          </p>

          <div class="standing-actions">
            <a href="${getStoryLink(story)}" class="btn btn-secondary">View Concept</a>
          </div>
        </article>
      `;
    })
    .join('');
}

/* =========================
   PAST WINNERS
========================= */

function renderPastWinners(rounds, storiesMap) {
  if (!pastWinnersListEl) return;

  if (!Array.isArray(rounds) || !rounds.length) {
    pastWinnersListEl.innerHTML = `
      <div class="winner-empty">No past winning concepts yet.</div>
    `;
    return;
  }

  pastWinnersListEl.innerHTML = rounds
    .map((round) => {
      const story = storiesMap.get(String(round.winner_id));
      const title = story?.title || 'Unknown Concept';
      const author = story?.author || '';
      const image = getStoryImage(story);
      const winningVotes = round.winning_vote_count ?? '—';
      const finalizedAt = formatDate(round.finalized_at);
      const winnerLink = story ? getStoryLink(story) : '#';

      return `
        <article class="winner-card">
          ${
            image
              ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)} artwork" />`
              : ''
          }

          <span class="status-pill finalized">Past Winner</span>

          <h3 class="winner-title">${escapeHtml(title)}</h3>

          <p class="winner-meta">
            ${author ? `<strong>Author:</strong> ${escapeHtml(author)}<br>` : ''}
            <strong>Winning Votes:</strong> ${escapeHtml(winningVotes)}<br>
            <strong>Finalized:</strong> ${escapeHtml(finalizedAt)}
          </p>

          <div class="winner-actions">
            <a href="${winnerLink}" class="btn btn-secondary">View Winning Concept</a>
          </div>
        </article>
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
    renderFeaturedWinner(pastRounds, storiesMap);
    renderProductionStories(storiesMap);
    renderReleasedStories(storiesMap);
    renderCurrentStandings(currentRound, storiesMap, currentRoundVotes);
    renderPastWinners(pastRounds, storiesMap);
  } catch (err) {
    console.error('Error loading winner page:', err);

    renderCurrentRoundError();
    renderFeaturedWinnerError();
    renderProductionError();
    renderReleasedError();
    renderStandingsError();
    renderPastWinnersError();
  }
}

document.addEventListener('DOMContentLoaded', initHistoryPage);