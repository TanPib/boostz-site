// La vue « Audience » de la console (18/10/2026) : les visites de boostz.fr
// par jour, semaine ou mois, d'où viennent les visiteurs, quelles pages ils
// lisent et sur quel appareil.
//
// Tout vient de GET /admin/audience?from&to&by (server/src/routes/
// siteAudience.js), alimenté par assets/mesure.js sur chaque page publique.
// Une VISITE commence quand on arrive sur le site depuis ailleurs (ou en tapant
// l'adresse) ; chaque page ouverte ensuite compte comme PAGE VUE, pas comme
// une nouvelle visite. Rien ne suit une personne : pas de visiteurs uniques.
//
// Une route absente (404) = serveur plus ancien que la console : la vue le dit.
// Tout texte venu de l'API passe par textContent (el()).
import { call } from './api.js';
import { el } from './chrome.js';
import { svg, svgText, showTick, niceMax, columnPath, tooltip, responsiveChart, int } from './revenue.js?v=2026-10-19e';

// La couleur des visites : celle du Pass mensuel, déjà validée sur le fond des
// cartes (#171221) par le script du skill dataviz.
const VISIT_COLOR = '#9085e9';

// Les fenêtres proposées, et le pas qui leur va par défaut.
const RANGES = [
  { id: '7', label: '7 jours', days: 7, by: 'day' },
  { id: '30', label: '30 jours', days: 30, by: 'day' },
  { id: '90', label: '3 mois', days: 90, by: 'week' },
  { id: '365', label: '12 mois', days: 365, by: 'month' }
];
const STEPS = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']];
const STEP_TITLE = { day: 'Visites par jour', week: 'Visites par semaine', month: 'Visites par mois' };

const au = { range: '30', by: 'day', status: 'idle', data: null, error: null, seq: 0, table: false };

// Aujourd'hui à Paris, comme le serveur qui compte au jour de Paris.
function parisToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t) => parts.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const asDate = (key) => new Date((key.length === 7 ? key + '-01' : key) + 'T00:00:00Z');
const fmt = (key, opts) => asDate(key).toLocaleDateString('fr-FR', { timeZone: 'UTC', ...opts });
// Libellé court sous une colonne, et libellé long dans l'infobulle.
function periodShort(key, by) {
  if (by === 'month') return fmt(key, { month: 'short', year: '2-digit' });
  return fmt(key, { day: 'numeric', month: 'short' });
}
function periodLong(key, by) {
  if (by === 'month') return fmt(key, { month: 'long', year: 'numeric' });
  if (by === 'week') return 'Semaine du ' + fmt(key, { day: 'numeric', month: 'long' });
  return fmt(key, { weekday: 'long', day: 'numeric', month: 'long' });
}

async function load(rerender) {
  const seq = ++au.seq;
  const range = RANGES.find((r) => r.id === au.range) || RANGES[1];
  const to = parisToday();
  const from = addDays(to, -(range.days - 1));
  au.status = au.data ? 'refreshing' : 'loading';
  rerender();
  try {
    const data = await call(`/admin/audience?from=${from}&to=${to}&by=${au.by}`);
    if (seq !== au.seq) return;
    au.data = data;
    au.status = 'ready';
    au.error = null;
  } catch (e) {
    if (seq !== au.seq) return;
    au.status = e.status === 404 ? 'absent' : 'error';
    au.error = e.message;
  }
  rerender();
}

function filters(rerender) {
  const tab = (active, label, onclick) => el('button', { class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(active), onclick }, label);
  return el('div', { class: 'rv-filters' },
    el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Période' },
      RANGES.map((r) => tab(au.range === r.id, r.label, () => { au.range = r.id; au.by = r.by; load(rerender); }))),
    el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Pas du graphique' },
      STEPS.map(([id, label]) => tab(au.by === id, label, () => { au.by = id; load(rerender); })))
  );
}

function kpi(label, value, note) {
  return el('div', { class: 'bz-card is-tight adm-kpi' },
    el('span', { class: 'bz-eyebrow', text: label }),
    el('div', { class: 'adm-kpi-value', text: value }),
    note ? el('span', { class: 'bz-tiny', text: note }) : null);
}

// Les visites par période, en colonnes ; l'infobulle ajoute les pages vues.
function visitsChart(d, phone) {
  return responsiveChart((host, W) => {
    const rows = d.series || [];
    const H = phone ? 190 : 230;
    const m = { top: 18, right: 8, bottom: 24, left: phone ? 34 : 42 };
    const pw = W - m.left - m.right;
    const ph = H - m.top - m.bottom;
    const max = niceMax(Math.max(0, ...rows.map((r) => r.visits)));
    const band = pw / Math.max(1, rows.length);
    const bw = Math.max(2, Math.min(24, band * 0.62));
    const y = (v) => m.top + ph - (v / max) * ph;
    const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': STEP_TITLE[d.by] });
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      root.append(svg('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), class: i ? 'rv-gridline' : 'rv-base' }));
      // Des visites se comptent en entiers : pas de graduation à virgule.
      if (Number.isInteger(v)) root.append(svgText({ x: m.left - 6, y: y(v) + 3, class: 'rv-tick', 'text-anchor': 'end' }, int(v)));
    }
    const every = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(pw / (phone ? 46 : 56)))));
    const tip = tooltip(host);
    rows.forEach((row, i) => {
      const cx = m.left + band * i + band / 2;
      if (row.visits > 0) {
        const top = y(row.visits);
        root.append(svg('path', { d: columnPath(cx - bw / 2, top, bw, Math.max(1, y(0) - top), 4), fill: VISIT_COLOR, class: 'rv-mark' }));
      }
      if (showTick(i, rows.length, every)) {
        root.append(svgText({ x: cx, y: H - 7, class: 'rv-tick', 'text-anchor': i === rows.length - 1 && rows.length > 1 ? 'end' : 'middle' }, periodShort(row.period, d.by)));
      }
      const hit = svg('rect', { x: m.left + band * i, y: m.top, width: band, height: ph, class: 'rv-hit', tabindex: 0,
        'aria-label': periodLong(row.period, d.by) + ' : ' + int(row.visits) + ' visites, ' + int(row.views) + ' pages vues' });
      const show = () => {
        root.querySelectorAll('.rv-hit.is-on').forEach((n) => n.classList.remove('is-on'));
        hit.classList.add('is-on');
        tip.show(cx, y(row.visits), periodLong(row.period, d.by), [
          { color: VISIT_COLOR, value: int(row.visits), label: row.visits > 1 ? 'visites' : 'visite' },
          { value: int(row.views), label: row.views > 1 ? 'pages vues' : 'page vue' }
        ]);
      };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', () => { hit.classList.remove('is-on'); tip.hide(); });
      hit.addEventListener('blur', () => { hit.classList.remove('is-on'); tip.hide(); });
      root.append(hit);
    });
    host.prepend(root);
  });
}

function seriesTable(d) {
  return el('div', { class: 'bz-table-wrap' },
    el('table', { class: 'bz-table rv-table' },
      el('thead', {}, el('tr', {}, el('th', { text: d.by === 'month' ? 'Mois' : d.by === 'week' ? 'Semaine' : 'Jour' }), el('th', { class: 'is-num', text: 'Visites' }), el('th', { class: 'is-num', text: 'Pages vues' }))),
      el('tbody', {}, (d.series || []).slice().reverse().map((r) =>
        el('tr', {}, el('td', { text: periodLong(r.period, d.by) }), el('td', { class: 'is-num', text: int(r.visits) }), el('td', { class: 'is-num', text: int(r.views) }))))
    ));
}

function seriesCard(d, phone, rerender) {
  const toggle = el('button', { class: 'bz-btn is-sm rv-table-btn', type: 'button', 'aria-pressed': String(au.table), text: au.table ? 'Graphique' : 'Tableau',
    onclick: () => { au.table = !au.table; rerender(); } });
  return el('section', { class: 'bz-card rv-card' },
    el('div', { class: 'rv-card-head' },
      el('div', {}, el('h3', { class: 'bz-h3', text: STEP_TITLE[d.by] }),
        el('p', { class: 'bz-tiny', text: 'Une visite commence quand on arrive sur le site ; les pages ouvertes ensuite sont des pages vues.' })),
      toggle),
    au.table ? seriesTable(d) : visitsChart(d, phone));
}

// Une répartition en barres horizontales : libellé, barre, valeur et part.
function barsCard(title, sub, items, key, unit) {
  const total = items.reduce((n, it) => n + it[key], 0);
  const top = Math.max(1, ...items.map((it) => it[key]));
  return el('section', { class: 'bz-card rv-card' },
    el('div', { class: 'rv-card-head' }, el('div', {}, el('h3', { class: 'bz-h3', text: title }), el('p', { class: 'bz-tiny', text: sub }))),
    items.length
      ? el('ul', { class: 'au-bars' }, items.map((it) => el('li', { class: 'au-bar' },
        el('span', { class: 'au-bar-label', text: it.label }),
        el('span', { class: 'au-bar-track', 'aria-hidden': 'true' }, el('span', { class: 'au-bar-fill', style: { width: Math.max(2, (it[key] / top) * 100) + '%', background: VISIT_COLOR } })),
        el('span', { class: 'au-bar-value' }, el('strong', { text: int(it[key]) }), el('span', { text: ' · ' + Math.round((it[key] / total) * 100) + ' %' })),
        el('span', { class: 'bz-sr', text: ' ' + unit }))))
      : el('p', { class: 'bz-tiny', style: { marginTop: '10px' }, text: 'Rien sur cette période.' }));
}

export function renderAudience({ phone, rerender }) {
  if (au.status === 'idle') {
    // Chargée à la première ouverture de l'onglet : la console reste rapide à
    // ouvrir pour qui ne vient pas voir l'audience.
    queueMicrotask(() => load(rerender));
  }
  const wrap = el('div', { style: { marginTop: phone ? '4px' : '18px' } });
  wrap.append(filters(rerender));
  if (au.status === 'idle' || au.status === 'loading') {
    wrap.append(el('p', { class: 'bz-tiny', style: { marginTop: '16px' }, text: 'Chargement de l’audience…' }));
    return wrap;
  }
  if (au.status === 'absent') {
    wrap.append(el('div', { class: 'bz-msg is-info', style: { marginTop: '16px' }, text: 'La mesure d’audience arrive avec la prochaine mise à jour du serveur. Les visites seront comptées dès qu’elle sera en ligne.' }));
    return wrap;
  }
  if (au.status === 'error' && !au.data) {
    wrap.append(el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '16px' }, text: au.error || 'Impossible de charger l’audience.' }));
    return wrap;
  }
  const d = au.data;
  const t = d.totals || { visits: 0, views: 0 };
  const today = (d.series || []).length && d.by === 'day' ? d.series[d.series.length - 1] : null;
  const body = el('div', { class: 'rv-body' + (au.status === 'refreshing' ? ' is-refreshing' : '') },
    el('div', { class: 'bz-grid adm-kpis au-kpis', style: { marginTop: '14px' } },
      kpi('Visites', int(t.visits)),
      kpi('Pages vues', int(t.views)),
      kpi('Pages par visite', t.visits ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(t.views / t.visits) : '—'),
      today ? kpi('Aujourd’hui', int(today.visits), today.visits > 1 ? 'visites' : 'visite') : null),
    !t.views ? el('div', { class: 'bz-msg is-note', style: { marginTop: '12px' }, text: 'Aucune visite enregistrée sur cette période. Le compteur tourne depuis le 18 octobre 2026.' }) : null,
    el('div', { class: 'rv-grid' }, seriesCard(d, phone, rerender)),
    el('div', { class: 'rv-grid au-split' },
      barsCard('Provenance', 'D’où arrivent les visites', d.sources || [], 'visits', 'visites'),
      barsCard('Pages', 'Les pages les plus lues', d.pages || [], 'views', 'pages vues'),
      barsCard('Appareils', 'Sur quoi on visite le site', d.devices || [], 'visits', 'visites')),
    el('p', { class: 'bz-tiny', style: { marginTop: '10px' }, text: 'Mesure anonyme, sans cookie : ni adresse IP, ni identifiant, seulement des compteurs par jour. Les robots sont écartés autant que possible. Un lien partagé avec ?utm_source=instagram (ou tiktok…) est rangé sous ce réseau même si son application ne dit pas d’où l’on vient.' }));
  wrap.append(body);
  if (au.status === 'error') wrap.append(el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '12px' }, text: au.error }));
  return wrap;
}
