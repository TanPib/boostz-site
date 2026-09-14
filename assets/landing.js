// Comportement de la landing, porté de la maquette « Boostz Experience ».
//
// Une seule boucle d'animation lit la progression de défilement de chaque scène
// et écrit directement les styles : pas de framework, pas de rendu. Quand le
// système demande moins de mouvement, les scènes sont posées d'emblée dans leur
// état final, sans curseur personnalisé, sans confettis ni son.
import { session, refreshMe, isVerifiedAdmin, clearSession } from './api.js';
import { el, put, clear, initialOf, lockIcon, accountButton } from './chrome.js';
import { TCGS, emblemSvg } from './tcg.js';
import { FRANCE_VIEWBOX, FRANCE_D, FRANCE_PINS } from './france.js';

const $ = (id) => document.getElementById(id);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
// Sous 760 px, les scènes ne sont plus collantes (landing.css) : leur progression
// suit le passage du bloc dans l'écran au lieu de sa course de défilement.
const compactQuery = window.matchMedia('(max-width: 760px)');
const ease = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const hexA = (hex, alpha) => hex + alpha; // #RRGGBB + AA

// ---------- En-tête et pied de page selon la session ----------
// Le bouton « Admin » n'apparaît qu'une fois le rôle confirmé par le serveur :
// l'en-tête est d'abord dessiné sans lui, puis redessiné après /auth/me. Une session
// trafiquée ou périmée ne montre donc jamais d'accès d'administration.
function renderAccount() {
  const s = session();
  const nav = clear($('lp-account'));
  const locks = document.querySelectorAll('[data-lock]');
  if (s && s.user) {
    put(nav,
      el('a', { class: 'bz-top-link bz-hide-sm', href: 'compte.html', 'data-cur': '1', text: 'Mon compte' }),
      isVerifiedAdmin() ? el('a', { class: 'bz-btn is-violet is-sm bz-hide-sm', href: 'admin.html', 'data-cur': '1', text: 'Admin' }) : null,
      el('span', { class: 'bz-avatar bz-hide-sm', 'aria-hidden': 'true', text: initialOf(s.user) }),
      // Téléphone : le menu du compte, comme sur les autres pages du site.
      accountButton(s.user, { logout: () => { clearSession(); renderAccount(); } })
    );
    for (const slot of locks) slot.hidden = true;
    $('foot-note').hidden = true;
  } else {
    put(nav, el('a', { class: 'bz-btn is-primary is-sm', href: 'connexion.html', 'data-cur': '1', text: 'Se connecter' }));
    for (const slot of locks) {
      if (!slot.firstChild) slot.append(lockIcon(11));
      slot.hidden = false;
    }
    $('foot-note').hidden = false;
  }
}

async function verifyAccount() {
  if (!session()) return;
  try {
    await refreshMe();
  } catch {
    // 401 : call() a déjà effacé la session, l'en-tête repasse en « Se connecter ».
    // Serveur injoignable : on reste sans bouton Admin, faute de confirmation.
  }
  renderAccount();
}

// ---------- Curseur personnalisé ----------
const cursor = { on: false, mx: innerWidth / 2, my: innerHeight / 2, cx: 0, cy: 0, rx: 0, ry: 0, big: false };
function setupCursor() {
  if (!finePointer || reduced) return;
  cursor.on = true;
  cursor.cx = cursor.rx = cursor.mx;
  cursor.cy = cursor.ry = cursor.my;
  $('cursor-dot').hidden = false;
  $('cursor-ring').hidden = false;
  document.body.classList.add('has-cursor');
  addEventListener('mousemove', (e) => { cursor.mx = e.clientX; cursor.my = e.clientY; }, { passive: true });
  addEventListener('mouseover', (e) => { cursor.big = !!(e.target.closest && e.target.closest('[data-cur], a, button')); }, { passive: true });
}

// ---------- Confettis et son ----------
function confetti(colors) {
  if (reduced) return;
  const layer = $('confetti');
  for (let i = 0; i < 30; i++) {
    const s = document.createElement('span');
    s.style.width = (5 + Math.random() * 6) + 'px';
    s.style.height = (8 + Math.random() * 9) + 'px';
    s.style.background = colors[i % colors.length];
    s.style.setProperty('--cx', ((Math.random() * 2 - 1) * 44) + 'vw');
    s.style.setProperty('--cy', (40 + Math.random() * 44) + 'vh');
    s.style.setProperty('--cr', Math.round(Math.random() * 720 - 360) + 'deg');
    s.style.setProperty('--d', (1 + Math.random() * 0.9) + 's');
    layer.append(s);
    setTimeout(() => s.remove(), 2200);
  }
}

let audio = null;
function ripSound() {
  if (reduced) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = audio || new AC();
    if (audio.state === 'suspended') audio.resume();
    const dur = 0.42;
    const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * dur), audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 1.5) * (1 + 2.4 * Math.exp(-Math.pow((t - 0.06) * 16, 2)));
    }
    const src = audio.createBufferSource();
    src.buffer = buf;
    const bp = audio.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(2800, audio.currentTime);
    bp.frequency.exponentialRampToValueAtTime(380, audio.currentTime + dur);
    const g = audio.createGain();
    g.gain.setValueAtTime(0.6, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audio.currentTime + dur);
    src.connect(bp); bp.connect(g); g.connect(audio.destination);
    src.start();
  } catch {
    // Le son est un bonus ; son absence ne doit rien casser.
  }
}

// ---------- 01 · Booster ----------
const GAME_ORDER = ['pkm', 'ygo', 'opc', 'lor', 'swu', 'mtg', 'acr', 'dbs', 'wow'];
const pack = { opened: false, tear: 0, drag: false, px: 0 };

function openPack() {
  if (pack.opened) return;
  pack.opened = true;
  ripSound();
  $('pack').hidden = true;
  $('hint-sealed').hidden = true;
  $('opened').hidden = false;
  $('hint-opened').hidden = false;
  const burst = $('burst');
  GAME_ORDER.forEach((id, i) => {
    const t = TCGS[id];
    const ang = (-90 + i * 40) * Math.PI / 180;
    // Le rayon suit la largeur de l'écran : sur un téléphone, les cartes éjectées
    // doivent rester dans le cadre et ne pas recouvrir le texte du dessous.
    const rad = Math.min(218, innerWidth * 0.42) + (i % 2) * Math.min(30, innerWidth * 0.05);
    const card = el('div', { class: 'lp-burst-card' },
      el('span', { class: 'lp-hatch is-strong' }),
      el('span', { class: 'win' }, emblemSvg(id, 30, 8)),
      el('span', { class: 'name', text: t.short })
    );
    card.style.border = '1px solid ' + hexA(t.c1, '8C');
    card.style.background = `radial-gradient(60px 46px at 50% 34%, ${hexA(t.c1, '75')}, transparent 76%), linear-gradient(165deg, ${hexA(t.c2, '33')}, #131020)`;
    card.style.setProperty('--bx', Math.round(Math.cos(ang) * rad) + 'px');
    card.style.setProperty('--by', Math.round(Math.sin(ang) * rad * 0.8) + 'px');
    card.style.setProperty('--br', ((i % 2 ? 1 : -1) * (7 + i * 2)) + 'deg');
    card.style.animationDelay = (i * 0.05).toFixed(2) + 's';
    burst.append(card);
  });
  confetti(['#FF4FA0', '#8B3DFF', '#3AA9FF', '#FCD34D']);
  $('hero-card').focus && $('hero-card').setAttribute('tabindex', '-1');
}

function applyTear(t) {
  pack.tear = Math.min(1, t);
  const top = $('pack-top');
  const box = $('pack');
  top.style.transform = `translateX(${pack.tear * 78}%) rotate(${pack.tear * 7}deg)`;
  top.style.opacity = String(1 - pack.tear * 0.25);
  box.style.animation = pack.tear > 0 ? 'bzShake .22s linear infinite' : '';
  if (pack.tear >= 1) {
    top.style.animation = 'bzTearFly .5s ease both';
    setTimeout(openPack, reduced ? 0 : 200);
  }
}

function setupPack() {
  const box = $('pack');
  const resetTear = () => {
    if (pack.opened || pack.tear >= 1) return;
    const top = $('pack-top');
    pack.tear = 0;
    box.style.animation = '';
    top.style.transition = 'transform .3s, opacity .3s';
    top.style.transform = '';
    top.style.opacity = '1';
    setTimeout(() => { top.style.transition = ''; }, 330);
  };
  box.addEventListener('pointerdown', (e) => {
    pack.drag = true;
    pack.moved = false;
    pack.px = e.clientX;
    if (box.setPointerCapture) box.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', (e) => {
    if (!pack.drag || pack.opened) return;
    const dx = e.clientX - pack.px;
    pack.px = e.clientX;
    if (dx > 0) { pack.moved = true; applyTear(pack.tear + dx / 190); }
  });
  const up = () => {
    if (!pack.drag) return;
    pack.drag = false;
    if (pack.moved) resetTear();
  };
  box.addEventListener('pointerup', up);
  box.addEventListener('pointercancel', up);
  box.addEventListener('click', () => {
    if (pack.opened || pack.moved) return;
    applyTear(pack.tear + 0.36);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      applyTear(1);
    }
  });
  $('hero-emblem').append(emblemSvg('pkm', 76, 16));
}

// ---------- Inclinaison des cartes au survol ----------
const tilting = new WeakSet();
function setupTilt(node) {
  if (!node || reduced || !finePointer) return;
  node.addEventListener('mousemove', (e) => {
    tilting.add(node);
    const r = node.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    node.style.transition = 'none';
    node.style.transform = `perspective(900px) rotateY(${(x * 24).toFixed(1)}deg) rotateX(${(-y * 19).toFixed(1)}deg)`;
    const gloss = node.querySelector('[data-gloss]');
    if (gloss) gloss.style.background = `radial-gradient(260px circle at ${((x + 0.5) * 100).toFixed(1)}% ${((y + 0.5) * 100).toFixed(1)}%, rgba(255,255,255,.34), transparent 62%)`;
    const holo = node.querySelector('[data-holo]');
    if (holo) holo.style.backgroundPosition = `${((x + 0.5) * 100).toFixed(1)}% ${((y + 0.5) * 100).toFixed(1)}%`;
  });
  node.addEventListener('mouseleave', () => {
    tilting.delete(node);
    node.style.transition = 'transform .6s cubic-bezier(.2,.7,.3,1)';
    node.style.transform = 'perspective(900px) rotateY(0deg) rotateX(0deg)';
    const gloss = node.querySelector('[data-gloss]');
    if (gloss) gloss.style.background = 'none';
  });
}

// ---------- 03 · Tri automatique ----------
const SORT = [{ g: 0, x: 14, y: 8, r: -16 }, { g: 1, x: 98, y: -2, r: 10 }, { g: 2, x: 182, y: 12, r: -7 }, { g: 0, x: 40, y: 66, r: 18 }, { g: 2, x: 128, y: 54, r: -12 }, { g: 1, x: 212, y: 60, r: 14 }, { g: 0, x: 72, y: 116, r: -9 }, { g: 1, x: 156, y: 108, r: 7 }, { g: 2, x: 228, y: 118, r: 22 }];
const SJ = [0, 1, 2, 0, 1, 2, 0, 1, 2];
const BINX = [23, 123, 223];
const BINS = [{ id: 'pkm', base: 128, tot: 165 }, { id: 'lor', base: 52, tot: 204 }, { id: 'opc', base: 87, tot: 121 }];
const scan = { cards: [], bins: [] };

function setupScan() {
  const loose = $('loose');
  SORT.forEach((d) => {
    const t = TCGS[BINS[d.g].id];
    const card = el('div', { class: 'lp-loose-card' }, emblemSvg(BINS[d.g].id, 17, 5));
    card.style.left = d.x + 'px';
    card.style.top = d.y + 'px';
    card.style.border = '1px solid ' + hexA(t.c1, '6B');
    card.style.background = `radial-gradient(26px 22px at 50% 38%, ${hexA(t.c1, '5E')}, transparent 78%), linear-gradient(160deg, ${hexA(t.c2, '2E')}, #131020)`;
    card.style.transform = `rotate(${d.r}deg)`;
    loose.append(card);
    scan.cards.push(card);
  });
  const bins = $('bins');
  BINS.forEach((b) => {
    const t = TCGS[b.id];
    const count = el('b', { text: b.base + ' / ' + b.tot });
    const bar = el('i');
    bar.style.width = (b.base / b.tot * 100).toFixed(1) + '%';
    bar.style.background = `linear-gradient(90deg, ${t.c1}, ${t.c2})`;
    const node = el('div', { class: 'lp-bin' }, emblemSvg(b.id, 16, 5), el('span', { text: t.short }), count, el('span', { class: 'bar' }, bar));
    bins.append(node);
    scan.bins.push({ node, count, bar });
  });
}

// ---------- 07 · Jeux ----------
const GAMES = [
  { id: 'pkm', tag: 'Le TCG le plus collectionné au monde.', cov: 'Cartes et scellés cotés' },
  { id: 'ygo', tag: 'Le doyen japonais, toujours bien vivant.', cov: 'Cartes et scellés cotés' },
  { id: 'opc', tag: 'La hype du moment, tirée par l’anime.', cov: 'Cartes et scellés cotés' },
  { id: 'lor', tag: 'Le phénomène Disney, avec ses vraies illustrations françaises.', cov: 'Cartes et scellés cotés' },
  { id: 'swu', tag: 'Le petit dernier, déjà très joué.', cov: 'Cartes et scellés cotés' },
  { id: 'mtg', tag: 'Trente ans de jeu, un marché immense.', cov: 'Cartes et scellés cotés' },
  { id: 'acr', tag: 'Les cartes amiibo, pur plaisir de collection.', cov: 'Cartes cotées, pas de scellé' },
  { id: 'dbs', tag: 'Le shōnen roi, en format cartes.', cov: 'Cartes et scellés cotés' },
  { id: 'wow', tag: 'Catalogue figé depuis 2013 : le paradis du chineur.', cov: 'Cotes partielles, catalogue figé' }
];
let currentGame = 'pkm';
const tiles = new Map();

function renderGame() {
  const g = GAMES.find((x) => x.id === currentGame);
  const t = TCGS[g.id];
  for (const [id, node] of tiles) {
    const on = id === currentGame;
    const c = TCGS[id];
    node.setAttribute('aria-pressed', String(on));
    node.style.background = on ? `linear-gradient(150deg, ${hexA(c.c1, '26')}, ${hexA(c.c2, '12')})` : '';
    node.style.borderColor = on ? c.c1 : '';
    node.querySelector('small').style.color = on ? c.c1 : '';
  }
  $('jeux-glow').style.background = `radial-gradient(760px 500px at 50% 20%, ${hexA(t.c1, '1A')}, transparent 72%)`;
  $('jeux-dot').style.background = `linear-gradient(135deg, ${t.c1}, ${t.c2})`;
  $('jeux-name').textContent = t.name;
  $('jeux-tag').textContent = g.tag;
  $('jeux-cov').textContent = g.cov;
}

function setupGames() {
  const host = $('game-tiles');
  for (const g of GAMES) {
    const t = TCGS[g.id];
    const tile = el('button', { class: 'lp-tile', type: 'button', role: 'listitem', 'data-cur': '1', onclick: () => { currentGame = g.id; renderGame(); } },
      emblemSvg(g.id, 26, 9), el('b', { text: t.name }), el('small', { text: g.cov }));
    host.append(tile);
    tiles.set(g.id, tile);
  }
  renderGame();
}

// ---------- 08 · Carte de France ----------
const map = { pins: [], shown: -1 };
const PIN_COLORS = { brocante: '#FF4FA0', boutique: '#8B3DFF', tournoi: '#3AA9FF' };

function setupMap() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = $('france');
  svg.setAttribute('viewBox', FRANCE_VIEWBOX);
  const outline = document.createElementNS(NS, 'path');
  outline.setAttribute('d', FRANCE_D);
  outline.setAttribute('fill', 'rgba(139,61,255,.10)');
  outline.setAttribute('stroke', 'rgba(190,180,215,.5)');
  outline.setAttribute('stroke-width', '1.4');
  outline.setAttribute('stroke-linejoin', 'round');
  svg.append(outline);
  for (const p of FRANCE_PINS) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${p.x},${p.y})`);
    g.style.opacity = '0';
    g.style.transition = 'opacity .35s';
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('r', '5');
    dot.setAttribute('fill', PIN_COLORS[p.t]);
    dot.setAttribute('stroke', '#fff');
    dot.setAttribute('stroke-width', '1.6');
    g.append(dot);
    if (p.label) {
      const w = p.label.length * 5.7 + 16;
      const lab = document.createElementNS(NS, 'g');
      lab.setAttribute('transform', 'translate(11,-9)');
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('y', '-12'); rect.setAttribute('rx', '9'); rect.setAttribute('width', String(w)); rect.setAttribute('height', '19');
      rect.setAttribute('fill', 'rgba(18,13,26,.9)'); rect.setAttribute('stroke', 'rgba(190,180,215,.4)');
      const text = document.createElementNS(NS, 'text');
      text.setAttribute('x', '8'); text.setAttribute('y', '1.5');
      text.setAttribute('font-family', 'DM Sans, sans-serif'); text.setAttribute('font-weight', '700'); text.setAttribute('font-size', '9.5'); text.setAttribute('fill', '#fff');
      text.textContent = p.label;
      lab.append(rect, text);
      g.append(lab);
    }
    svg.append(g);
    map.pins.push({ node: g, t: p.t });
  }
}

// ---------- 09 · Personnalisation ----------
const RAR = { commun: '#8A8F9C', rare: '#3AA9FF', epique: '#8B3DFF', legendaire: '#F5A623', mythique: '#FF4FA0' };
const RAR_TEXT = { commun: '#A6ABB7', rare: '#7FC9FF', epique: '#B58BFF', legendaire: '#F5A623', mythique: '#FF7AB8' };
const RARL = { commun: 'COMMUN', rare: 'RARE', epique: 'ÉPIQUE', legendaire: 'LÉGENDAIRE', mythique: 'MYTHIQUE' };
const AVS = [
  { n: 'Étincelle', bg: 'linear-gradient(135deg,#8B3DFF,#FF4FA0)', gly: 'M13 2 4 14h6l-3 8 10-12h-6l2-8Z', r: 'epique' },
  { n: 'Braise', bg: 'linear-gradient(135deg,#FF4FA0,#F5A623)', gly: 'M12 2c3.2 3.8 6 6.4 6 10a6 6 0 1 1-12 0c0-2.2 1.1-4.2 3-6.2.1 1.9.9 3 2.1 3.6C10.6 6.9 11.2 4.4 12 2Z', r: 'legendaire' },
  { n: 'Marée', bg: 'linear-gradient(135deg,#3AA9FF,#35C6BC)', gly: 'M12 1.8l2.6 6.2 6.7.5-5.1 4.4 1.6 6.5L12 15.9l-5.8 3.5 1.6-6.5-5.1-4.4 6.7-.5L12 1.8Z', r: 'rare' }
];
const FRS = [
  { n: 'Acier', b: '3px solid #8A8F9C', glow: '0 6px 20px rgba(0,0,0,.4)', r: 'commun' },
  { n: 'Or massif', b: '3px solid #F5A623', glow: '0 0 24px rgba(245,166,35,.55)', r: 'legendaire' },
  { n: 'Prisme', b: '3px solid #FF4FA0', glow: '0 0 26px rgba(255,79,160,.6)', r: 'mythique', anim: true }
];
const BNS = [
  { n: 'Nébuleuse', bg: 'radial-gradient(220px 90px at 72% 18%,rgba(255,79,160,.45),transparent 70%),linear-gradient(120deg,#2A1547,#120B20)', r: 'epique' },
  { n: 'Zénith', bg: 'linear-gradient(120deg,#3A1810,#7A2E4B 60%,#B3543F)', r: 'legendaire' },
  { n: 'Abysses', bg: 'radial-gradient(200px 80px at 30% 20%,rgba(58,169,255,.35),transparent 70%),linear-gradient(120deg,#081A30,#0E3B46)', r: 'rare' }
];
const TIS = [{ n: 'Dresseur du dimanche', r: 'commun' }, { n: 'Chasseur de holos', r: 'epique' }, { n: 'Légende de la commu', r: 'legendaire' }];
const pf = { av: 0, fr: 1, bn: 0, ti: 1 };
const optionButtons = { av: [], fr: [], bn: [], ti: [] };

function renderProfile() {
  const av = AVS[pf.av], fr = FRS[pf.fr], bn = BNS[pf.bn], ti = TIS[pf.ti];
  $('pf-banner').style.background = bn.bg;
  const avatar = $('pf-avatar');
  avatar.style.background = av.bg;
  avatar.style.border = fr.b;
  avatar.style.boxShadow = fr.glow;
  avatar.style.animation = fr.anim && !reduced ? 'bzHueSpin 7s linear infinite' : 'none';
  $('pf-glyph').setAttribute('d', av.gly);
  const rar = $('pf-rar');
  rar.textContent = RARL[fr.r];
  rar.style.color = RAR_TEXT[fr.r];
  const title = $('pf-title');
  title.textContent = ti.n;
  title.style.color = RAR_TEXT[ti.r];
  for (const key of Object.keys(optionButtons)) {
    optionButtons[key].forEach((btn, i) => btn.setAttribute('aria-pressed', String(pf[key] === i)));
  }
}

function setupProfile() {
  const pick = (key, i) => () => { pf[key] = i; renderProfile(); };
  const dot = (r) => { const d = el('span', { class: 'dot' }); d.style.background = RAR[r]; return d; };
  AVS.forEach((o, i) => {
    const face = el('span');
    Object.assign(face.style, { width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: o.bg });
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', '#fff');
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', o.gly); svg.append(p); face.append(svg);
    const b = el('button', { class: 'lp-opt', type: 'button', style: { borderRadius: '50%' }, 'aria-label': 'Avatar ' + o.n + ', ' + RARL[o.r].toLowerCase(), 'data-cur': '1', onclick: pick('av', i) }, face, dot(o.r));
    $('opt-av').append(b);
    optionButtons.av.push(b);
  });
  FRS.forEach((o, i) => {
    const face = el('span');
    Object.assign(face.style, { width: '40px', height: '40px', borderRadius: '50%', display: 'block', border: o.b, background: 'rgba(255,255,255,.05)', animation: o.anim && !reduced ? 'bzHueSpin 7s linear infinite' : 'none' });
    const b = el('button', { class: 'lp-opt', type: 'button', style: { borderRadius: '50%' }, 'aria-label': 'Cadre ' + o.n + ', ' + RARL[o.r].toLowerCase(), 'data-cur': '1', onclick: pick('fr', i) }, face, dot(o.r));
    $('opt-fr').append(b);
    optionButtons.fr.push(b);
  });
  BNS.forEach((o, i) => {
    const face = el('span');
    Object.assign(face.style, { width: '58px', height: '30px', borderRadius: '8px', display: 'block', background: o.bg, border: '1px solid rgba(255,255,255,.18)' });
    const b = el('button', { class: 'lp-opt', type: 'button', style: { borderRadius: '10px' }, 'aria-label': 'Bannière ' + o.n + ', ' + RARL[o.r].toLowerCase(), 'data-cur': '1', onclick: pick('bn', i) }, face, dot(o.r));
    $('opt-bn').append(b);
    optionButtons.bn.push(b);
  });
  TIS.forEach((o, i) => {
    const b = el('button', { class: 'lp-title-opt', type: 'button', 'data-cur': '1', onclick: pick('ti', i), text: o.n });
    b.style.color = RAR_TEXT[o.r];
    $('opt-ti').append(b);
    optionButtons.ti.push(b);
  });
  renderProfile();
}

// ---------- 10 · Téléphone ----------
function setupPhone() {
  ['pkm', 'lor', 'opc', 'ygo', 'pkm', 'swu'].forEach((id, i) => {
    const t = TCGS[id];
    const card = el('span', { class: 'lp-phone-card' }, emblemSvg(id, 18, 6), i === 4 ? el('span', { class: 'alert' }) : null);
    card.style.border = '1px solid ' + hexA(t.c1, '4D');
    card.style.background = `radial-gradient(40px 30px at 50% 36%, ${hexA(t.c1, '5E')}, transparent 76%), linear-gradient(160deg, ${hexA(t.c2, '2B')}, #131020)`;
    $('phone-cards').append(card);
  });
}

// ---------- Boucle ----------
const refs = {};
let lineLength = 800;
let lastFrame = 0;
let fitSize = '';
let anaStamp = false;
let swapDone = false;

function progress(node) {
  if (reduced) return 1;
  const r = node.getBoundingClientRect();
  if (compactQuery.matches) return clamp01((innerHeight * 0.85 - r.top) / Math.max(1, r.height * 0.75));
  const total = r.height - innerHeight;
  if (total <= 0) return 0;
  return clamp01(-r.top / total);
}

function frame() {
  lastFrame = performance.now();

  if (cursor.on) {
    cursor.cx += (cursor.mx - cursor.cx) * 0.3;
    cursor.cy += (cursor.my - cursor.cy) * 0.3;
    cursor.rx += (cursor.mx - cursor.rx) * 0.14;
    cursor.ry += (cursor.my - cursor.ry) * 0.14;
    refs.dot.style.transform = `translate(${cursor.cx - 4}px,${cursor.cy - 4}px)`;
    const size = cursor.big ? 54 : 34;
    refs.ring.style.width = size + 'px';
    refs.ring.style.height = size + 'px';
    refs.ring.style.transform = `translate(${cursor.rx - size / 2}px,${cursor.ry - size / 2}px)`;
    refs.ring.style.borderColor = cursor.big ? '#FF4FA0' : 'rgba(196,181,253,.85)';
  }

  // La scène de tri ne doit jamais dépasser l'écran : on la réduit si besoin.
  const size = innerWidth + 'x' + innerHeight;
  if (size !== fitSize) {
    fitSize = size;
    refs.scanFit.style.transform = 'none';
    const s = compactQuery.matches ? 1 : Math.min(1, (innerHeight - 30) / Math.max(1, refs.scanFit.scrollHeight));
    refs.scanFit.style.transform = s < 1 ? `scale(${s.toFixed(3)})` : 'none';
  }

  // 03 · Tri
  const ps = progress(refs.scan);
  const landed = [0, 0, 0];
  scan.cards.forEach((node, i) => {
    const d = SORT[i], j = SJ[i];
    const t = ease(clamp01((ps - (0.06 + i * 0.07)) / 0.2));
    const ex = BINX[d.g] + (j - 1) * 7 - d.x;
    const ey = 196 + j * 3 - d.y;
    node.style.transform = `translate(${(ex * t).toFixed(1)}px,${(ey * t).toFixed(1)}px) rotate(${(d.r * (1 - t)).toFixed(1)}deg) scale(${(1 - 0.44 * t).toFixed(3)})`;
    node.style.filter = `grayscale(${((1 - t) * 0.8).toFixed(2)})`;
    node.style.zIndex = t > 0 && t < 1 ? '6' : '2';
    if (t >= 1) landed[d.g]++;
  });
  scan.bins.forEach((b, g) => {
    const B = BINS[g];
    const c = B.base + landed[g];
    b.count.textContent = c + ' / ' + B.tot;
    b.bar.style.width = (c / B.tot * 100).toFixed(1) + '%';
    b.node.style.borderColor = landed[g] === 3 ? TCGS[B.id].c1 : '';
  });
  refs.scanCount.textContent = (448 + landed[0] + landed[1] + landed[2]) + ' cartes';

  // 04 · Cote
  const pi = progress(refs.invest);
  refs.invLine.style.strokeDasharray = String(lineLength);
  refs.invLine.style.strokeDashoffset = String((1 - ease(Math.min(1, pi * 1.25))) * lineLength);
  refs.invFill.style.opacity = String(Math.min(0.9, pi * 1.4));
  refs.invDot.style.opacity = pi > 0.72 ? '1' : '0';
  const value = Math.round((8420 + (12480 - 8420) * ease(Math.min(1, pi * 1.2))) / 5) * 5;
  refs.invVal.textContent = value.toLocaleString('fr-FR') + ' €';
  refs.invDelta.style.opacity = pi > 0.72 ? '1' : '0';
  refs.invDelta.style.transform = pi > 0.72 ? 'translateY(0)' : 'translateY(6px)';
  if (!tilting.has(refs.invCard)) refs.invCard.style.translate = '0 ' + ((1 - pi) * 44) + 'px';

  // 05 · Analyse
  const pa = progress(refs.analyse);
  refs.laser.style.top = (5 + Math.min(1, pa * 1.15) * 86) + '%';
  const targets = [85, 90, 75, 95];
  refs.grades.forEach((g, i) => {
    const t = clamp01((pa - 0.12 - i * 0.13) / 0.38);
    g.fill.style.width = (targets[i] * ease(t)) + '%';
    g.score.style.opacity = t > 0.95 ? '1' : '.25';
  });
  if (pa > 0.8 !== anaStamp) {
    anaStamp = pa > 0.8;
    refs.anaStamp.hidden = !anaStamp;
  }

  // 06 · Troc
  const pw = progress(refs.swap);
  const narrow = refs.swapStage.clientWidth < 520;
  const P = narrow ? Math.max(70, refs.swapStage.clientWidth / 2 - 66) : Math.max(140, refs.swapStage.clientWidth / 2 - 128);
  const meet = narrow ? 58 : 110;
  const t1 = ease(Math.min(1, pw / 0.5));
  const sw = ease(clamp01((pw - 0.56) / 0.22));
  const arc = -46 * Math.sin(Math.PI * sw);
  const xA = (-P + (P - meet) * t1) + sw * (meet + P);
  const xB = (P - (P - meet) * t1) - sw * (meet + P);
  refs.swapA.style.transform = `translate(${xA.toFixed(1)}px,${arc.toFixed(1)}px) rotate(${(-10 * (1 - t1) + 8 * sw).toFixed(1)}deg)`;
  refs.swapB.style.transform = `translate(${xB.toFixed(1)}px,${(-arc).toFixed(1)}px) rotate(${(10 * (1 - t1) - 8 * sw).toFixed(1)}deg)`;
  const done = pw > 0.8;
  for (const ring of refs.rings) ring.style.borderColor = done ? 'var(--fill-success)' : '';
  const chipOn = pw > 0.42 && pw < 0.8;
  refs.swapChip.style.opacity = chipOn ? '1' : '0';
  refs.swapChip.style.transform = `translateX(-50%) scale(${chipOn ? 1 : 0.7})`;
  if (done !== swapDone) {
    swapDone = done;
    refs.swapStamp.hidden = !done;
    refs.swapStars.hidden = !done;
    if (done) confetti(['#F5A623', '#FFF3C4', '#FF4FA0', '#3DDC97']);
  }

  // 08 · Carte
  const pm = progress(refs.map);
  const n = Math.round(ease(Math.min(1, pm * 1.15)) * map.pins.length);
  if (n !== map.shown) {
    map.shown = n;
    const count = { boutique: 0, brocante: 0, tournoi: 0 };
    map.pins.forEach((p, i) => {
      const on = i < n;
      p.node.style.opacity = on ? '1' : '0';
      if (on) count[p.t]++;
    });
    refs.cntBout.textContent = String(count.boutique);
    refs.cntBroc.textContent = String(count.brocante);
    refs.cntTour.textContent = String(count.tournoi);
  }
}

// L'en-tête est transparent sur le héros, puis prend un fond dès qu'on défile :
// sans lui, les titres des sections passaient sous le logo et le bouton.
function setupTopBar() {
  const bar = document.querySelector('.lp-top');
  if (!bar) return;
  const sync = () => bar.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', sync, { passive: true });
  sync();
}

function start() {
  renderAccount();
  verifyAccount();
  setupTopBar();
  setupCursor();
  setupPack();
  setupScan();
  setupGames();
  setupMap();
  setupProfile();
  setupPhone();
  $('inv-emblem').append(emblemSvg('pkm', 52, 12));
  $('ana-emblem').append(emblemSvg('pkm', 58, 13));
  $('swap-a-emblem').append(emblemSvg('pkm', 42, 10));
  $('swap-b-emblem').append(emblemSvg('lor', 42, 10));
  const lor = TCGS.lor;
  const swapB = $('swap-b');
  swapB.style.border = '1px solid ' + hexA(lor.c1, '80');
  swapB.style.background = `radial-gradient(94px 76px at 50% 32%, ${hexA(lor.c1, '75')}, transparent 75%), linear-gradient(165deg, ${hexA(lor.c2, '33')}, #131020)`;

  setupTilt($('hero-card'));
  setupTilt($('inv-card'));
  setupTilt($('phone'));

  Object.assign(refs, {
    dot: $('cursor-dot'), ring: $('cursor-ring'),
    scan: $('scan'), scanFit: $('scan-fit'), scanCount: $('scan-count'),
    invest: $('invest'), invLine: $('inv-line'), invFill: $('inv-fill'), invDot: $('inv-dot'), invVal: $('inv-val'), invDelta: $('inv-delta'), invCard: $('inv-card'),
    analyse: $('analyse'), laser: $('ana-laser'), anaStamp: $('ana-stamp'),
    grades: [...document.querySelectorAll('#ana-grades [data-g]')].map((g) => ({ fill: g.querySelector('[data-fill]'), score: g.querySelector('[data-score]') })),
    swap: $('echanges'), swapStage: $('swap-stage'), swapA: $('swap-a'), swapB,
    swapChip: $('swap-chip'), swapStamp: $('swap-stamp'), swapStars: $('swap-stars'),
    rings: [...document.querySelectorAll('#swap-stage [data-ring]')],
    map: $('autour'), cntBout: $('cnt-bout'), cntBroc: $('cnt-broc'), cntTour: $('cnt-tour')
  });
  if (refs.invLine.getTotalLength) lineLength = refs.invLine.getTotalLength();

  if (reduced) {
    // Pas de boucle : un seul rendu dans l'état final, et à chaque redimensionnement.
    frame();
    addEventListener('resize', frame);
    return;
  }
  const loop = () => {
    requestAnimationFrame(loop);
    frame();
  };
  requestAnimationFrame(loop);
  // Certains navigateurs suspendent requestAnimationFrame dans un onglet
  // intégré ; le filet reprend la main dès que la boucle cale.
  setInterval(() => { if (performance.now() - lastFrame > 60) frame(); }, 50);
}

start();
