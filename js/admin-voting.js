// /js/admin-voting.js
import {
  parseJsonResponseSafely,
  formatDateTime,
  formatForDateTimeLocal,
  isEffectivelyClosed,
  deriveRoundStatus
} from './admin-shared.js';

let votingModuleInitialized = false;

let currentWorkingPeriod = null;
let currentTieStories = [];

function setStatus(el, message = '', color = '') {
  if (!el) return;
  el.textContent = message;
  el.style.color = color;
}

export function getCurrentWorkingPeriod() {
  return currentWorkingPeriod;
}

export function getCurrentTieStories() {
  return currentTieStories;
}

export function hideWinnerPreviewUI(ctx) {
  const {
    winnerPreviewPanel,
    winnerPreviewContent,
    winnerPreviewMessage,
    nextRoundFields,
    finalizeOnlyBtn,
    finalizeAndCreateBtn
  } = ctx;

  if (winnerPreviewPanel) winnerPreviewPanel.style.display = 'none';
  if (winnerPreviewContent) winnerPreviewContent.innerHTML = '';

  if (winnerPreviewMessage) {
    winnerPreviewMessage.textContent = '';
    winnerPreviewMessage.style.color = '';
  }

  if (nextRoundFields) nextRoundFields.style.display = 'none';
  if (finalizeOnlyBtn) finalizeOnlyBtn.style.display = 'none';
  if (finalizeAndCreateBtn) finalizeAndCreateBtn.style.display = 'none';
}

export function resetTieResolutionUI(ctx) {
  const {
    tieResolutionPanel,
    tieResolutionMessage,
    tieWinnerSelect,
    finalizeTieBtn
  } = ctx;

  currentTieStories = [];

  if (tieResolutionPanel) tieResolutionPanel.style.display = 'none';

  if (tieResolutionMessage) {
    tieResolutionMessage.textContent = '';
    tieResolutionMessage.style.color = '';
  }

  if (tieWinnerSelect) {
    tieWinnerSelect.innerHTML = '<option value="">-- Select a Winner --</option>';
  }

  if (finalizeTieBtn) {
    finalizeTieBtn.disabled = false;
    finalizeTieBtn.textContent = 'Finalize Tie Winner';
  }
}

export function renderTieResolutionUI(result, ctx) {
  const {
    tieResolutionPanel,
    tieResolutionMessage,
    tieWinnerSelect
  } = ctx;

  if (!tieResolutionPanel || !tieWinnerSelect) return;

  currentTieStories = Array.isArray(result.tied_stories) ? result.tied_stories : [];
  tieWinnerSelect.innerHTML = '<option value="">-- Select a Winner --</option>';

  currentTieStories.forEach((story) => {
    const option = document.createElement('option');
    option.value = story.story_id;
    option.textContent = `${story.title} (${story.total_votes} vote${story.total_votes === 1 ? '' : 's'})`;
    tieWinnerSelect.appendChild(option);
  });

  if (tieResolutionMessage) {
    tieResolutionMessage.textContent = `Tie detected in round ${result.period_id}. Choose one of the tied stories to finalize as winner.`;
    tieResolutionMessage.style.color = '#b45309';
  }

  tieResolutionPanel.style.display = 'block';
}

export function renderCurrentRoundSummary(period, ctx) {
  const { currentRoundSummary } = ctx;
  if (!currentRoundSummary) return;

  if (!period) {
    currentRoundSummary.innerHTML = '<p>No active unfinalized voting period found.</p>';
    return;
  }

  const computedStatus = deriveRoundStatus(period);

  currentRoundSummary.innerHTML = `
    <p><strong>Current Round ID:</strong> ${period.id}</p>
    <p><strong>Status:</strong> ${computedStatus}</p>
    <p><strong>Scheduled Start:</strong> ${formatDateTime(period.start_time)}</p>
    <p><strong>Scheduled End:</strong> ${formatDateTime(period.end_time)}</p>
    <p><strong>Closed At:</strong> ${formatDateTime(period.closed_at)}</p>
  `;
}

export function renderFinalizedWinnerSummary(period, winnerTitle = null, ctx) {
  const { finalizedWinnerSummary } = ctx;
  if (!finalizedWinnerSummary) return;

  if (!period || !period.finalized_at) {
    finalizedWinnerSummary.innerHTML = '<p>No finalized winner yet.</p>';
    return;
  }

  const resolvedWinnerTitle =
    winnerTitle ||
    period.winner_title ||
    (period.winner_id ? 'Unknown' : 'No winner');

  finalizedWinnerSummary.innerHTML = `
    <p><strong>Last Finalized Round:</strong> ${period.id}</p>
    <p><strong>Winner:</strong> ${resolvedWinnerTitle}</p>
    <p><strong>Winning Votes:</strong> ${period.winning_vote_count ?? '—'}</p>
    <p><strong>Scheduled Start:</strong> ${formatDateTime(period.start_time)}</p>
    <p><strong>Scheduled End:</strong> ${formatDateTime(period.end_time)}</p>
    <p><strong>Closed At:</strong> ${formatDateTime(period.closed_at)}</p>
    <p><strong>Finalized At:</strong> ${formatDateTime(period.finalized_at)}</p>
  `;
}

export async function loadVotingPeriod(ctx) {
  const {
    supabase,
    votingStart,
    votingEnd,
    closeVotingBtn,
    determineWinnerBtn
  } = ctx;

  try {
    const { data: currentPeriods, error: currentError } = await supabase
      .from('voting_periods')
      .select(`
        id,
        start_time,
        end_time,
        status,
        closed_at,
        finalized_at,
        winner_id,
        winning_vote_count
      `)
      .is('finalized_at', null)
      .order('id', { ascending: false })
      .limit(1);

    if (currentError) throw currentError;

    currentWorkingPeriod = currentPeriods?.[0] || null;

    if (currentWorkingPeriod) {
      if (votingStart) votingStart.value = formatForDateTimeLocal(currentWorkingPeriod.start_time);
      if (votingEnd) votingEnd.value = formatForDateTimeLocal(currentWorkingPeriod.end_time);
    } else {
      if (votingStart) votingStart.value = '';
      if (votingEnd) votingEnd.value = '';
    }

    renderCurrentRoundSummary(currentWorkingPeriod, ctx);

    const { data: finalizedPeriods, error: finalizedError } = await supabase
      .from('voting_periods')
      .select(`
        id,
        start_time,
        end_time,
        status,
        closed_at,
        finalized_at,
        winner_id,
        winning_vote_count
      `)
      .not('finalized_at', 'is', null)
      .order('finalized_at', { ascending: false })
      .limit(1);

    if (finalizedError) throw finalizedError;

    const latestFinalized = finalizedPeriods?.[0] || null;

    if (latestFinalized?.winner_id) {
      const { data: winnerStory } = await supabase
        .from('stories')
        .select('title')
        .eq('id', latestFinalized.winner_id)
        .maybeSingle();

      renderFinalizedWinnerSummary(latestFinalized, winnerStory?.title || null, ctx);
    } else {
      renderFinalizedWinnerSummary(latestFinalized, null, ctx);
    }

    const currentStatus = deriveRoundStatus(currentWorkingPeriod);

    if (closeVotingBtn) {
      const closeDisabled =
        !currentWorkingPeriod ||
        currentStatus === 'closed' ||
        currentStatus === 'finalized';

      closeVotingBtn.disabled = closeDisabled;

      if (!currentWorkingPeriod) {
        closeVotingBtn.textContent = 'Close Voting Now';
      } else if (currentStatus === 'closed') {
        closeVotingBtn.textContent = 'Voting Already Closed';
      } else if (currentStatus === 'finalized') {
        closeVotingBtn.textContent = 'Round Finalized';
      } else {
        closeVotingBtn.textContent = 'Close Voting Now';
      }
    }

    if (determineWinnerBtn) {
      determineWinnerBtn.disabled =
        !currentWorkingPeriod ||
        !isEffectivelyClosed(currentWorkingPeriod) ||
        !!currentWorkingPeriod.finalized_at;
    }
  } catch (err) {
    console.error('Error loading voting period:', err);
  }
}

export async function handleVotingPeriodSubmit(event, ctx) {
  event.preventDefault();

  const {
    votingStart,
    votingEnd,
    votingMsg
  } = ctx;

  const start_time = votingStart?.value || '';
  const end_time = votingEnd?.value || '';

  try {
    const token = await ctx.getAccessToken();
    if (!token) throw new Error('No active session found.');

    const res = await fetch('/.netlify/functions/set-voting-period', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ start_time, end_time })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to update voting period');
    }

    setStatus(votingMsg, 'Voting period updated successfully!', 'green');

    resetTieResolutionUI(ctx);
    hideWinnerPreviewUI(ctx);
    await loadVotingPeriod(ctx);
  } catch (err) {
    setStatus(votingMsg, `Error: ${err.message}`, 'red');
  }
}

export async function handleCloseVoting(ctx) {
  const {
    closeVotingBtn,
    votingMsg
  } = ctx;

  try {
    const token = await ctx.getAccessToken();
    if (!token) throw new Error('No active session found.');

    const confirmed = confirm('Close voting for the current round now?');
    if (!confirmed) return;

    if (closeVotingBtn) {
      closeVotingBtn.disabled = true;
      closeVotingBtn.textContent = 'Closing...';
    }

    const res = await fetch('/.netlify/functions/close-voting-period', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to close voting');
    }

    setStatus(votingMsg, result.message || 'Voting closed successfully.', 'green');

    resetTieResolutionUI(ctx);
    hideWinnerPreviewUI(ctx);
    await loadVotingPeriod(ctx);
  } catch (err) {
    console.error('Error closing voting:', err);
    setStatus(votingMsg, `Error: ${err.message}`, 'red');
  } finally {
    if (closeVotingBtn && !closeVotingBtn.disabled) {
      closeVotingBtn.textContent = 'Close Voting Now';
    }
  }
}

export async function determineWinner(ctx) {
  const {
    determineWinnerBtn,
    finalizedWinnerSummary,
    votingStart,
    votingEnd,
    votingMsg
  } = ctx;

  try {
    const token = await ctx.getAccessToken();
    if (!token) throw new Error('No active session found.');

    resetTieResolutionUI(ctx);
    hideWinnerPreviewUI(ctx);

    if (determineWinnerBtn) {
      determineWinnerBtn.disabled = true;
      determineWinnerBtn.textContent = 'Determining...';
    }

    const res = await fetch('/.netlify/functions/determine-winner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok) {
      throw new Error(result.error || 'Unknown error');
    }

    if (result.success && result.no_votes) {
      alert(`Voting Period ${result.period_id} was finalized with no winner because no votes were cast.`);

      if (finalizedWinnerSummary) {
        finalizedWinnerSummary.innerHTML = `
          <p><strong>Last Finalized Round:</strong> ${result.period_id}</p>
          <p><strong>Winner:</strong> No winner</p>
          <p><strong>Winning Votes:</strong> —</p>
          <p><strong>Finalized:</strong> just now</p>
        `;
      }

      if (votingStart) votingStart.value = '';
      if (votingEnd) votingEnd.value = '';

      setStatus(
        votingMsg,
        'Round finalized with no winner. Enter new dates above to create the next voting period.',
        'green'
      );

      await loadVotingPeriod(ctx);
      return;
    }

    if (result.success) {
      const totalsText = (result.vote_totals || [])
        .map((item) => `${item.title}: ${item.total_votes}`)
        .join('\n');

      alert(
        `Winner determined!\n\n` +
        `Voting Period: ${result.period_id}\n` +
        `Winner: ${result.winner_title}\n` +
        `Votes: ${result.vote_count}\n\n` +
        `Totals:\n${totalsText}`
      );

      if (finalizedWinnerSummary) {
        finalizedWinnerSummary.innerHTML = `
          <p><strong>Last Finalized Round:</strong> ${result.period_id}</p>
          <p><strong>Winner:</strong> ${result.winner_title}</p>
          <p><strong>Winning Votes:</strong> ${result.vote_count}</p>
          <p><strong>Finalized:</strong> just now</p>
        `;
      }

      if (votingStart) votingStart.value = '';
      if (votingEnd) votingEnd.value = '';

      setStatus(
        votingMsg,
        result.tie_resolved
          ? 'Tie resolved and winner finalized. Enter new dates above to create the next voting period.'
          : 'Winner finalized. Enter new dates above to create the next voting period.',
        'green'
      );

      await loadVotingPeriod(ctx);
      return;
    }

    if (result.reason === 'tie_detected') {
      renderTieResolutionUI(result, ctx);

      const totalsText = (result.vote_totals || [])
        .map((item) => `${item.title}: ${item.total_votes}`)
        .join('\n');

      alert(
        `Tie detected for Voting Period ${result.period_id}.\n\n` +
        `Totals:\n${totalsText}\n\n` +
        `Use the Tie Resolution panel to choose the winner.`
      );

      setStatus(
        votingMsg,
        'Tie detected. Choose one of the tied stories below and finalize manually.',
        '#b45309'
      );
      return;
    }

    alert(result.message || 'No winner determined.');
  } catch (err) {
    console.error('Error determining winner:', err);
    alert(err.message || 'Failed to determine winner.');
  } finally {
    if (determineWinnerBtn) {
      determineWinnerBtn.disabled = false;
      determineWinnerBtn.textContent = 'Determine Winner';
    }
  }
}

export async function handleFinalizeTieWinner(ctx) {
  const {
    tieWinnerSelect,
    finalizeTieBtn,
    tieResolutionMessage,
    votingStart,
    votingEnd,
    votingMsg
  } = ctx;

  try {
    const selectedWinnerStoryId = tieWinnerSelect?.value || '';

    if (!selectedWinnerStoryId) {
      throw new Error('Please select one of the tied stories.');
    }

    const token = await ctx.getAccessToken();
    if (!token) throw new Error('No active session found.');

    if (finalizeTieBtn) {
      finalizeTieBtn.disabled = true;
      finalizeTieBtn.textContent = 'Finalizing...';
    }

    const res = await fetch('/.netlify/functions/determine-winner', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        winner_story_id: selectedWinnerStoryId
      })
    });

    const result = await parseJsonResponseSafely(res);

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to finalize tie winner');
    }

    const totalsText = (result.vote_totals || [])
      .map((item) => `${item.title}: ${item.total_votes}`)
      .join('\n');

    alert(
      `Tie resolved!\n\n` +
      `Voting Period: ${result.period_id}\n` +
      `Winner: ${result.winner_title}\n` +
      `Votes: ${result.vote_count}\n\n` +
      `Totals:\n${totalsText}`
    );

    resetTieResolutionUI(ctx);
    hideWinnerPreviewUI(ctx);

    if (votingStart) votingStart.value = '';
    if (votingEnd) votingEnd.value = '';

    setStatus(
      votingMsg,
      'Tie resolved and winner finalized. Enter new dates above to create the next voting period.',
      'green'
    );

    await loadVotingPeriod(ctx);
  } catch (err) {
    console.error('Error finalizing tie winner:', err);

    setStatus(
      tieResolutionMessage,
      err.message || 'Failed to finalize tie winner.',
      'red'
    );

    setStatus(votingMsg, `Error: ${err.message}`, 'red');
  } finally {
    if (finalizeTieBtn) {
      finalizeTieBtn.disabled = false;
      finalizeTieBtn.textContent = 'Finalize Tie Winner';
    }
  }
}

export function initAdminVoting(ctx) {
  if (votingModuleInitialized) return;
  votingModuleInitialized = true;

  const {
    votingForm,
    closeVotingBtn,
    determineWinnerBtn,
    finalizeTieBtn
  } = ctx;

  votingForm?.addEventListener('submit', async (event) => {
    await handleVotingPeriodSubmit(event, ctx);
  });

  closeVotingBtn?.addEventListener('click', async () => {
    await handleCloseVoting(ctx);
  });

  determineWinnerBtn?.addEventListener('click', async () => {
    await determineWinner(ctx);
  });

  finalizeTieBtn?.addEventListener('click', async () => {
    await handleFinalizeTieWinner(ctx);
  });
}