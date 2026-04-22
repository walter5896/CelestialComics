// /js/utils.js

const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.main-nav');

let navInitialized = false;

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

document.addEventListener('DOMContentLoaded', initNavToggle);