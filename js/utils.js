// /js/utils.js

const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.main-nav');

let navInitialized = false;
let deferredInstallPrompt = null;
let installPromptInitialized = false;

const INSTALL_DISMISSED_KEY = 'celestialcomics-install-dismissed-at';
const INSTALL_DISMISS_DAYS = 7;

/* =======================
   NAVIGATION
======================= */

function setNavOpen(isOpen) {
  if (!nav || !navToggle) return;

  nav.classList.toggle('nav-open', isOpen);
  navToggle.classList.toggle('open', isOpen);
  navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function toggleNav() {
  if (!nav) return;
  const isOpen = nav.classList.contains('nav-open');
  setNavOpen(!isOpen);
}

function closeNav() {
  setNavOpen(false);
}

function initNavToggle() {
  if (navInitialized) return;
  navInitialized = true;

  if (!navToggle || !nav) return;

  navToggle.setAttribute('aria-expanded', 'false');

  navToggle.addEventListener('click', () => {
    toggleNav();
  });

  document.addEventListener('click', (event) => {
    const clickedInsideNav = nav.contains(event.target);
    const clickedToggle = navToggle.contains(event.target);

    if (!clickedInsideNav && !clickedToggle) {
      closeNav();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeNav();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      closeNav();
    }
  });
}

/* =======================
   PWA INSTALL PROMPT
======================= */

function isAdminPage() {
  return window.location.pathname.startsWith('/admin');
}

function isStandaloneApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isMobileOrTablet() {
  return window.matchMedia('(max-width: 1024px)').matches ||
    window.matchMedia('(pointer: coarse)').matches;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isSafariBrowser() {
  const ua = window.navigator.userAgent.toLowerCase();
  return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('crios') && !ua.includes('fxios');
}

function recentlyDismissedInstallPrompt() {
  const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISSED_KEY));

  if (!dismissedAt) return false;

  const elapsedMs = Date.now() - dismissedAt;
  const dismissedWindowMs = INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000;

  return elapsedMs < dismissedWindowMs;
}

function markInstallPromptDismissed() {
  localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
}

function injectInstallPromptStyles() {
  if (document.getElementById('pwa-install-prompt-styles')) return;

  const style = document.createElement('style');
  style.id = 'pwa-install-prompt-styles';
  style.textContent = `
    .pwa-install-prompt {
      position: fixed;
      left: 1rem;
      right: 1rem;
      bottom: 1rem;
      z-index: 9999;
      max-width: 520px;
      margin: 0 auto;
      padding: 1rem;
      display: grid;
      gap: 0.85rem;
      background:
        linear-gradient(180deg, rgba(18, 75, 137, 0.98), rgba(7, 31, 64, 0.98));
      border: 1px solid rgba(242, 178, 74, 0.34);
      border-radius: 18px;
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.32);
      color: #ffffff;
      font-family: inherit;
    }

    .pwa-install-prompt[hidden] {
      display: none !important;
    }

    .pwa-install-prompt__copy {
      display: grid;
      gap: 0.25rem;
    }

    .pwa-install-prompt__title {
      margin: 0;
      color: #f8d28a;
      font-size: 1rem;
      font-weight: 900;
      letter-spacing: 0.02em;
    }

    .pwa-install-prompt__text {
      margin: 0;
      color: rgba(255, 255, 255, 0.82);
      font-size: 0.9rem;
      line-height: 1.45;
    }

    .pwa-install-prompt__actions {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.65rem;
      align-items: center;
    }

    .pwa-install-prompt__button,
    .pwa-install-prompt__dismiss {
      min-height: 44px;
      border: 0;
      border-radius: 999px;
      font: inherit;
      font-size: 0.88rem;
      font-weight: 900;
      cursor: pointer;
    }

    .pwa-install-prompt__button {
      padding: 0.75rem 1rem;
      background: #f2b24a;
      color: #071f40;
    }

    .pwa-install-prompt__dismiss {
      width: 44px;
      padding: 0;
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    .pwa-install-prompt__button:hover,
    .pwa-install-prompt__button:focus-visible,
    .pwa-install-prompt__dismiss:hover,
    .pwa-install-prompt__dismiss:focus-visible {
      filter: brightness(1.08);
      outline: 2px solid rgba(242, 178, 74, 0.45);
      outline-offset: 2px;
    }

    @media (min-width: 900px) {
      .pwa-install-prompt {
        left: auto;
        right: 1.25rem;
        bottom: 1.25rem;
      }
    }
  `;

  document.head.appendChild(style);
}

function removeInstallPrompt() {
  const existingPrompt = document.getElementById('pwa-install-prompt');
  if (existingPrompt) existingPrompt.remove();
}

function createInstallPrompt({ mode = 'install' } = {}) {
  removeInstallPrompt();
  injectInstallPromptStyles();

  const prompt = document.createElement('aside');
  prompt.id = 'pwa-install-prompt';
  prompt.className = 'pwa-install-prompt';
  prompt.setAttribute('role', 'dialog');
  prompt.setAttribute('aria-label', 'Install Celestial Comics app');

  const isIOSInstructionMode = mode === 'ios';

  prompt.innerHTML = `
    <div class="pwa-install-prompt__copy">
      <p class="pwa-install-prompt__title">Install Celestial Comics</p>
      <p class="pwa-install-prompt__text">
        ${
          isIOSInstructionMode
            ? 'Add this site to your Home Screen for a smoother app-like experience. Tap Share, then Add to Home Screen.'
            : 'Add Celestial Comics to your device for a smoother app-like experience. It will open from the homepage.'
        }
      </p>
    </div>

    <div class="pwa-install-prompt__actions">
      <button type="button" class="pwa-install-prompt__button">
        ${isIOSInstructionMode ? 'Got It' : 'Install App'}
      </button>

      <button type="button" class="pwa-install-prompt__dismiss" aria-label="Dismiss install prompt">
        ×
      </button>
    </div>
  `;

  const actionButton = prompt.querySelector('.pwa-install-prompt__button');
  const dismissButton = prompt.querySelector('.pwa-install-prompt__dismiss');

  dismissButton.addEventListener('click', () => {
    markInstallPromptDismissed();
    removeInstallPrompt();
  });

  actionButton.addEventListener('click', async () => {
    if (isIOSInstructionMode) {
      markInstallPromptDismissed();
      removeInstallPrompt();
      return;
    }

    if (!deferredInstallPrompt) {
      removeInstallPrompt();
      return;
    }

    deferredInstallPrompt.prompt();

    try {
      await deferredInstallPrompt.userChoice;
    } catch (error) {
      console.warn('Install prompt choice could not be read:', error);
    }

    deferredInstallPrompt = null;
    removeInstallPrompt();
  });

  document.body.appendChild(prompt);
}

function maybeShowIOSInstallInstructions() {
  if (!isIOSDevice()) return;
  if (!isSafariBrowser()) return;
  if (isStandaloneApp()) return;
  if (recentlyDismissedInstallPrompt()) return;

  createInstallPrompt({ mode: 'ios' });
}

function initInstallPrompt() {
  if (installPromptInitialized) return;
  installPromptInitialized = true;

  if (isAdminPage()) return;
  if (!isMobileOrTablet()) return;
  if (isStandaloneApp()) return;
  if (recentlyDismissedInstallPrompt()) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();

    deferredInstallPrompt = event;
    createInstallPrompt({ mode: 'install' });
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    removeInstallPrompt();
  });

  window.setTimeout(() => {
    if (!deferredInstallPrompt) {
      maybeShowIOSInstallInstructions();
    }
  }, 1200);
}

/* =======================
   INIT
======================= */

document.addEventListener('DOMContentLoaded', () => {
  initNavToggle();
  initInstallPrompt();
});