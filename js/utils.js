// Mobile nav toggle
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.main-nav');

navToggle.addEventListener('click', () => {
  nav.classList.toggle('nav-open');
  navToggle.classList.toggle('open');
});

