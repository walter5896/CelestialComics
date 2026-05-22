// /js/team.js

const teamMembersList = document.getElementById('team-members-list');
const teamStatusMessage = document.getElementById('team-load-status');

const FALLBACK_ROLE_LABELS = ['THE SUN', 'THE MOON', 'THE NORTH STAR'];

function setTeamStatus(message = '', className = '') {
  if (!teamStatusMessage) return;

  teamStatusMessage.textContent = message;
  teamStatusMessage.className = className;
  teamStatusMessage.style.display = message ? 'block' : 'none';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function parseJsonResponseSafely(res) {
  const rawText = await res.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error(rawText || 'Server returned an invalid response.');
  }
}

function getRoleAccentClass(roleTitle = '', index = 0) {
  const normalized = String(roleTitle || '').toLowerCase();

  if (normalized.includes('sun')) return 'team-feature-sun';
  if (normalized.includes('moon')) return 'team-feature-moon';
  if (normalized.includes('star')) return 'team-feature-star';

  const fallbackClasses = [
    'team-feature-sun',
    'team-feature-moon',
    'team-feature-star'
  ];

  return fallbackClasses[index % fallbackClasses.length];
}

function getFallbackRoleLabel(index = 0) {
  return FALLBACK_ROLE_LABELS[index % FALLBACK_ROLE_LABELS.length];
}

function formatBioParagraphs(member) {
  const bioText =
    String(member.full_bio || '').trim() ||
    String(member.short_bio || '').trim() ||
    'Bio coming soon.';

  return bioText
    .split(/\n{2,}|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
}

function renderTeamImage(member, roleLabel) {
  const safeName = escapeHtml(member.name || 'Team member');
  const safeRole = escapeHtml(roleLabel || 'Team member');

  if (member.image_url) {
    return `
      <div class="team-image-panel">
        <img
          src="${escapeHtml(member.image_url)}"
          alt="${safeName}, ${safeRole} for Celestial Comics"
          class="team-feature-image"
          loading="lazy"
          decoding="async"
        />
      </div>
    `;
  }

  return `
    <div class="team-placeholder-panel" aria-label="${safeName} image placeholder">
      <span>Image Coming Soon</span>
    </div>
  `;
}

function renderTeamMember(member, index) {
  const name = escapeHtml(member.name || 'Unnamed Team Member');
  const roleLabel = String(member.role_title || '').trim() || getFallbackRoleLabel(index);
  const safeRoleLabel = escapeHtml(roleLabel).toUpperCase();

  const accentClass = getRoleAccentClass(roleLabel, index);
  const isReverse = index % 2 === 1;

  const imageMarkup = renderTeamImage(member, roleLabel);

  const copyMarkup = `
    <div class="team-copy-panel">
      <p class="team-eyebrow">${safeRoleLabel}</p>
      <h2>${name}</h2>
      ${formatBioParagraphs(member)}
    </div>
  `;

  return `
    <section class="team-feature ${accentClass} ${isReverse ? 'team-feature-reverse' : ''}">
      ${isReverse ? copyMarkup + imageMarkup : imageMarkup + copyMarkup}
    </section>
  `;
}

function renderTeamMembers(teamMembers = []) {
  if (!teamMembersList) return;

  const safeMembers = Array.isArray(teamMembers) ? teamMembers : [];

  if (!safeMembers.length) {
    teamMembersList.innerHTML = `
      <section class="team-feature">
        <div class="team-placeholder-panel">
          <span>Team Coming Soon</span>
        </div>

        <div class="team-copy-panel">
          <p class="team-eyebrow">COMING SOON</p>
          <h2>Meet the Team</h2>
          <p>
            Team member profiles are being prepared. Check back soon to meet the creative minds behind Celestial Comics.
          </p>
        </div>
      </section>
    `;

    setTeamStatus('');
    return;
  }

  teamMembersList.innerHTML = safeMembers
    .map((member, index) => renderTeamMember(member, index))
    .join('');

  setTeamStatus('');
}

async function loadTeamMembers() {
  if (!teamMembersList) {
    console.warn('Missing #team-members-list on Team page.');
    return;
  }

  try {
    setTeamStatus('Loading team members...');

    const res = await fetch('/.netlify/functions/get-team-members', {
      method: 'GET'
    });

    const data = await parseJsonResponseSafely(res);

    if (!res.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to load team members.');
    }

    renderTeamMembers(data.team_members || []);
  } catch (error) {
    console.error('Team page load error:', error);

    teamMembersList.innerHTML = `
      <section class="team-feature">
        <div class="team-placeholder-panel">
          <span>Unable to Load</span>
        </div>

        <div class="team-copy-panel">
          <p class="team-eyebrow">TEAM</p>
          <h2>Team Profiles Unavailable</h2>
          <p>
            The team profiles could not be loaded right now. Please check back soon.
          </p>
        </div>
      </section>
    `;

    setTeamStatus(error.message || 'Failed to load team members.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', loadTeamMembers);