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

// Le fil violet : une seule ligne qui descend la page. Elle part sous le booster,
// longe le bord droit dans les sections (là où il n'y a jamais de texte) et
// plonge vers le centre dans chaque espace entre deux sections. Elle se
// construit de haut en bas au rythme du défilement : la partie dessinée
// s'arrête aux trois quarts de l'écran.
const fil = $('fil');
if (fil) {
  const NS = 'http://www.w3.org/2000/svg';
  const make = (attrs) => {
    const n = document.createElementNS(NS, 'path');
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const mask = document.createElementNS(NS, 'mask');
  mask.id = 'fil-masque';
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  const reveal = make({ stroke: '#fff', 'stroke-width': '16' });
  mask.append(reveal);
  const line = make({ stroke: 'rgba(196,181,253,.6)', 'stroke-width': '6', 'stroke-dasharray': '12 16', mask: 'url(#fil-masque)' });
  fil.append(mask, line);

  let total = 0;
  let samples = []; // [longueur, y] le long du tracé, pour savoir jusqu'où dessiner

  const build = () => {
    const W = pg.clientWidth;
    const H = pg.scrollHeight;
    const top0 = pg.getBoundingClientRect().top;
    const desk = W >= 900;
    const inRight = Math.min(W, (W + 1240) / 2);
    const gx = inRight - (desk ? 24 : 7);
    const gaps = [...pg.querySelectorAll('.wave')].map((g) => {
      const r = g.getBoundingClientRect();
      return { t: r.top - top0, b: r.bottom - top0 };
    });
    if (!gaps.length) return;
    const cx = W / 2;
    const first = gaps[0];
    let d = 'M' + cx + ' ' + first.t;
    // Du dessous du booster vers le bord droit
    const fb = Math.max(first.b, first.t + 60);
    d += ' C' + cx + ' ' + (first.t + (fb - first.t) * 0.6) + ' ' + gx + ' ' + (first.t + (fb - first.t) * 0.4) + ' ' + gx + ' ' + fb;
    gaps.slice(1).forEach((g, i) => {
      const m = (g.t + g.b) / 2;
      const last = i === gaps.length - 2;
      const dip = W * (i % 2 ? 0.62 : 0.38);
      d += ' L' + gx + ' ' + g.t;
      if (last) {
        // Le fil finit au centre, juste au-dessus du pied de page
        d += ' C' + gx + ' ' + m + ' ' + cx + ' ' + g.t + ' ' + cx + ' ' + g.b;
      } else {
        d += ' C' + gx + ' ' + m + ' ' + dip + ' ' + g.t + ' ' + dip + ' ' + m;
        d += ' C' + dip + ' ' + g.b + ' ' + gx + ' ' + m + ' ' + gx + ' ' + g.b;
      }
    });
    fil.setAttribute('width', W);
    fil.setAttribute('height', H);
    fil.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    for (const [k, v] of [['x', 0], ['y', 0], ['width', W], ['height', H]]) mask.setAttribute(k, v);
    // Sur téléphone, un trait plus fin : la marge du bord droit ne fait que 16 px.
    line.setAttribute('stroke-width', desk ? '6' : '4');
    line.setAttribute('stroke-dasharray', desk ? '12 16' : '10 14');
    line.setAttribute('d', d);
    reveal.setAttribute('d', d);
    total = line.getTotalLength();
    samples = [];
    for (let l = 0; l <= total; l += 12) samples.push([l, line.getPointAtLength(l).y]);
    samples.push([total, line.getPointAtLength(total).y]);
    reveal.setAttribute('stroke-dasharray', total + ' ' + total);
    draw();
  };

  const draw = () => {
    if (!total) return;
    let len = total;
    if (!reduced) {
      // La première longueur dont le point passe sous la ligne de lecture
      const target = innerHeight * 0.75 - pg.getBoundingClientRect().top;
      len = 0;
      for (const [l, y] of samples) { if (y > target) break; len = l; }
    }
    reveal.setAttribute('stroke-dashoffset', String(total - len));
  };

  const ask = (fn) => {
    let queued = false;
    return () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; fn(); }); } };
  };
  addEventListener('scroll', ask(draw), { passive: true });
  // Le tracé suit la mise en page : images qui se chargent, booster qui s'ouvre, rotation…
  if ('ResizeObserver' in window) new ResizeObserver(ask(build)).observe(pg);
  addEventListener('resize', ask(build));
  addEventListener('load', build);
  build();
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
