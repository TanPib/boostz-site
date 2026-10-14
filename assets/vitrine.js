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

// LA SCÈNE GARDE SA HAUTEUR PENDANT L'OUVERTURE (14/10/2026). Le booster
// s'efface et la consigne se replie tout de suite, quand l'éventail, le nom du
// jeu et « 8 TCG couverts » n'arrivent qu'avec un délai : la scène perdait
// environ 200 px en 0,4 s puis les reprenait, et tout ce qui l'entoure sautait
// (sur ordinateur, le texte de gauche, centré sur elle, montait de 100 px puis
// redescendait). La fermeture faisait l'inverse : le booster revient avant que
// « 8 TCG couverts » ne parte, et la scène prenait 180 px de trop un instant.
// Fermée, elle est plus haute qu'ouverte : sa hauteur de départ est tenue dans
// les deux sens. Ce qui dépasse un instant à la fermeture déborde sur le fil,
// encore déplié dessous, sans rien pousser.
let release = null;
function holdHeight() {
  clearTimeout(release);
  if (!stage.style.height) stage.style.height = stage.offsetHeight + 'px';
}
addEventListener('resize', () => { stage.style.height = ''; });

function open() {
  if (pg.classList.contains('is-open')) return;
  holdHeight();
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
  // Refermée, la scène retrouve d'elle-même sa hauteur de départ : la tenue
  // se lâche une fois les transitions finies, sauf si on a rouvert entre-temps.
  release = setTimeout(() => { if (!pg.classList.contains('is-open')) stage.style.height = ''; }, 1500);
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

// Le fil violet : une seule ligne qui descend la page en serpentant, du dessous
// du booster jusqu'au pied de page. Elle se construit de haut en bas au rythme
// du défilement : la partie dessinée s'arrête aux trois quarts de l'écran.
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

  // LE FIL S'EFFACE SOUS LE TEXTE (14/10/2026). Il passe bien sous le contenu,
  // mais un texte n'a pas de fond : ses pointillés se voyaient entre les
  // lettres (« LANGUES SERVIES AU 23 SEPTEMBRE 2026 », signalé par TanPib).
  // Chaque ligne de texte que le fil frôle découpe le masque, au plus près de
  // ses lettres. Une révélation en cours décale le texte (propriété
  // translate) : c'est sa place finale qu'on découpe.
  const trous = document.createElementNS(NS, 'g');
  mask.append(trous);
  const TEXTE = ['h1', 'h2', 'h3', 'p', 'li', 'summary', 'dt', 'dd', 'figcaption', 'label', '.gn', '.btn'].map((s) => 'main ' + s).join(', ');
  const decalage = (el) => {
    let x = 0;
    let y = 0;
    for (let n = el; n && n !== pg; n = n.parentElement) {
      const t = getComputedStyle(n).translate;
      if (t && t !== 'none') {
        const [a, b = '0'] = t.split(' ');
        x += parseFloat(a) || 0;
        y += parseFloat(b) || 0;
      }
    }
    return [x, y];
  };
  const gommer = (left0, top0) => {
    trous.replaceChildren();
    // Les points du tracé, rangés par bandes de 40 px de haut.
    const bandes = new Map();
    for (let l = 0; l <= total; l += 6) {
      const p = line.getPointAtLength(l);
      const k = Math.floor(p.y / 40);
      if (!bandes.has(k)) bandes.set(k, []);
      bandes.get(k).push(p);
    }
    // Seul un trait qui passe à moins de 5 px des lettres ouvre un trou, qui
    // déborde ensuite de 6 px pour laisser de l'air. Sur téléphone, le fil
    // longe le texte dans la marge (7 px du bord, le texte commence à 16) :
    // mesurer depuis le trou lui-même l'effaçait sur des écrans entiers.
    const PAD = 6;
    const PROCHE = 5;
    const range = document.createRange();
    for (const el of pg.querySelectorAll(TEXTE)) {
      const [dx, dy] = decalage(el);
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        const lx = r.left - left0 - dx;
        const ly = r.top - top0 - dy;
        let frole = false;
        for (let k = Math.floor((ly - PROCHE) / 40); k <= Math.floor((ly + r.height + PROCHE) / 40) && !frole; k++) {
          for (const p of bandes.get(k) || []) {
            if (p.x > lx - PROCHE && p.x < lx + r.width + PROCHE && p.y > ly - PROCHE && p.y < ly + r.height + PROCHE) { frole = true; break; }
          }
        }
        const x = lx - PAD;
        const y = ly - PAD / 2;
        const w = r.width + 2 * PAD;
        const h = r.height + PAD;
        if (!frole) continue;
        const trou = document.createElementNS(NS, 'rect');
        for (const [k, v] of [['x', x], ['y', y], ['width', w], ['height', h], ['rx', 6], ['fill', '#000']]) trou.setAttribute(k, v);
        trous.append(trou);
      }
    }
  };

  let total = 0;
  let samples = []; // [longueur, y] le long du tracé, pour savoir jusqu'où dessiner

  // Le tracé est une suite de couloirs verticaux, reliés par des courbes en S.
  // Un couloir ne passe jamais sur du texte : dans la colonne des captures
  // (derrière les téléphones et les stickers), ou à côté d'un bloc de texte.
  // Les couloirs alternent de côté, si bien que le fil serpente sur toute la
  // largeur de la page.
  const build = () => {
    const W = pg.clientWidth;
    const H = pg.scrollHeight;
    const top0 = pg.getBoundingClientRect().top;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top - top0, b: r.bottom - top0, cx: (r.left + r.right) / 2 };
    };
    const desk = W >= 900;
    const cx = W / 2;
    const edge = desk ? 24 : 7;
    const gaps = [...pg.querySelectorAll('.wave')].map(box);
    if (!gaps.length) return;

    const lanes = [{ x: cx, t: gaps[0].t, b: gaps[0].t }];
    let side = 1; // 1 : à droite du centre, -1 : à gauche
    // À côté d'un bloc de texte : au milieu de l'espace libre, sinon dans la marge.
    const beside = (b, s) => {
      const room = s > 0 ? W - b.r : b.l;
      if (room >= 60) return s > 0 ? (b.r + W) / 2 : b.l / 2;
      return s > 0 ? W - edge : edge;
    };
    for (const sec of pg.querySelectorAll('main > section:not(.hero)')) {
      const vis = sec.querySelector('.zvis');
      const text = sec.querySelector('.ztext');
      if (vis && text) {
        const v = box(vis.firstElementChild || vis);
        const t = box(text);
        if (desk) {
          // La colonne des captures : elle change de côté d'une section à l'autre.
          lanes.push({ x: v.cx, t: Math.min(v.t, t.t), b: Math.max(v.b, t.b) });
          side = v.cx > cx ? -1 : 1;
        } else {
          // Le long du texte, puis en travers de la capture.
          lanes.push({ x: side > 0 ? W - edge : edge, t: t.t, b: t.b });
          lanes.push({ x: cx + side * -0.22 * W, t: v.t + 90, b: v.b - 20 });
          side = -side;
        }
      } else {
        const kids = [...sec.children].map(box).filter((k) => k.b > k.t);
        if (!kids.length) continue;
        const b = {
          l: Math.min(...kids.map((k) => k.l)), r: Math.max(...kids.map((k) => k.r)),
          t: Math.min(...kids.map((k) => k.t)), b: Math.max(...kids.map((k) => k.b))
        };
        lanes.push({ x: beside(b, side), t: b.t, b: b.b });
        side = -side;
      }
    }
    const last = gaps[gaps.length - 1];
    lanes.push({ x: cx, t: last.b, b: last.b });

    let d = 'M' + lanes[0].x + ' ' + lanes[0].t;
    lanes.forEach((ln, i) => {
      if (i) {
        const p = lanes[i - 1];
        const m = (p.b + ln.t) / 2;
        d += ' C' + p.x + ' ' + m + ' ' + ln.x + ' ' + m + ' ' + ln.x + ' ' + ln.t;
      }
      if (ln.b > ln.t) d += ' L' + ln.x + ' ' + ln.b;
    });
    fil.setAttribute('width', W);
    fil.setAttribute('height', H);
    fil.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    for (const [k, v] of [['x', 0], ['y', 0], ['width', W], ['height', H]]) mask.setAttribute(k, v);
    // Sur téléphone, un trait plus fin : les marges ne font que 16 px.
    line.setAttribute('stroke-width', desk ? '6' : '4');
    line.setAttribute('stroke-dasharray', desk ? '12 16' : '10 14');
    line.setAttribute('d', d);
    reveal.setAttribute('d', d);
    total = line.getTotalLength();
    samples = [];
    for (let l = 0; l <= total; l += 12) samples.push([l, line.getPointAtLength(l).y]);
    samples.push([total, line.getPointAtLength(total).y]);
    reveal.setAttribute('stroke-dasharray', total + ' ' + total);
    gommer(pg.getBoundingClientRect().left, top0);
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
