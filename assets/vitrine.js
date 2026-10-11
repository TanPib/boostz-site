// La page d'accueil (octobre 2026) : le booster à ouvrir, le shuffle des huit
// dos de cartes, les révélations au défilement, et l'en-tête selon la session.
//
// Sans JavaScript, tout le contenu reste lisible (et indexable) : c'est la
// classe .anim, posée ici, qui cache les éléments jusqu'à leur arrivée.
import { session, refreshMe, isVerifiedAdmin, clearSession } from './api.js';
import { el, put, clear, initialOf, lockIcon, accountButton } from './chrome.js';

const $ = (id) => document.getElementById(id);
const pg = $('pg');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- En-tête et pied de page selon la session ----------
// Même règle que l'ancienne landing : le bouton « Admin » n'apparaît qu'après
// confirmation du rôle par le serveur.
function renderAccount() {
  const s = session();
  const nav = clear($('lp-account'));
  const locks = document.querySelectorAll('[data-lock]');
  if (s && s.user) {
    put(nav,
      el('a', { class: 'bz-top-link bz-hide-sm', href: 'compte.html', text: 'Mon compte' }),
      isVerifiedAdmin() ? el('a', { class: 'bz-btn is-violet is-sm bz-hide-sm', href: 'admin.html', text: 'Admin' }) : null,
      el('span', { class: 'bz-avatar bz-hide-sm', 'aria-hidden': 'true', text: initialOf(s.user) }),
      accountButton(s.user, { logout: () => { clearSession(); renderAccount(); } })
    );
    for (const slot of locks) slot.hidden = true;
    $('foot-note').hidden = true;
  } else {
    put(nav, el('a', { class: 'bz-btn is-primary is-sm', href: 'connexion.html', text: 'Se connecter' }));
    for (const slot of locks) {
      if (!slot.firstChild) slot.append(lockIcon(11));
      slot.hidden = false;
    }
    $('foot-note').hidden = false;
  }
}

async function verifyAccount() {
  if (!session()) return;
  try { await refreshMe(); } catch { /* 401 ou serveur injoignable : pas de bouton Admin */ }
  renderAccount();
}

// ---------- Le booster ----------
const stage = document.querySelector('.hstage');
const pack = document.querySelector('.pack');
let cycle = null;

function open() {
  if (pg.classList.contains('is-open')) return;
  pg.classList.remove('cyc');
  stage.dataset.hi = '0';
  pg.classList.add('is-open');
  // Le shuffle : une carte mise en avant toutes les 1,9 s, son nom dessous.
  if (!reduced) {
    clearInterval(cycle);
    cycle = setInterval(() => {
      stage.dataset.hi = String((Number(stage.dataset.hi) + 1) % 8);
      pg.classList.add('cyc');
    }, 1900);
  }
}

function close() {
  clearInterval(cycle);
  pg.classList.remove('is-open', 'cyc');
}

pack.addEventListener('click', open);
// Glisser vers la droite (ou la gauche) ouvre aussi : 30 px suffisent.
let x0 = null;
pack.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
pack.addEventListener('pointerup', (e) => {
  if (x0 !== null && Math.abs(e.clientX - x0) > 30) open();
  x0 = null;
});
document.querySelector('.again').addEventListener('click', close);

// ---------- Révélations au défilement ----------
function count(node) {
  const to = Number(node.dataset.to);
  if (reduced) return;
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 1500);
    node.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('fr-FR') + ' €';
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

if (!reduced && 'IntersectionObserver' in window) {
  pg.classList.add('anim');
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('vu');
      seen.unobserve(e.target);
      if (e.target.dataset.to) count(e.target);
    }
  }, { threshold: 0.15 });
  pg.querySelectorAll('[data-a],.wave,.draw,.fillbar,.stag,[data-to]').forEach((n) => seen.observe(n));
  // Les boucles d'une zone ne tournent que quand elle est à l'écran.
  const live = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.classList.toggle('act', e.isIntersecting);
  });
  pg.querySelectorAll('section').forEach((n) => live.observe(n));
}

renderAccount();
verifyAccount();

// Sommaire : le point de la section à l'écran s'allume ; sur téléphone, le
// bouton paraît une fois le booster passé, en remontant, et la liste se ferme
// après un choix.
const toc = document.getElementById('toc');
if (toc) {
  const btn = document.getElementById('toc-btn');
  const links = [...toc.querySelectorAll('a')];
  const setOpen = (open) => {
    toc.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => setOpen(!toc.classList.contains('open')));
  links.forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toc.classList.contains('open')) { setOpen(false); btn.focus(); }
  });
  document.addEventListener('click', (e) => { if (!toc.contains(e.target)) setOpen(false); });

  if ('IntersectionObserver' in window) {
    // Le bouton ne masque pas le texte qu'on lit : il se retire quand on descend
    // et revient dès qu'on remonte.
    const hero = document.getElementById('accueil');
    let pastHero = false;
    let goingUp = false;
    let lastY = scrollY;
    const showBtn = () => toc.classList.toggle('shown', pastHero && goingUp);
    new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting; showBtn(); }).observe(hero);
    addEventListener('scroll', () => {
      const y = scrollY;
      if (Math.abs(y - lastY) < 8) return;
      goingUp = y < lastY;
      lastY = y;
      if (!toc.classList.contains('open')) showBtn();
    }, { passive: true });
    // Une bande au milieu de l'écran : la section qui la traverse est la section en cours.
    const current = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a) => {
          const on = a.getAttribute('href') === '#' + e.target.id;
          a.classList.toggle('on', on);
          if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        });
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((a) => {
      const target = document.getElementById(a.getAttribute('href').slice(1));
      if (target) current.observe(target);
    });
  } else {
    toc.classList.add('shown');
  }
}
