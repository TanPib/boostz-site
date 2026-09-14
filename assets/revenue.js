// La vue « Revenus » de la console : Boostz Pass, abonnements, chiffre d'affaires.
//
// LES DONNÉES N'EXISTENT PAS ENCORE (14/09/2026). Côté serveur, le Pass se
// résume à UserSettings.passActiveUntil : aucune formule annuelle, aucun
// paiement, aucun historique. Cette vue est donc construite sur le contrat
// ci-dessous, que l'API devra tenir ; tant qu'elle ne le tient pas, la console
// dit « pas encore branché » et propose un aperçu avec des chiffres d'exemple,
// marqué comme tel à chaque instant.
//
// DEUX OFFRES, TOUTES DEUX À RENOUVELLEMENT AUTOMATIQUE : au mois et à l'année.
// Un abonnement se renouvelle donc toujours à son échéance, sauf résiliation ;
// la console parle d'échéance, jamais d'un « renouvellement oui / non ».
//
// 1) GET /admin/users : chaque compte porte `boostz_pass` - null s'il n'a jamais
//    été abonné. La clé absente de toutes les lignes = données pas branchées.
//    boostz_pass: {
//      status,               // active (se renouvellera à l'échéance)
//                            // | canceled (résilié : actif jusqu'à l'échéance, puis s'arrête)
//                            // | grace (paiement de renouvellement en échec, accès maintenu)
//                            // | expired
//      plan,                 // monthly (renouvelé chaque mois) | annual (renouvelé chaque année)
//      subscribed_since,     // début de l'abonnement continu en cours (ISO)
//      current_period_end,   // échéance : fin de la période payée (ISO)
//      will_renew,           // false dès que la résiliation est demandée
//      store,                // app_store | google_play | web | null
//      price_cents, currency // prix de la formule, ex. 499 / "EUR"
//    }
//
// 2) GET /admin/business/overview?months=12   (months : 6, 12 ou 24)
//    {
//      currency, as_of,
//      active:  { total, monthly, annual, canceling },  // abonnés actifs maintenant
//      mrr_cents,                                        // revenu mensuel récurrent (annuel / 12)
//      revenue: { this_month_cents, last_month_cents },  // encaissé, brut
//      new_this_month, churned_this_month,
//      churn_rate_pct,                                   // départs du mois / actifs au 1er
//      retention_pct: { m1, m3, m6, m12 },               // null tant qu'il n'y a pas le recul
//      months: [{ month: "2026-09",                      // du plus ancien au plus récent
//                 revenue_cents: { monthly, annual },
//                 active: { monthly, annual },            // actifs en fin de mois
//                 new: { monthly, annual }, churned: { monthly, annual } }],
//      cohorts: [{ month: "2026-03", plan,                // all | monthly | annual
//                  size, retained_pct: [100, 86, ...] }]  // M0, M1, M2… depuis le départ
//    }
//    Une route absente (404) = pas encore branchée. La console ne fait que lire.
//
// Tout texte venu de l'API passe par textContent (el() ou .textContent).

import { call } from './api.js';
import { el, clear, put, dateFr } from './chrome.js';

export const PLANS = { monthly: 'Mensuel', annual: 'Annuel' };
// Validées par le script du skill dataviz sur le fond des cartes (#171221) :
// écart de couleur 27,5 en vision normale, 27,3 pour la protanopie.
const PLAN_COLORS = { monthly: '#9085e9', annual: '#c98500' };
const PASS_STATUS = {
  active: ['Actif', 'bz-pill is-green'],
  canceled: ['Résilié', 'bz-pill is-amber'],
  grace: ['Paiement en échec', 'bz-pill is-red'],
  expired: ['Expiré', 'bz-pill is-grey']
};

const rv = { months: 12, plan: 'all', status: 'idle', data: null, error: null, demo: false, tables: new Set(), seq: 0 };

// ---------- Formats ----------
const DAY = 24 * 3600 * 1000;

export function money(cents, currency = 'EUR', { compact = false } = {}) {
  const value = (Number(cents) || 0) / 100;
  const whole = compact || Number.isInteger(value);
  if (compact && Math.abs(value) >= 10000) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(value);
}
const int = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);
const pct = (n) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n) + ' %');

function monthDate(key) {
  const [y, m] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1));
}
const monthShort = (key) => monthDate(key).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const monthLong = (key) => monthDate(key).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// « 4 mois », « 1 an et 2 mois », « 12 j ».
export function spanFr(fromIso, to = new Date()) {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return '';
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  if (months < 1) {
    const days = Math.max(0, Math.floor((to - from) / DAY));
    return days + ' j';
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return months + ' mois';
  return years + (years > 1 ? ' ans' : ' an') + (rest ? ' et ' + rest + ' mois' : '');
}

// Le Pass d'un compte, prêt à afficher. Null si jamais abonné.
export function passSummary(p, now = new Date()) {
  if (!p) return null;
  const end = p.current_period_end ? new Date(p.current_period_end) : null;
  const running = !!end && end > now && p.status !== 'expired';
  const [statusLabel, statusCls] = running ? (PASS_STATUS[p.status] || PASS_STATUS.active) : PASS_STATUS.expired;
  const left = end ? Math.ceil((end - now) / DAY) : null;
  return {
    active: running,
    plan: p.plan,
    planLabel: PLANS[p.plan] || p.plan || '—',
    statusLabel,
    statusCls,
    since: p.subscribed_since ? dateFr(p.subscribed_since) : '—',
    sinceSpan: running && p.subscribed_since ? spanFr(p.subscribed_since, now) : '',
    expires: end ? dateFr(end.toISOString()) : '—',
    expiresIn: running && left !== null ? (left <= 0 ? 'aujourd’hui' : 'dans ' + left + ' j') : '',
    willRenew: !!p.will_renew,
    price: p.price_cents ? money(p.price_cents, p.currency || 'EUR') : null
  };
}

export const hasPassData = (users) => Array.isArray(users) && users.some((u) => Object.prototype.hasOwnProperty.call(u, 'boostz_pass'));

// ---------- Données d'exemple (aperçu) ----------
// Déterministes, pour que deux ouvertures de l'aperçu montrent la même chose.
function rng(seed) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

function demoOverview(monthsWanted) {
  const r = rng(20260914);
  const PRICE_M = 499, PRICE_A = 4990;
  const total = 24;
  const now = new Date();
  const rows = [];
  let actM = 0, actA = 0;
  const annualStarts = [];
  for (let i = total - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    const t = total - i;
    const newM = Math.round(18 + t * 5.5 + r() * 12);
    const newA = Math.round(4 + t * 1.6 + r() * 5);
    const churnM = Math.round(actM * (0.055 + r() * 0.03));
    const renewIdx = annualStarts.length - 12;
    const due = renewIdx >= 0 ? annualStarts[renewIdx] : 0;
    const churnA = Math.round(due * (0.22 + r() * 0.08));
    actM = actM + newM - churnM;
    actA = actA + newA - churnA;
    annualStarts.push(newA);
    rows.push({
      month: key,
      revenue_cents: { monthly: actM * PRICE_M, annual: (newA + (due - churnA)) * PRICE_A },
      active: { monthly: actM, annual: actA },
      new: { monthly: newM, annual: newA },
      churned: { monthly: churnM, annual: churnA }
    });
  }
  const months = rows.slice(-monthsWanted);
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const startActive = prev.active.monthly + prev.active.annual;
  const churned = last.churned.monthly + last.churned.annual;
  const curve = (plan, k) => {
    const base = plan === 'annual' ? [100, 100, 99, 99, 98, 98, 97, 97, 96, 96, 95, 95, 74] : [100, 88, 80, 74, 70, 66, 63, 61, 59, 57, 55, 54, 52];
    return base.slice(0, k).map((v, i) => Math.max(0, Math.round(v - (i ? r() * 3 : 0))));
  };
  const cohorts = [];
  for (const plan of ['all', 'monthly', 'annual']) {
    rows.slice(-12).forEach((row, idx, arr) => {
      const size = plan === 'all' ? row.new.monthly + row.new.annual : row.new[plan];
      const age = arr.length - idx;
      let retained = plan === 'all'
        ? curve('monthly', age).map((v, i) => Math.round(v * 0.75 + (curve('annual', age)[i] || 0) * 0.25))
        : curve(plan, age);
      retained[0] = 100;
      cohorts.push({ month: row.month, plan, size, retained_pct: retained });
    });
  }
  return {
    currency: 'EUR',
    as_of: now.toISOString(),
    active: { total: last.active.monthly + last.active.annual, monthly: last.active.monthly, annual: last.active.annual, canceling: Math.round(last.active.monthly * 0.07) },
    mrr_cents: last.active.monthly * PRICE_M + Math.round((last.active.annual * PRICE_A) / 12),
    revenue: { this_month_cents: last.revenue_cents.monthly + last.revenue_cents.annual, last_month_cents: prev.revenue_cents.monthly + prev.revenue_cents.annual },
    new_this_month: last.new.monthly + last.new.annual,
    churned_this_month: churned,
    churn_rate_pct: startActive ? Math.round((churned / startActive) * 1000) / 10 : null,
    retention_pct: { m1: 89, m3: 76, m6: 67, m12: 58 },
    months,
    cohorts
  };
}

function demoSubscribers() {
  const r = rng(42);
  const names = ['exemple-ondine', 'exemple-pierre', 'exemple-flora', 'exemple-sacha', 'exemple-regis', 'exemple-iris', 'exemple-blaine', 'exemple-cynthia', 'exemple-lance', 'exemple-norman'];
  const now = Date.now();
  return names.map((pseudo, i) => {
    const plan = i % 3 === 1 ? 'annual' : 'monthly';
    const sinceDays = Math.round(20 + r() * 420);
    const periodDays = plan === 'annual' ? 365 : 30;
    const elapsed = sinceDays % periodDays;
    const status = i === 4 ? 'canceled' : i === 7 ? 'grace' : 'active';
    return {
      user: { id: 'exemple-' + i, pseudo, deleted: false },
      boostz_pass: {
        status, plan,
        subscribed_since: new Date(now - sinceDays * DAY).toISOString(),
        current_period_end: new Date(now + (periodDays - elapsed) * DAY).toISOString(),
        will_renew: status !== 'canceled',
        store: i % 2 ? 'app_store' : 'google_play',
        price_cents: plan === 'annual' ? 4990 : 499,
        currency: 'EUR'
      }
    };
  });
}

// ---------- Chargement ----------
async function load(rerender) {
  const seq = ++rv.seq;
  rv.status = rv.data ? 'refreshing' : 'loading';
  rv.error = null;
  try {
    const data = await call('/admin/business/overview?months=' + rv.months);
    if (seq !== rv.seq) return;
    rv.data = data;
    rv.status = 'ready';
  } catch (e) {
    if (seq !== rv.seq) return;
    if (e.status === 404) { rv.status = 'absent'; rv.data = null; }
    // Un rafraîchissement raté garde les chiffres déjà affichés, et le dit.
    else if (rv.data) { rv.status = 'ready'; rv.error = e.message; }
    else { rv.status = 'error'; rv.error = e.message; }
  }
  rerender();
}

// ---------- SVG ----------
const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) n.setAttribute(k, String(v));
  for (const c of kids.flat()) if (c) n.append(c);
  return n;
}
function svgText(attrs, text) {
  const t = svg('text', attrs);
  t.textContent = text;
  return t;
}

// Un libellé tous les `every` mois, et toujours le dernier ; celui qui tomberait
// trop près du dernier saute, sinon « août 26 » et « sept. 26 » se chevauchent.
function showTick(i, n, every) {
  if (i === n - 1) return true;
  return i % every === 0 && n - 1 - i >= every;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

// Colonne arrondie de 4 px côté donnée, carrée côté base.
function columnPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// Une infobulle par graphique : la valeur d'abord, le nom de la série ensuite.
function tooltip(host) {
  const tip = el('div', { class: 'rv-tip', role: 'status', hidden: true });
  host.append(tip);
  return {
    show(x, y, title, rows) {
      put(clear(tip), el('b', { class: 'rv-tip-title', text: title }),
        rows.map((row) => el('div', { class: 'rv-tip-row' },
          row.color ? el('span', { class: 'rv-tip-key', style: { background: row.color } }) : null,
          el('strong', { text: row.value }),
          el('span', { text: row.label }))));
      tip.hidden = false;
      const hw = host.clientWidth;
      const tw = tip.offsetWidth;
      const left = Math.max(4, Math.min(hw - tw - 4, x + 12));
      tip.style.left = left + 'px';
      tip.style.top = Math.max(0, y - tip.offsetHeight - 10) + 'px';
    },
    hide() { tip.hidden = true; }
  };
}

// Dessine au format réel du conteneur, et redessine quand sa largeur change :
// un viewBox fixe rétrécissait les libellés à 7 px sur téléphone.
function responsiveChart(draw) {
  const host = el('div', { class: 'rv-chart' });
  let lastW = 0;
  const paint = () => {
    const w = Math.floor(host.clientWidth);
    if (!w || w === lastW) return;
    lastW = w;
    clear(host);
    draw(host, w);
  };
  requestAnimationFrame(paint);
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => { if (!host.isConnected) return ro.disconnect(); paint(); });
    ro.observe(host);
  }
  return host;
}

function seriesKeys() {
  return rv.plan === 'all' ? ['monthly', 'annual'] : [rv.plan];
}

// Revenus encaissés par mois, empilés par formule.
function revenueChart(d, phone) {
  return responsiveChart((host, W) => {
    const months = d.months || [];
    const keys = seriesKeys();
    const H = phone ? 190 : 230;
    const m = { top: 18, right: 8, bottom: 24, left: phone ? 40 : 50 };
    const pw = W - m.left - m.right;
    const ph = H - m.top - m.bottom;
    const totals = months.map((row) => keys.reduce((n, k) => n + ((row.revenue_cents || {})[k] || 0), 0));
    const max = niceMax(Math.max(0, ...totals));
    const band = pw / Math.max(1, months.length);
    const bw = Math.min(24, band * 0.62);
    const y = (v) => m.top + ph - (v / max) * ph;
    const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Revenus encaissés par mois' });
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      root.append(svg('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), class: i ? 'rv-gridline' : 'rv-base' }));
      root.append(svgText({ x: m.left - 6, y: y(v) + 3, class: 'rv-tick', 'text-anchor': 'end' }, money(v, d.currency, { compact: true })));
    }
    const every = Math.max(1, Math.ceil(months.length / Math.max(1, Math.floor(pw / (phone ? 46 : 52)))));
    const tip = tooltip(host);
    months.forEach((row, i) => {
      const cx = m.left + band * i + band / 2;
      let acc = 0;
      keys.forEach((k, ki) => {
        const v = (row.revenue_cents || {})[k] || 0;
        if (v <= 0) return;
        const top = y(acc + v);
        const bottom = y(acc);
        const isTop = keys.slice(ki + 1).every((kk) => !((row.revenue_cents || {})[kk] > 0));
        // L'espace de 2 px en couleur de fond sépare deux segments empilés.
        const h = Math.max(1, bottom - top - (acc > 0 ? 2 : 0));
        root.append(svg('path', { d: isTop ? columnPath(cx - bw / 2, top, bw, h, 4) : `M${cx - bw / 2},${top}h${bw}v${h}h${-bw}Z`, fill: PLAN_COLORS[k], class: 'rv-mark' }));
        acc += v;
      });
      if (showTick(i, months.length, every)) {
        root.append(svgText({ x: cx, y: H - 7, class: 'rv-tick', 'text-anchor': 'middle' }, monthShort(row.month)));
      }
      const hit = svg('rect', { x: m.left + band * i, y: m.top, width: band, height: ph, class: 'rv-hit', tabindex: 0,
        'aria-label': monthLong(row.month) + ' : ' + money(totals[i], d.currency) });
      const show = () => {
        root.querySelectorAll('.rv-hit.is-on').forEach((n) => n.classList.remove('is-on'));
        hit.classList.add('is-on');
        tip.show(cx, y(totals[i]), monthLong(row.month), [
          { value: money(totals[i], d.currency), label: 'au total' },
          ...keys.map((k) => ({ color: PLAN_COLORS[k], value: money((row.revenue_cents || {})[k] || 0, d.currency), label: PLANS[k] }))
        ]);
      };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', () => { hit.classList.remove('is-on'); tip.hide(); });
      hit.addEventListener('blur', () => { hit.classList.remove('is-on'); tip.hide(); });
      root.append(hit);
    });
    // Une seule valeur écrite : le dernier mois.
    if (months.length) {
      const i = months.length - 1;
      root.append(svgText({ x: m.left + band * i + band / 2, y: y(totals[i]) - 6, class: 'rv-value', 'text-anchor': 'end' }, money(totals[i], d.currency, { compact: true })));
    }
    host.prepend(root);
  });
}

// Abonnés actifs en fin de mois, une ligne par formule.
function activeChart(d, phone) {
  return responsiveChart((host, W) => {
    const months = d.months || [];
    const keys = seriesKeys();
    const H = phone ? 180 : 220;
    const m = { top: 14, right: phone ? 12 : 86, bottom: 24, left: phone ? 34 : 44 };
    const pw = W - m.left - m.right;
    const ph = H - m.top - m.bottom;
    const max = niceMax(Math.max(0, ...months.flatMap((row) => keys.map((k) => (row.active || {})[k] || 0))));
    const x = (i) => m.left + (months.length > 1 ? (pw * i) / (months.length - 1) : pw / 2);
    const y = (v) => m.top + ph - (v / max) * ph;
    const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Abonnés actifs par formule' });
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      root.append(svg('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), class: i ? 'rv-gridline' : 'rv-base' }));
      root.append(svgText({ x: m.left - 6, y: y(v) + 3, class: 'rv-tick', 'text-anchor': 'end' }, int(Math.round(v))));
    }
    const every = Math.max(1, Math.ceil(months.length / Math.max(1, Math.floor(pw / (phone ? 46 : 52)))));
    months.forEach((row, i) => {
      if (showTick(i, months.length, every)) root.append(svgText({ x: x(i), y: H - 7, class: 'rv-tick', 'text-anchor': i === months.length - 1 ? 'end' : 'middle' }, monthShort(row.month)));
    });
    for (const k of keys) {
      const pts = months.map((row, i) => [x(i), y((row.active || {})[k] || 0)]);
      if (!pts.length) continue;
      root.append(svg('path', { d: 'M' + pts.map((p) => p.join(',')).join('L'), fill: 'none', stroke: PLAN_COLORS[k], 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      const [ex, ey] = pts[pts.length - 1];
      root.append(svg('circle', { cx: ex, cy: ey, r: 4, fill: PLAN_COLORS[k], class: 'rv-dot' }));
      if (!phone) root.append(svgText({ x: ex + 10, y: ey + 4, class: 'rv-endlabel' }, PLANS[k] + ' ' + int((months[months.length - 1].active || {})[k] || 0)));
    }
    // Réticule : il trouve le mois le plus proche, on n'a pas à viser la ligne.
    const cross = svg('line', { y1: m.top, y2: m.top + ph, class: 'rv-cross', visibility: 'hidden' });
    const marks = keys.map((k) => svg('circle', { r: 4, fill: PLAN_COLORS[k], class: 'rv-dot', visibility: 'hidden' }));
    root.append(cross, ...marks);
    const tip = tooltip(host);
    const overlay = svg('rect', { x: m.left, y: m.top, width: Math.max(1, pw), height: ph, class: 'rv-overlay', tabindex: 0, 'aria-label': 'Parcourir les mois au clavier avec les flèches' });
    let current = months.length - 1;
    const at = (i) => {
      if (!months.length) return;
      current = Math.max(0, Math.min(months.length - 1, i));
      const row = months[current];
      cross.setAttribute('x1', x(current)); cross.setAttribute('x2', x(current)); cross.setAttribute('visibility', 'visible');
      keys.forEach((k, ki) => { marks[ki].setAttribute('cx', x(current)); marks[ki].setAttribute('cy', y((row.active || {})[k] || 0)); marks[ki].setAttribute('visibility', 'visible'); });
      const total = keys.reduce((n, k) => n + ((row.active || {})[k] || 0), 0);
      tip.show(x(current), Math.min(...keys.map((k) => y((row.active || {})[k] || 0))), monthLong(row.month), [
        ...(keys.length > 1 ? [{ value: int(total), label: 'abonnés au total' }] : []),
        ...keys.map((k) => ({ color: PLAN_COLORS[k], value: int((row.active || {})[k] || 0), label: PLANS[k] }))
      ]);
    };
    const off = () => { cross.setAttribute('visibility', 'hidden'); marks.forEach((c) => c.setAttribute('visibility', 'hidden')); tip.hide(); };
    overlay.addEventListener('pointermove', (e) => {
      const box = root.getBoundingClientRect();
      const px = e.clientX - box.left;
      at(Math.round(((px - m.left) / Math.max(1, pw)) * (months.length - 1)));
    });
    overlay.addEventListener('pointerleave', off);
    overlay.addEventListener('focus', () => at(current));
    overlay.addEventListener('blur', off);
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); at(current - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); at(current + 1); }
    });
    root.append(overlay);
    host.prepend(root);
  });
}

// ---------- Morceaux de la vue ----------
function tile(label, short, value, sub, delta) {
  return el('div', { class: 'bz-card is-tight adm-kpi rv-kpi' },
    el('span', { class: 'bz-eyebrow' }, el('span', { class: 'bz-hide-sm', text: label }), el('span', { class: 'bz-show-sm', text: short })),
    el('div', { class: 'adm-kpi-value', text: value }),
    delta ? el('span', { class: 'rv-delta ' + delta.cls, text: delta.text }) : null,
    sub ? el('span', { class: 'adm-kpi-sub', text: sub }) : null
  );
}

function legend(keys) {
  if (keys.length < 2) return null;
  return el('ul', { class: 'rv-legend' }, keys.map((k) => el('li', {}, el('span', { class: 'rv-swatch', style: { background: PLAN_COLORS[k] } }), el('span', { text: PLANS[k] }))));
}

const exampleTag = () => (rv.demo ? el('span', { class: 'rv-example', text: 'Exemple' }) : null);

function chartCard(id, title, sub, keys, chart, table) {
  const showTable = rv.tables.has(id);
  const toggle = el('button', { class: 'bz-btn is-sm rv-table-btn', type: 'button', 'aria-pressed': String(showTable), text: showTable ? 'Graphique' : 'Tableau' });
  const card = el('section', { class: 'bz-card rv-card' },
    el('div', { class: 'rv-card-head' },
      el('div', { style: { minWidth: '0' } }, el('h3', { class: 'bz-h3' }, el('span', { text: title }), exampleTag()), sub ? el('p', { class: 'bz-tiny', text: sub }) : null),
      toggle),
    rv.plan === 'all' ? legend(keys) : null,
    showTable ? table() : chart()
  );
  toggle.addEventListener('click', () => {
    if (rv.tables.has(id)) rv.tables.delete(id); else rv.tables.add(id);
    card.replaceWith(chartCard(id, title, sub, keys, chart, table));
  });
  return card;
}

function monthsTable(d, field, format) {
  const keys = seriesKeys();
  return el('div', { class: 'bz-table-wrap' },
    el('table', { class: 'bz-table rv-table' },
      el('thead', {}, el('tr', {}, el('th', { text: 'Mois' }), keys.map((k) => el('th', { class: 'is-num', text: PLANS[k] })), keys.length > 1 ? el('th', { class: 'is-num', text: 'Total' }) : null)),
      el('tbody', {}, (d.months || []).slice().reverse().map((row) => {
        const vals = keys.map((k) => (row[field] || {})[k] || 0);
        return el('tr', {}, el('td', { text: monthLong(row.month) }), vals.map((v) => el('td', { class: 'is-num', text: format(v) })), keys.length > 1 ? el('td', { class: 'is-num', text: format(vals.reduce((a, b) => a + b, 0)) }) : null);
      }))
    ));
}

function splitCard(d) {
  const a = d.active || {};
  const total = (a.monthly || 0) + (a.annual || 0);
  const share = (n) => (total ? Math.round((n / total) * 100) : 0);
  return el('section', { class: 'bz-card rv-card' },
    el('div', { class: 'rv-card-head' }, el('div', {}, el('h3', { class: 'bz-h3' }, el('span', { text: 'Répartition des abonnés actifs' }), exampleTag()), el('p', { class: 'bz-tiny', text: int(total) + ' abonnés' + (a.canceling ? ' · dont ' + int(a.canceling) + ' résiliés encore actifs' : '') }))),
    total ? el('div', { class: 'rv-split', role: 'img', 'aria-label': 'Mensuel ' + share(a.monthly || 0) + ' %, annuel ' + share(a.annual || 0) + ' %' },
      ['monthly', 'annual'].map((k) => (a[k] ? el('span', { style: { width: share(a[k]) + '%', background: PLAN_COLORS[k] } }) : null))) : null,
    el('ul', { class: 'rv-split-legend' }, ['monthly', 'annual'].map((k) => el('li', {},
      el('span', { class: 'rv-swatch', style: { background: PLAN_COLORS[k] } }),
      el('b', { text: PLANS[k] }),
      el('span', { text: int(a[k] || 0) + ' · ' + share(a[k] || 0) + ' %' })
    )))
  );
}

// Rétention par cohorte : une ligne par mois de départ, une colonne par mois
// d'ancienneté. Une seule teinte, du fond vers le clair, pour la magnitude.
function cohortCard(d, phone) {
  const plan = rv.plan;
  const rows = (d.cohorts || []).filter((c) => (c.plan || 'all') === plan);
  const width = Math.max(0, ...rows.map((c) => (c.retained_pct || []).length));
  const cell = (v) => {
    if (v === null || v === undefined) return el('td', { class: 'rv-cell is-empty' });
    const a = 0.08 + 0.72 * Math.max(0, Math.min(100, v)) / 100;
    return el('td', { class: 'rv-cell' + (a > 0.55 ? ' is-strong' : ''), style: { background: `rgba(57,135,229,${a.toFixed(3)})` }, title: v + ' % encore abonnés', text: v + ' %' });
  };
  return el('section', { class: 'bz-card rv-card rv-cohorts' },
    el('div', { class: 'rv-card-head' }, el('div', {},
      el('h3', { class: 'bz-h3' }, el('span', { text: 'Rétention par cohorte' }), exampleTag()),
      el('p', { class: 'bz-tiny', text: 'Part des abonnés d’un mois de départ encore abonnés M mois plus tard' + (plan !== 'all' ? ' · formule ' + PLANS[plan].toLowerCase() : '') }))),
    rows.length ? el('div', { class: 'bz-table-wrap' },
      el('table', { class: 'rv-heat' },
        el('thead', {}, el('tr', {}, el('th', { text: 'Départ' }), el('th', { class: 'is-num', text: 'Abonnés' }), Array.from({ length: width }, (_, i) => el('th', { class: 'is-num', text: 'M' + i })))),
        el('tbody', {}, rows.slice().reverse().map((c) => el('tr', {},
          el('th', { scope: 'row', text: monthShort(c.month) }),
          el('td', { class: 'is-num', text: int(c.size) }),
          Array.from({ length: width }, (_, i) => cell((c.retained_pct || [])[i])))))
      )) : el('p', { class: 'bz-small bz-muted', style: { margin: '10px 0 0' }, text: 'Pas encore assez de recul pour une cohorte.' })
  );
}

// Ce qui arrive à l'échéance : renouvellement automatique, arrêt après une
// résiliation, ou renouvellement bloqué par un paiement refusé.
function dueText(s) {
  const when = s.expiresIn || 'à l’échéance';
  if (s.statusLabel === 'Paiement en échec') return 'paiement à régulariser, échéance ' + when;
  return (s.willRenew ? 'renouvellement auto ' : 'se termine ') + when;
}

function subscribersCard(list, phone) {
  const now = new Date();
  const rows = list
    .map((x) => ({ user: x.user, s: passSummary(x.boostz_pass, now), end: new Date(x.boostz_pass.current_period_end).getTime() || 0 }))
    .filter((x) => x.s && x.s.active && (rv.plan === 'all' || x.s.plan === rv.plan))
    .sort((a, b) => a.end - b.end);

  const head = el('div', { class: 'rv-card-head' }, el('div', {},
    el('h3', { class: 'bz-h3' }, el('span', { text: 'Abonnés Boostz Pass' }), exampleTag()),
    el('p', { class: 'bz-tiny', text: int(rows.length) + ' abonnement' + (rows.length > 1 ? 's' : '') + ' en cours · de la plus proche échéance à la plus lointaine' })));
  if (!rows.length) return el('section', { class: 'bz-card rv-card' }, head, el('p', { class: 'bz-small bz-muted', style: { margin: '10px 0 0' }, text: 'Aucun abonnement en cours.' }));

  const name = (u) => (u.pseudo || 'Membre') + (u.deleted ? ' (supprimé)' : '');
  if (phone) {
    return el('section', { class: 'bz-card rv-card rv-subs' }, head,
      el('ul', { class: 'rv-sub-list' }, rows.map(({ user, s }) => el('li', {},
        el('div', { class: 'rv-sub-top' }, el('b', { text: name(user) }), el('span', { class: 'rv-plan' }, el('span', { class: 'rv-swatch', style: { background: PLAN_COLORS[s.plan] } }), el('span', { text: s.planLabel }))),
        el('div', { class: 'rv-sub-meta' },
          el('span', { class: s.statusCls, text: s.statusLabel }),
          el('span', { text: 'depuis ' + s.sinceSpan }),
          el('span', { text: dueText(s) })))))
    );
  }
  return el('section', { class: 'bz-card rv-card rv-subs' }, head,
    el('div', { class: 'bz-table-wrap' },
      el('table', { class: 'bz-table rv-table' },
        el('thead', {}, el('tr', {}, ['Membre', 'Formule', 'Statut', 'Abonné depuis', 'Échéance'].map((t) => el('th', { text: t })))),
        el('tbody', {}, rows.map(({ user, s }) => el('tr', {},
          el('td', {}, el('b', { style: { fontFamily: 'var(--font-ui)' }, text: name(user) })),
          el('td', {}, el('span', { class: 'rv-plan' }, el('span', { class: 'rv-swatch', style: { background: PLAN_COLORS[s.plan] } }), el('span', { text: s.planLabel + (s.price ? ' · ' + s.price : '') }))),
          el('td', {}, el('span', { class: s.statusCls, text: s.statusLabel })),
          el('td', {}, el('div', { text: s.since }), el('div', { class: 'bz-tiny', text: s.sinceSpan })),
          el('td', {}, el('div', { text: s.expires }), el('div', { class: 'bz-tiny', text: dueText(s) }))
        )))
      ))
  );
}

// ---------- La vue ----------
export function renderRevenue({ users, phone, rerender }) {
  if (rv.status === 'idle') { rv.status = 'loading'; load(rerender); }
  const wrap = (...kids) => el('div', { class: 'rv' }, ...kids);

  const periods = el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Période' },
    [6, 12, 24].map((n) => el('button', {
      class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(rv.months === n),
      onclick: () => { if (rv.months === n) return; rv.months = n; if (!rv.demo) load(rerender); rerender(); }
    }, n + ' mois')));
  const plans = el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Formule' },
    [['all', 'Toutes formules'], ['monthly', 'Mensuel'], ['annual', 'Annuel']].map(([k, label]) => el('button', {
      class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(rv.plan === k),
      onclick: () => { if (rv.plan === k) return; rv.plan = k; rerender(); }
    }, k !== 'all' ? el('span', { class: 'rv-swatch', style: { background: PLAN_COLORS[k] } }) : null, label)));
  const filters = el('div', { class: 'rv-filters' }, periods, plans);

  if (rv.status === 'loading' && !rv.demo) {
    return wrap(el('div', { class: 'adm-agent-kpis' }, [1, 2, 3, 4].map(() => el('div', { class: 'bz-skeleton', style: { height: '62px' } }))));
  }
  if (rv.status === 'error' && !rv.demo) {
    return wrap(el('div', { class: 'bz-msg is-err', role: 'alert' },
      el('span', { text: 'Revenus indisponibles : ' + rv.error + ' ' }),
      el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Réessayer', onclick: () => load(rerender) })));
  }

  const connected = rv.status === 'ready' || rv.status === 'refreshing';
  if (!connected && !rv.demo) {
    return wrap(el('section', { class: 'bz-card rv-absent' },
      el('span', { class: 'rv-absent-icon', 'aria-hidden': 'true', text: '€' }),
      el('b', { text: 'Revenus : données pas encore branchées' }),
      el('p', { class: 'bz-small bz-muted', text: 'Le Boostz Pass n’est pas encore vendu : ni abonnement ni paiement n’existe côté serveur. Dès que l’API les fournira, cette vue montrera les abonnés, le revenu récurrent, la rétention et les revenus par formule.' }),
      el('ul', { class: 'rv-absent-list' },
        el('li', { text: 'Par membre : offre au mois ou à l’année (renouvelées automatiquement), date de début, échéance, résiliation éventuelle.' }),
        el('li', { text: 'Par mois : revenus encaissés, abonnés actifs, arrivées et départs, pour chaque formule.' }),
        el('li', { text: 'Par cohorte : la part des abonnés encore là après 1, 3, 6 et 12 mois.' })),
      el('button', { class: 'bz-btn is-violet', type: 'button', text: 'Voir un aperçu avec des données d’exemple', onclick: () => { rv.demo = true; rerender(); } })
    ));
  }

  const d = rv.demo ? demoOverview(rv.months) : rv.data;
  const cur = d.currency || 'EUR';
  const keys = seriesKeys();
  const a = d.active || {};
  const rev = d.revenue || {};
  const deltaRev = rev.last_month_cents ? Math.round(((rev.this_month_cents - rev.last_month_cents) / rev.last_month_cents) * 1000) / 10 : null;
  const ret = d.retention_pct || {};

  const banner = rv.demo ? el('div', { class: 'rv-demo', role: 'status' },
    el('b', { text: 'Aperçu : chiffres d’exemple, rien de réel' }),
    el('span', { class: 'bz-tiny', text: connected ? 'Les vraies données sont disponibles.' : 'Les données de revenus ne sont pas encore branchées.' }),
    el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Quitter l’aperçu', onclick: () => { rv.demo = false; rerender(); } })
  ) : null;

  const kpis = el('div', { class: 'adm-agent-kpis rv-kpis' },
    tile('Abonnés actifs', 'Abonnés', int(a.total), int(a.monthly) + ' mens. · ' + int(a.annual) + ' ann.'),
    tile('Revenu mensuel récurrent', 'MRR', money(d.mrr_cents, cur, { compact: true }), 'soit ' + money((d.mrr_cents || 0) * 12, cur, { compact: true }) + ' par an'),
    tile('Revenus du mois', 'Ce mois', money(rev.this_month_cents, cur, { compact: true }), 'vs ' + money(rev.last_month_cents, cur, { compact: true }) + ' le mois dernier',
      deltaRev === null ? null : { cls: deltaRev >= 0 ? 'is-up' : 'is-down', text: (deltaRev >= 0 ? '▲ +' : '▼ ') + pct(deltaRev) }),
    tile('Nouveaux abonnés', 'Nouveaux', int(d.new_this_month), 'ce mois-ci'),
    tile('Désabonnements', 'Départs', int(d.churned_this_month), 'taux ' + pct(d.churn_rate_pct) + ' ce mois'),
    tile('Rétention à 3 mois', 'Rét. 3 m', pct(ret.m3), 'à 1 mois : ' + pct(ret.m1)),
    tile('Rétention à 12 mois', 'Rét. 12 m', pct(ret.m12), 'à 6 mois : ' + pct(ret.m6))
  );

  const subscribers = rv.demo ? demoSubscribers() : (hasPassData(users) ? users.filter((u) => u.boostz_pass).map((u) => ({ user: u, boostz_pass: u.boostz_pass })) : []);

  const stale = rv.error && connected && !rv.demo ? el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginBottom: '10px' }, text: 'Mise à jour impossible (' + rv.error + ') : chiffres précédents affichés.' }) : null;

  return wrap(
    banner,
    stale,
    filters,
    el('div', { class: rv.status === 'refreshing' ? 'rv-body is-refreshing' : 'rv-body' },
      kpis,
      el('div', { class: 'rv-grid' },
        chartCard('revenue', 'Revenus encaissés par mois', 'Brut, par formule' + (rv.plan !== 'all' ? ' · ' + PLANS[rv.plan].toLowerCase() : ''), keys,
          () => revenueChart(d, phone), () => monthsTable(d, 'revenue_cents', (v) => money(v, cur))),
        chartCard('active', 'Abonnés actifs dans le temps', 'En fin de mois', keys,
          () => activeChart(d, phone), () => monthsTable(d, 'active', int))
      ),
      el('div', { class: 'rv-grid is-split' }, splitCard(d), cohortCard(d, phone)),
      subscribers.length || rv.demo || hasPassData(users) ? subscribersCard(subscribers, phone) : null
    )
  );
}

// Pour les tests et le rechargement de la console.
export function resetRevenue() { rv.status = 'idle'; rv.data = null; rv.demo = false; }
