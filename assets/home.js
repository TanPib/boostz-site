// L'accueil de la console : un tableau de bord, la page qui s'ouvre en premier.
//
// Il ne charge presque rien de lui-même. Les comptes, signalements, tickets,
// idées, boutiques, la todo, Data et les coupures sont déjà lus par admin.js
// pour les pastilles du menu ; l'accueil les recompte. Il ajoute trois lectures
// seulement, une fois par ouverture : le résumé de Revenus, les visites du
// site sur 30 jours et les bêta-testeurs. Si l'une échoue, sa carte le dit et le reste s'affiche.
import { call } from './api.js';
import { el } from './chrome.js';
import { money, int, salesRows, testsNote } from './revenue.js?v=2026-10-19g';
import { dataProblems } from './data.js?v=2026-10-19g';
import { todoMineNext } from './todo.js?v=2026-10-19g';

const DAY = 86400000;
const hm = { status: 'idle', overview: null, overviewError: null, audience: null, audienceError: null, beta: null, at: null, seq: 0 };

// La règle de Google pour ouvrir la production : 12 testeurs présents depuis
// 14 jours (voir beta.js).
const GOOGLE_RULE = 12;

// Aujourd'hui à Paris, le jour que le serveur compte pour l'audience.
function parisDay(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t) => parts.find((x) => x.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function loadHome() {
  const seq = ++hm.seq;
  hm.status = hm.at ? 'refreshing' : 'loading';
  const to = parisDay();
  const from = parisDay(new Date(Date.now() - 29 * DAY));
  const [overview, audience, beta] = await Promise.allSettled([
    call('/admin/business/overview?months=6'),
    call(`/admin/audience?from=${from}&to=${to}&by=day`),
    call('/admin/beta-testers')
  ]);
  if (seq !== hm.seq) return;
  hm.overview = overview.status === 'fulfilled' ? overview.value : hm.overview;
  hm.overviewError = overview.status === 'rejected' ? overview.reason.message : null;
  hm.audience = audience.status === 'fulfilled' ? audience.value : hm.audience;
  hm.audienceError = audience.status === 'rejected' ? audience.reason.message : null;
  hm.beta = beta.status === 'fulfilled' ? beta.value : hm.beta;
  hm.status = 'ready';
  hm.at = new Date();
}

// ---------- Petites briques ----------
const plural = (n, one, many) => int(n) + ' ' + (n > 1 ? many : one);
const timeFr = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dayShort = (iso) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

function agoFr(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'à l’instant';
  if (min < 60) return 'il y a ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'il y a ' + h + ' h';
  const d = Math.floor(h / 24);
  return d === 1 ? 'hier' : 'il y a ' + d + ' j';
}

const card = (title, sub, link, ...body) => el('section', { class: 'bz-card hm-card' },
  el('div', { class: 'hm-card-head' }, el('h2', { class: 'bz-h3', text: title }), link || null),
  sub ? el('p', { class: 'bz-tiny bz-muted hm-card-sub', text: sub }) : null,
  ...body);

const goLink = (label, onclick) => el('button', { class: 'bz-btn is-sm', type: 'button', text: label, onclick });
const dot = (tone) => el('span', { class: 'hm-dot is-' + tone, 'aria-hidden': 'true' });

// Des colonnes en CSS, une par jour : assez pour lire une tendance, sans
// charger la machinerie SVG de Revenus pour trente barres.
function bars(points, label) {
  const max = Math.max(1, ...points.map((p) => p.n));
  return el('div', { class: 'hm-bars', role: 'img', 'aria-label': label },
    el('div', { class: 'hm-bars-cols' }, points.map((p) => el('span', { class: 'hm-bar', title: p.title },
      el('i', { style: { height: (p.n ? Math.max(6, (p.n / max) * 100) : 0) + '%' } })))),
    el('div', { class: 'hm-bars-axis' }, [0, 7, 14, 21, points.length - 1].map((i) => el('span', { text: points[i] ? points[i].short : '' }))));
}

function meterRow(label, n, total) {
  return el('div', { class: 'hm-meter-row' },
    el('span', { text: label }),
    el('span', { class: 'hm-meter' }, el('i', { style: { width: (total ? Math.round((n / total) * 100) : 0) + '%' } })),
    el('b', { text: int(n) }));
}

// ---------- La vue ----------
// ctx : me, users, actions, actionLabel(a), counts, go(tab), goUsers(kinds),
// refresh() (recharge toute la console), rerender().
export function renderHome(ctx) {
  const { me, users, actions, counts, go } = ctx;
  if (hm.status === 'idle') loadHome().then(ctx.rerender);

  const now = Date.now();
  const alive = users.filter((u) => !u.deleted);
  const recent = alive.filter((u) => u.created_date && now - new Date(u.created_date).getTime() < 30 * DAY);
  const active7 = alive.filter((u) => u.last_app_seen_at && now - new Date(u.last_app_seen_at).getTime() < 7 * DAY);
  const health = dataProblems();
  const todo = todoMineNext(5);
  const ov = hm.overview;
  const au = hm.audience;
  const sales = ov ? salesRows(ov, ov.currency || 'EUR') : null;

  // ---- En-tête ----
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const head = el('div', { class: 'hm-head' },
    el('div', {},
      el('h1', { class: 'bz-h2 hm-title', text: 'Bonjour ' + (me.pseudo || '') }),
      el('p', { class: 'bz-small bz-muted', text: today.charAt(0).toUpperCase() + today.slice(1) + (hm.at ? ' · chiffres mis à jour à ' + timeFr(hm.at) : '') })),
    el('button', {
      class: 'bz-btn is-sm', type: 'button', disabled: hm.status === 'refreshing', text: hm.status === 'refreshing' ? 'Actualisation…' : 'Actualiser',
      onclick: async () => { hm.status = 'refreshing'; ctx.rerender(); await Promise.all([ctx.refresh(), loadHome()]); ctx.rerender(); }
    }));

  // ---- À traiter : ce qui attend un geste, le plus grave d'abord ----
  const todoItems = [
    [health && health.down.length, 'red', plural(health ? health.down.length : 0, 'point en panne', 'points en panne') + ' dans Data', health && health.down.length ? health.down.slice(0, 3).join(', ') + (health.down.length > 3 ? '…' : '') : '', 'data'],
    [counts.reports, 'red', plural(counts.reports, 'signalement ouvert', 'signalements ouverts'), 'Les plus anciens attendent depuis le plus longtemps', 'reports'],
    [counts.sources, 'red', plural(counts.sources, 'source coupée', 'sources coupées'), 'Retirée de l’appli tant qu’elle n’est pas rétablie', 'sources'],
    [counts.tickets, 'violet', plural(counts.tickets, 'ticket de support à traiter', 'tickets de support à traiter'), 'En attente de ta réponse', 'support'],
    [counts.venues, 'violet', plural(counts.venues, 'demande de boutique', 'demandes de boutiques'), 'Créations et affiliations à valider', 'venues'],
    [counts.ideas, 'violet', plural(counts.ideas, 'idée non lue', 'idées non lues'), 'Suggestions des membres', 'ideas'],
    [counts.todo, 'amber', plural(counts.todo, 'action à toi dans la todo', 'actions à toi dans la todo'), todo.late ? plural(todo.late, 'en retard', 'en retard') : 'Aucune en retard', 'todo']
  ];
  const pending = todoItems.filter(([n]) => n);
  const clean = todoItems.filter(([n]) => !n).map(([, , text]) => text.replace(/^\d+ /, '0 '));
  const urgent = card('À traiter', pending.length ? null : 'Rien n’attend de geste de ta part.',
    pending.length ? el('span', { class: 'bz-count', text: String(pending.length) }) : null,
    el('div', { class: 'hm-rows' }, pending.map(([, tone, text, sub, tab]) => el('div', { class: 'hm-row' },
      dot(tone),
      el('span', { class: 'hm-row-main' }, el('b', { text }), sub ? el('small', { text: sub }) : null),
      goLink('Voir', () => go(tab))))),
    clean.length ? el('p', { class: 'bz-tiny hm-clean' }, el('span', { class: 'hm-check', 'aria-hidden': 'true', text: '✓' }), 'À jour : ' + clean.join(' · ')) : null);

  // ---- Santé du service ----
  const healthCard = card('Santé du service', health ? 'Mesuré à ' + timeFr(new Date(health.at)) + ' · le détail est dans Data' : 'Data n’a pas encore répondu',
    goLink('Data', () => go('data')),
    health ? el('div', { class: 'hm-health' },
      el('span', {}, dot(health.down.length ? 'red' : 'green'), health.down.length ? plural(health.down.length, 'point en panne', 'points en panne') : 'Aucune panne'),
      el('span', {}, dot(health.warn.length ? 'amber' : 'green'), health.warn.length ? plural(health.warn.length, 'point à surveiller', 'points à surveiller') : 'Rien à surveiller'),
      el('span', {}, dot(counts.sources ? 'red' : 'green'), counts.sources ? plural(counts.sources, 'source coupée', 'sources coupées') : 'Aucune coupure'),
      ...health.down.concat(health.warn).slice(0, 4).map((name) => el('span', { class: 'bz-muted' }, dot(health.down.includes(name) ? 'red' : 'amber'), name))
    ) : el('div', { class: 'bz-skeleton', style: { height: '60px' } }));

  // ---- Chiffres clés : chacun ouvre la page qui le détaille ----
  const tile = (label, value, sub, tab) => el('button', { class: 'bz-card is-tight hm-kpi', type: 'button', onclick: () => go(tab) },
    el('span', { class: 'bz-eyebrow', text: label }),
    el('span', { class: 'adm-kpi-value', text: value }),
    el('span', { class: 'bz-tiny bz-muted', text: sub }));
  const revenueValue = ov ? money((ov.revenue || {}).this_month_cents || 0, ov.currency || 'EUR') : (hm.overviewError ? '—' : '…');
  const revenueSub = !ov ? (hm.overviewError ? 'Revenus indisponibles' : 'chargement')
    : ov.billing && ov.billing.connected === false ? 'paiement pas encore ouvert' : 'Pass, boosties et analyses';
  const kpis = el('div', { class: 'hm-kpis' },
    tile('Membres', int(alive.length), '+' + int(recent.length) + ' en 30 jours', 'users'),
    tile('Actifs sur 7 jours', int(active7.length), alive.length ? Math.round((active7.length / alive.length) * 100) + ' % des membres' : '—', 'users'),
    tile('Visites du site', au ? int(au.totals.visits) : (hm.audienceError ? '—' : '…'), au ? '30 jours · ' + int(au.totals.views) + ' pages vues' : 'Audience', 'audience'),
    tile('Revenu du mois', revenueValue, revenueSub, 'revenue'),
    tile('Bêta-testeurs', hm.beta ? int(hm.beta.total) : '…', hm.beta ? int(hm.beta.fourteen_days) + ' / ' + GOOGLE_RULE + ' présents depuis 14 jours' : 'Le test fermé Google Play', 'beta'));

  // ---- Courbes : inscriptions (comptes) et visites (audience) ----
  const days = Array.from({ length: 30 }, (_, i) => parisDay(new Date(now - (29 - i) * DAY)));
  const signupBy = new Map(days.map((d) => [d, 0]));
  for (const u of recent) {
    const d = parisDay(new Date(u.created_date));
    if (signupBy.has(d)) signupBy.set(d, signupBy.get(d) + 1);
  }
  const signupPoints = days.map((d) => ({ n: signupBy.get(d), short: dayShort(d), title: dayShort(d) + ' : ' + plural(signupBy.get(d), 'inscription', 'inscriptions') }));
  const signups = card('Inscriptions par jour', plural(recent.length, 'inscription', 'inscriptions') + ' sur 30 jours', goLink('Utilisateurs', () => go('users')),
    bars(signupPoints, 'Inscriptions par jour sur 30 jours'));

  const visitPoints = au ? au.series.map((p) => ({ n: p.visits, short: dayShort(p.period), title: dayShort(p.period) + ' : ' + plural(p.visits, 'visite', 'visites') + ' · ' + plural(p.views, 'page vue', 'pages vues') })) : null;
  const visits = card('Visites du site par jour', au ? plural(au.totals.visits, 'visite', 'visites') + ' sur 30 jours' : null, goLink('Audience', () => go('audience')),
    visitPoints ? bars(visitPoints, 'Visites du site par jour sur 30 jours')
      : hm.audienceError ? el('p', { class: 'bz-small bz-muted', text: 'Audience indisponible : ' + hm.audienceError })
        : el('div', { class: 'bz-skeleton', style: { height: '120px' } }));

  // ---- Todo, communauté, activité ----
  const next = card('Prochaines actions', 'Les tiennes, par échéance', goLink('Todo', () => go('todo')),
    todo.items.length ? el('div', { class: 'hm-rows' }, todo.items.map((t) => el('div', { class: 'hm-row is-tight' },
      dot(t.late ? 'red' : t.due_day ? 'amber' : 'grey'),
      el('span', { class: 'hm-row-main', text: t.title }),
      el('small', { class: t.late ? 'hm-late' : 'bz-muted', text: t.due_day ? (t.late ? 'en retard · ' : '') + dayShort(t.due_day) : 'sans date' }))))
      : el('p', { class: 'bz-small bz-muted', text: 'Aucune action ouverte pour toi.' }));

  const line = (label, n, tab) => el('button', { class: 'hm-row is-tight is-link', type: 'button', onclick: () => go(tab) },
    el('span', { class: 'hm-row-main', text: label }), el('b', { class: n ? 'hm-hot' : '', text: int(n) }));
  const community = card('Communauté', 'Ce que les membres attendent de toi', null,
    el('div', { class: 'hm-rows' },
      line('Signalements ouverts', counts.reports, 'reports'),
      line('Tickets de support à traiter', counts.tickets, 'support'),
      line('Demandes de boutiques', counts.venues, 'venues'),
      line('Idées non lues', counts.ideas, 'ideas')));

  const activity = card('Activité récente', 'Les derniers gestes des admins', goLink('Journal', () => go('journal')),
    actions.length ? el('div', { class: 'hm-rows' }, actions.slice(0, 5).map((a) => el('div', { class: 'hm-row is-tight' },
      el('span', { class: 'hm-row-main' },
        el('span', { text: ctx.actionLabel(a) + (a.target ? ' · ' + (a.target.pseudo || 'compte') : '') }),
        el('small', { text: (a.actor.pseudo || '—') + ' · ' + agoFr(a.created_date) })))))
      : el('p', { class: 'bz-small bz-muted', text: 'Aucune action enregistrée.' }));

  // ---- Âges, provenance, ventes ----
  const adults = alive.filter((u) => u.current_age >= 18).length;
  const minors = alive.filter((u) => u.current_age != null && u.current_age < 18).length;
  const unknown = alive.length - adults - minors;
  const ages = card('Âge des membres', 'Échanges et forums sont réservés aux 18 ans et plus', null,
    el('div', { class: 'hm-meters' },
      meterRow('18 ans et plus', adults, alive.length),
      meterRow('Moins de 18 ans', minors, alive.length),
      meterRow('Non déclaré', unknown, alive.length)));

  const top = au ? au.sources.slice(0, 3) : [];
  const origins = card('D’où viennent les visiteurs', 'Les trois premières provenances, 30 jours', null,
    !au ? el('div', { class: 'bz-skeleton', style: { height: '70px' } })
      : top.length ? el('div', { class: 'hm-meters' }, top.map((s) => meterRow(s.label, s.visits, au.totals.visits)))
        : el('p', { class: 'bz-small bz-muted', text: 'Pas encore de visite comptée.' }));

  const salesCardEl = card('Ventes du mois', 'Les trois choses que Boostz vend, via Google Play', goLink('Revenus', () => go('revenue')),
    sales ? el('div', { class: 'hm-rows' }, sales.map((r) => el('div', { class: 'hm-row is-tight' },
      el('span', { class: 'hm-row-main' }, el('span', { text: r.label }), el('small', { text: r.sub })),
      el('b', { text: r.money }))))
      : el('p', { class: 'bz-small bz-muted', text: !ov ? (hm.overviewError ? 'Revenus indisponibles : ' + hm.overviewError : 'Chargement…') : 'Le détail par chose vendue apparaît dès que le paiement Google Play est ouvert sur le serveur.' }),
    sales ? el('p', { class: 'bz-tiny bz-muted', style: { margin: '8px 0 0' }, text: testsNote(sales) }) : null);

  return el('div', { class: 'hm' },
    head,
    el('div', { class: 'hm-grid is-2' }, urgent, healthCard),
    kpis,
    el('div', { class: 'hm-grid is-2' }, signups, visits),
    el('div', { class: 'hm-grid is-3' }, next, community, activity),
    el('div', { class: 'hm-grid is-3' }, ages, origins, salesCardEl));
}
