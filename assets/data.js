// La vue « Data » de la console : l'état des services extérieurs dont dépend
// l'application, de ses passes quotidiennes, des crons GitHub et du serveur,
// le modèle des données, et les liens vers les consoles qui configurent tout
// cela.
//
// Née du blocage tcgcsv du 09/09/2026 : une semaine de 403 que rien n'a montré
// avant qu'on lise les journaux de Render. Tout vient de GET /admin/data
// (services/upstreamReport.js). Les verdicts et leurs phrases y sont calculés,
// la console n'y ajoute que la couleur.
//
// REPLIÉE PAR DÉFAUT DEPUIS LE 23/09/2026. La page dépliait ses quarante
// lignes d'un coup : pour savoir si tout allait bien, il fallait la parcourir
// entière. Trois niveaux maintenant - section, sous-section, détail - et
// chaque niveau porte la santé de ce qu'il cache, en couleur, sur sa propre
// ligne. On descend vers un problème au lieu de le chercher.
//
// LE SERVEUR EST EN PREMIER, ET DÉPLIÉ : c'est la seule section dont la réponse
// conditionne le sens de toutes les autres - une base injoignable rend chaque
// autre verdict douteux. Elle n'a pas de sous-section : ses six lignes tiennent
// à l'écran, et les cacher derrière six accordéons ne cacherait rien d'utile.
//
// LES PLATEFORMES SONT ÉCRITES EN DUR, ICI : elles doivent rester là quand
// l'API est tombée, c'est-à-dire au moment où on en a le plus besoin.
import { call } from './api.js';
import { el, dateTime } from './chrome.js';
import { LAYERS, BATCHES, RULES } from './mcd.js';

const GITHUB = 'https://github.com/TanPib';
const EXPO = 'https://expo.dev/accounts/tanpibs-team/projects/boostz';
const SUPABASE = 'https://supabase.com/dashboard/project/uetvtyaruosulxsuolpe';
const OVH_DOMAIN = 'https://www.ovh.com/manager/#/web/domain/boostz.fr';

// `serviceId` : RENDER_SERVICE_ID, rendu par l'API. Il mène au service
// lui-même ; sans lui, au tableau de bord.
function platforms(serviceId) {
  const render = serviceId ? 'https://dashboard.render.com/web/' + encodeURIComponent(serviceId) : 'https://dashboard.render.com';
  return [
    { name: 'Supabase', role: 'Base de données et photos des collectionneurs', url: SUPABASE,
      links: [['Journaux', SUPABASE + '/logs/explorer'], ['Statut', 'https://status.supabase.com']] },
    { name: 'Render', role: 'Hébergement de l’API', url: render,
      links: [['Journaux', serviceId ? render + '/logs' : render], ['Statut', 'https://status.render.com']] },
    { name: 'Expo', role: 'Builds et mises à jour de l’app', url: EXPO,
      links: [['Mises à jour', EXPO + '/updates'], ['Builds', EXPO + '/builds']] },
    { name: 'OVH', role: 'Domaine boostz.fr', url: OVH_DOMAIN + '/information',
      links: [['Zone DNS', OVH_DOMAIN + '/zone']] },
    { name: 'GitHub', role: 'Code de l’app et du site, crons', url: GITHUB + '/boostz-mobile',
      links: [['Actions', GITHUB + '/boostz-mobile/actions'], ['Site', GITHUB + '/boostz-site']] }
  ];
}

const TONES = {
  ok: ['OK', 'is-green'],
  warn: ['À surveiller', 'is-amber'],
  down: ['En panne', 'is-red'],
  idle: ['Au repos', 'is-grey'],
  off: ['Coupé', 'is-grey']
};
const pill = (status) => {
  const [label, tone] = TONES[status] || TONES.idle;
  return el('span', { class: 'bz-pill ' + tone, text: label });
};
const dot = (status, title) => el('span', { class: 'dt-dot is-' + (status || 'idle'), 'aria-hidden': title ? null : 'true', title: title || null });
const external = (href, text, cls) => el('a', { class: cls || null, href, target: '_blank', rel: 'noopener noreferrer', text });
const plural = (n, one, many) => n + ' ' + (n > 1 ? many : one);

// LE PIRE DE PLUSIEURS ÉTATS, qui est ce qu'une ligne repliée doit montrer :
// une section verte au-dessus d'un service en panne serait un mensonge poli.
// « Au repos » ne l'emporte pas sur « OK » - une passe coupée en local ne doit
// pas éteindre une section dont tout le reste répond.
const RANK = { down: 3, warn: 2, ok: 1, idle: 0, off: 0 };
function worst(statuses) {
  let best = null;
  for (const s of statuses) {
    if (best === null || (RANK[s] ?? 0) > (RANK[best] ?? 0)) best = s;
  }
  return best || 'idle';
}
// « 2 en panne · 1 à surveiller », ou rien du tout quand tout va bien.
function troubleText(statuses) {
  const red = statuses.filter((s) => s === 'down').length;
  const orange = statuses.filter((s) => s === 'warn').length;
  const parts = [];
  if (red) parts.push(plural(red, 'en panne', 'en panne'));
  if (orange) parts.push(plural(orange, 'à surveiller', 'à surveiller'));
  return parts.join(' · ');
}

const SKIPPED = {
  recent: 'Déjà testé il y a moins de 10 min.',
  local: 'Pas depuis un serveur local : tcgcsv y verrait le même User-Agent que la production.',
  no_key: 'Clé absente : rien à tester.',
  no_probe: 'Pas de test pour ce service.'
};

// Même règle que sinceFr (admin.js).
function agoFr(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return 'il y a ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'il y a ' + h + ' h';
  const d = Math.floor(h / 24);
  return d === 1 ? 'hier' : 'il y a ' + d + ' j';
}
const timeFr = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const num = (n) => Number(n).toLocaleString('fr-FR');

// `open` : les sections et sous-sections dépliées. Le serveur y est d'entrée,
// et rien d'autre. `focus` : l'élément vers lequel on vient de sauter depuis le
// bandeau d'alerte, mis en évidence le temps qu'on le regarde.
const dt = {
  status: 'idle', report: null, error: null, seq: 0, refreshing: false,
  probing: new Set(), probingAll: false,
  open: new Set(['server']), focus: null
};

export const dataRedCount = () => (dt.report && dt.report.summary ? dt.report.summary.red : 0);

// Ne lève jamais, comme loadIdeas (admin.js) : chargée avec le reste pour la
// pastille de l'onglet, une panne ici ne doit pas coûter son bandeau à la
// console.
export async function loadData() {
  const seq = ++dt.seq;
  try {
    const report = await call('/admin/data');
    if (seq !== dt.seq) return;
    dt.report = report;
    dt.status = 'ready';
    dt.error = null;
  } catch (e) {
    if (seq !== dt.seq) return;
    // Une API plus ancienne que la console : l'onglet le dit calmement.
    if (e.status === 404) {
      dt.status = 'absent';
      dt.report = null;
    } else {
      dt.status = dt.report ? 'ready' : 'error';
      dt.error = e.message;
    }
  }
}

async function probe(provider, { rerender, toast }) {
  if (provider) dt.probing.add(provider);
  else dt.probingAll = true;
  rerender();
  try {
    const { results, report } = await call('/admin/data/probe', { method: 'POST', body: provider ? { provider } : {} });
    dt.report = report;
    dt.status = 'ready';
    dt.error = null;
    if (provider) {
      const r = results[0] || {};
      const label = (report.providers.find((p) => p.id === provider) || {}).label || provider;
      if (r.skipped) toast(label + ' : ' + SKIPPED[r.skipped], 'note');
      else toast(label + ' : ' + r.detail + (r.ms != null ? ' · ' + r.ms + ' ms' : ''), r.ok ? 'ok' : 'err');
    } else {
      const done = results.filter((r) => !r.skipped);
      const failed = done.filter((r) => !r.ok).length;
      const skipped = results.length - done.length;
      if (!done.length) toast('Aucun test lancé : chaque service a été testé il y a moins de 10 min, n’a pas de clé ici, ou ne se teste pas en local.', 'note');
      else toast(plural(done.length, 'service testé', 'services testés') + ' · ' + (failed ? plural(failed, 'en échec', 'en échec') : 'tous répondent') + (skipped ? ' · ' + plural(skipped, 'ignoré', 'ignorés') : '') + '.', failed ? 'err' : 'ok');
    }
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (provider) dt.probing.delete(provider);
    else dt.probingAll = false;
    rerender();
  }
}

// Les 24 dernières heures, de la plus ancienne à la plus récente. Une heure
// qui a connu un échec est rouge, même si d'autres appels y ont réussi.
function spark(hours) {
  const list = hours || [];
  const max = Math.max(1, ...list.map((h) => h.ok + h.failed));
  return el('span', { class: 'dt-spark', 'aria-hidden': 'true' }, list.map((h) => {
    const n = h.ok + h.failed;
    return el('i', { class: !n ? 'is-empty' : h.failed ? 'is-fail' : null, style: { height: (n ? Math.max(18, Math.round((n / max) * 100)) : 12) + '%' } });
  }));
}

function extraLine(p) {
  const q = p.extra && p.extra.quota;
  if (q && q.limit) {
    const pct = Math.max(0, Math.min(100, Math.round((q.remaining / q.limit) * 100)));
    return el('span', { class: 'dt-meta dt-quota' },
      el('span', { class: 'dt-quota-bar', 'aria-hidden': 'true' }, el('span', { style: { width: pct + '%' } })),
      el('span', { text: num(q.remaining) + ' / ' + num(q.limit) + ' appels Browse restants aujourd’hui' + (q.reset ? ' · remise à zéro à ' + timeFr(q.reset) : '') }));
  }
  // Les deux budgets quotidiens de Claude (05/10/2026) : les comparaisons
  // d'impression des annonces, et les scans (étiquette d'un boîtier).
  const v = p.extra && p.extra.vision;
  const s = p.extra && p.extra.scan;
  const parts = [];
  if (v) parts.push('Comparaisons d’impression aujourd’hui : ' + num(v.used) + ' / ' + num(v.limit));
  if (s) parts.push('Scans aidés par l’IA : ' + num(s.used) + ' / ' + num(s.limit));
  if (parts.length) return el('span', { class: 'dt-meta', text: parts.join(' · ') });
  return null;
}

// L'ancre d'une feuille dans le document, et la classe de sa ligne : c'est par
// là que le bandeau d'alerte saute sur un élément nommé.
const anchor = (key) => 'dt-' + key.replace(/[^a-z0-9]+/gi, '-');
const rowClass = (key) => 'dt-row' + (dt.focus === key ? ' is-focus' : '');

function providerRow(p, ctx) {
  const failing = p.status === 'down' || p.status === 'warn';
  const when = failing
    ? (p.last_ok_at ? 'dernier succès ' + agoFr(p.last_ok_at) : 'aucun succès enregistré')
    : (p.last_call_at ? 'dernier appel ' + agoFr(p.last_call_at) : null);
  const counts = p.calls_24h
    ? '24 h : ' + plural(p.calls_24h, 'appel', 'appels') + ' · ' + plural(p.failures_24h, 'échec', 'échecs') + (p.avg_ms_24h != null ? ' · ' + p.avg_ms_24h + ' ms' : '')
    : '24 h : aucun appel';
  const facts = [
    counts,
    failing && p.last_failure_host ? 'dernier échec : ' + p.last_failure_host : null,
    // Une clé absente est déjà la phrase principale de la ligne.
    p.key === 'ok' ? 'clé présente' : null
  ].filter(Boolean).join(' · ');
  const pr = p.probe;
  // Sans clé, la phrase principale de la ligne le dit déjà.
  const probeText = !pr || pr.blocked === 'no_key' ? null
    : pr.blocked ? SKIPPED[pr.blocked]
      : pr.at ? 'Testé ' + agoFr(pr.at) + ' : ' + (pr.detail || (pr.ok ? 'réussi' : 'en échec')) : null;
  const busy = dt.probingAll || dt.probing.has(p.id);
  const cooling = Boolean(pr && pr.next_at && new Date(pr.next_at) > new Date());
  const button = pr ? el('button', {
    class: 'bz-btn is-sm', type: 'button',
    disabled: busy || Boolean(pr.blocked) || cooling,
    title: pr.blocked ? SKIPPED[pr.blocked] : cooling ? 'Prochain test possible à ' + timeFr(pr.next_at) : 'Envoyer une requête légère à ce service',
    text: busy ? 'Test…' : 'Tester',
    onclick: () => probe(p.id, ctx)
  }) : null;
  return el('div', { class: rowClass('provider:' + p.id), id: anchor('provider:' + p.id) },
    dot(p.status),
    el('div', { class: 'dt-main' },
      el('div', { class: 'dt-top' }, el('b', { text: p.label }), pill(p.status)),
      el('span', { class: 'dt-role', text: p.role }),
      el('span', { class: 'dt-headline is-' + p.status, text: p.headline + (when ? ' · ' + when : '') }),
      extraLine(p),
      el('span', { class: 'dt-meta' },
        el('span', { text: facts }),
        p.site ? external(p.site, 'Site ↗') : null,
        p.rules ? external(p.rules, 'Règles d’usage ↗') : null),
      probeText ? el('span', { class: 'dt-meta', text: probeText }) : null),
    el('div', { class: 'dt-side' }, spark(p.hours), button));
}

function jobRow(key, status, label, headline, meta) {
  return el('div', { class: rowClass(key), id: anchor(key) },
    dot(status),
    el('div', { class: 'dt-main' },
      el('div', { class: 'dt-top' }, el('b', { text: label }), pill(status)),
      el('span', { class: 'dt-headline is-' + status, text: headline }),
      meta ? el('span', { class: 'dt-meta', text: meta }) : null));
}

function serverCard(s) {
  const line = (label, value, tone) => el('div', { class: 'adm-line' },
    el('span', { class: 'bz-muted', text: label }),
    el('b', { class: tone ? 'dt-headline is-' + tone : null }, value));
  const m = s.migrations || {};
  const pending = (m.pending || []).join(', ');
  return el('div', { class: 'dt-server', id: anchor('server') },
    el('div', { class: 'dt-top' }, dot(s.status), el('b', { text: s.headline }), pill(s.status)),
    el('div', { class: 'bz-stack', style: { gap: '6px', marginTop: '10px' } },
      line('Version', s.commit
        ? external('https://github.com/TanPib/boostz-mobile/commit/' + s.commit, s.commit.slice(0, 7) + (s.branch ? ' · ' + s.branch : ''))
        : 'inconnue (hors Render)'),
      // La version du paquet serveur vaut « 0.0.0 » tant que personne ne la
      // tient à jour : c'est le commit qui dit ce qui tourne.
      line('En ligne', 'depuis le ' + dateTime(s.started_at) + ' · Node ' + s.node + (s.version && s.version !== '0.0.0' ? ' · v' + s.version : '')),
      line('Base', s.database ? (s.database.ok ? 'répond en ' + s.database.latency_ms + ' ms' : 'injoignable (' + (s.database.error_code || '?') + ')') : '—', s.database && !s.database.ok ? 'down' : null),
      line('Migrations', m.expected != null ? (m.applied ?? '?') + ' / ' + m.expected + (pending ? ' · en attente : ' + pending : '') : '—', m.ok === false ? 'down' : null),
      line('Variables', s.env ? (s.env.ok ? 'requises présentes' : 'absentes : ' + s.env.missing.join(', ')) : '—', s.env && !s.env.ok ? 'down' : null),
      line('Empreintes', s.hash_index ? (s.hash_index.loaded ? num(s.hash_index.count) + ' cartes indexées' + (s.hash_index.missing ? ' · ' + num(s.hash_index.missing) + ' hors index' : '') : 'index non chargé') : '—', s.hash_index && s.hash_index.loaded === false ? 'warn' : null)));
}

function platformGrid(serviceId) {
  return el('div', { class: 'dt-platforms' }, platforms(serviceId).map((p) => el('div', { class: 'bz-card dt-platform' },
    el('b', { text: p.name }),
    el('span', { class: 'bz-small bz-muted', text: p.role }),
    el('div', { class: 'dt-platform-links' },
      external(p.url, 'Ouvrir ↗', 'bz-btn is-sm is-violet'),
      el('span', { class: 'dt-platform-more' }, p.links.map(([label, href]) => external(href, label + ' ↗')))))));
}

// ---------- Le modèle conceptuel de données ----------

// L'état vivant d'une case du schéma : le pire de ses sources, de ses crons et
// de ses passes. Une case sans rien de vivant ne porte pas de pastille du tout,
// plutôt qu'une grise qui se lirait « au repos ».
function nodeStatus(node, r) {
  const found = [];
  for (const id of node.providers || []) {
    const p = r.providers.find((x) => x.id === id);
    if (p) found.push(p.status);
  }
  for (const id of node.crons || []) {
    const c = r.crons.find((x) => x.id === id);
    if (c) found.push(c.status);
  }
  if (node.syncs) for (const s of r.syncs.items) found.push(s.status);
  return found.length ? worst(found) : null;
}

function mcdFlow(r) {
  return el('div', { class: 'dt-flow' }, LAYERS.map((layer, i) => el('div', { class: 'dt-layer' },
    i ? el('span', { class: 'dt-layer-arrow', 'aria-hidden': 'true', text: '↓' }) : null,
    el('div', { class: 'dt-layer-head' },
      el('span', { class: 'dt-layer-num', text: String(i + 1) }),
      el('b', { text: layer.title })),
    el('p', { class: 'bz-tiny dt-layer-note', text: layer.note }),
    el('div', { class: 'dt-nodes' }, layer.nodes.map((n) => {
      const st = nodeStatus(n, r);
      return el('div', { class: 'dt-node' + (st ? ' is-' + st : '') },
        el('div', { class: 'dt-node-top' }, st ? dot(st, TONES[st] ? TONES[st][0] : null) : null, el('b', { text: n.label })),
        el('span', { class: 'bz-tiny', text: n.detail }));
    })))));
}

function mcdBatches(r) {
  // Le rythme et la source viennent de la carte ; l'état, du rapport, en
  // rapprochant les clés de passe du préfixe de chaque ligne.
  const stateOf = (key) => {
    const prefix = key.endsWith('*') ? key.slice(0, -1) : null;
    const items = r.syncs.items.filter((s) => (prefix ? s.key.startsWith(prefix) : s.key === key));
    if (!items.length) return null;
    return { status: worst(items.map((s) => s.status)), count: items.length };
  };
  return el('div', { class: 'bz-table-wrap' },
    el('table', { class: 'bz-table dt-table' },
      el('thead', {}, el('tr', {}, ['Passe', 'Rythme', 'Source', 'Ce qu’elle écrit', 'État'].map((t) => el('th', { text: t })))),
      el('tbody', {}, BATCHES.map((b) => {
        const st = stateOf(b.key);
        return el('tr', {},
          el('td', {}, el('b', { style: { fontFamily: 'var(--font-ui)' }, text: b.label })),
          el('td', { text: b.rhythm }),
          el('td', { text: b.source }),
          el('td', { text: b.writes }),
          el('td', {}, st ? el('span', { class: 'dt-inline' }, dot(st.status), el('span', { text: st.count > 1 ? st.count + ' passes' : '1 passe' })) : el('span', { class: 'bz-muted', text: '—' })));
      }))));
}

const mcdRules = () => el('ul', { class: 'dt-rules' }, RULES.map((t) => el('li', { text: t })));

// ---------- Sections repliables ----------

const isOpen = (id) => dt.open.has(id);

function toggle(id, rerender) {
  if (dt.open.has(id)) dt.open.delete(id);
  else dt.open.add(id);
  dt.focus = null;
  rerender();
}

// Une sous-section : sa ligne porte sa santé, son contenu ne se construit que
// dépliée - trente lignes de service ne se fabriquent pas pour rester cachées.
function subSection(sub, rerender) {
  const open = isOpen(sub.id);
  const trouble = troubleText(sub.statuses);
  const head = el('button', {
    class: 'dt-sub-head', type: 'button', 'aria-expanded': String(open), 'aria-controls': anchor(sub.id),
    onclick: () => toggle(sub.id, rerender)
  },
  el('span', { class: 'dt-caret' + (open ? ' is-open' : ''), 'aria-hidden': 'true', text: '›' }),
  dot(sub.status),
  el('b', { text: sub.title }),
  el('span', { class: 'dt-count', text: String(sub.count) }),
  trouble ? el('span', { class: 'dt-trouble is-' + sub.status, text: trouble }) : null,
  sub.hint && !trouble ? el('span', { class: 'dt-sub-hint', text: sub.hint }) : null);
  return el('div', { class: 'dt-sub' + (open ? ' is-open' : '') }, head,
    open ? el('div', { class: 'dt-sub-body', id: anchor(sub.id) }, sub.body()) : null);
}

// Une section. Sa ligne montre UNE PASTILLE PAR SOUS-SECTION : c'est la
// « vision sur la ligne » demandée le 23/09/2026 - on voit laquelle des quatre
// familles est rouge sans rien ouvrir.
function section(sec, rerender) {
  const open = isOpen(sec.id);
  const subs = sec.subs || [];
  const trouble = troubleText(sec.statuses);
  // Une section qui DÉCRIT n'a pas de santé : lui coller des pastilles grises
  // ferait lire « au repos » là où il n'y a rien à mesurer.
  const strip = sec.descriptive ? null
    : subs.length
      ? el('span', { class: 'dt-strip' }, subs.map((s) => dot(s.status, s.title + ' : ' + (TONES[s.status] ? TONES[s.status][0] : s.status))))
      : dot(sec.status);
  const head = el('button', {
    class: 'dt-sec-head', type: 'button', 'aria-expanded': String(open), 'aria-controls': anchor(sec.id),
    onclick: () => toggle(sec.id, rerender)
  },
  el('span', { class: 'dt-caret' + (open ? ' is-open' : ''), 'aria-hidden': 'true', text: '›' }),
  el('span', { class: 'dt-sec-title' }, el('b', { text: sec.title }), sec.hint ? el('span', { class: 'bz-tiny', text: sec.hint }) : null),
  trouble ? el('span', { class: 'dt-trouble is-' + sec.status, text: trouble }) : null,
  strip);
  return el('section', { class: 'bz-card dt-sec' + (open ? ' is-open' : '') }, head,
    open ? el('div', { class: 'dt-sec-body', id: anchor(sec.id) },
      subs.length ? subs.map((s) => subSection(s, rerender)) : sec.body()) : null);
}

// ---------- L'arbre, construit une fois par rendu ----------

// Chaque feuille est nommée : c'est ce qui permet au bandeau d'alerte de dire
// « eBay, Cron Scellés » plutôt que « 2 points en difficulté », et d'y sauter.
function buildTree(r, ctx) {
  const leaves = [];
  const note = (key, label, status, sectionId, subId) => {
    leaves.push({ key, label, status, sectionId, subId });
    return status;
  };

  const secs = [];

  // 1 — Le serveur, en premier et déplié.
  secs.push({
    id: 'server',
    title: 'Serveur',
    hint: r.environment === 'production' ? 'production' : 'local',
    status: note('server', 'Serveur', r.server.status, 'server', null),
    statuses: [r.server.status],
    body: () => serverCard(r.server)
  });

  // 2 — Les sources extérieures, une sous-section par famille.
  const sourceSubs = [];
  for (const g of r.groups) {
    const list = r.providers.filter((p) => p.group === g.id);
    if (!list.length) continue;
    const statuses = list.map((p) => note('provider:' + p.id, p.label, p.status, 'sources', 'sources:' + g.id));
    sourceSubs.push({
      id: 'sources:' + g.id,
      title: g.label,
      count: list.length,
      status: worst(statuses),
      statuses,
      body: () => list.map((p) => providerRow(p, ctx))
    });
  }
  const sourceStatuses = sourceSubs.flatMap((s) => s.statuses);
  secs.push({
    id: 'sources',
    title: 'Sources externes',
    hint: r.providers.length + ' services suivis',
    status: worst(sourceStatuses),
    statuses: sourceStatuses,
    subs: sourceSubs
  });

  // 3 — Les passes, les crons et les actus.
  const syncStatuses = r.syncs.items.map((s) => note('sync:' + s.key, s.label, s.status, 'jobs', 'jobs:syncs'));
  const cronStatuses = r.crons.map((c) => note('cron:' + c.id, 'Cron ' + c.label, c.status, 'jobs', 'jobs:crons'));
  const newsStatus = note('news', 'Sources d’actus', r.news.status, 'jobs', 'jobs:news');
  const jobSubs = [
    {
      id: 'jobs:syncs',
      title: 'Passes quotidiennes',
      count: r.syncs.items.length,
      status: r.syncs.enabled ? worst(syncStatuses) : 'idle',
      statuses: r.syncs.enabled ? syncStatuses : [],
      hint: r.syncs.enabled ? null : 'coupées sur ce serveur',
      body: () => [
        !r.syncs.enabled ? el('p', { class: 'bz-tiny dt-note', text: 'Synchros de fond coupées sur ce serveur : c’est normal en local, elles ne tournent qu’en production.' }) : null,
        r.syncs.items.map((s) => jobRow('sync:' + s.key, s.status, s.label, s.headline,
          (s.last_success_at ? 'Dernière réussite ' + agoFr(s.last_success_at) : 'Aucune réussite enregistrée') + ' · rythme ' + (s.rhythm || (s.period_h > 24 ? 'hebdomadaire' : 'quotidien'))))
      ]
    },
    {
      id: 'jobs:crons',
      title: 'Crons GitHub',
      count: r.crons.length,
      status: worst(cronStatuses),
      statuses: cronStatuses,
      body: () => r.crons.map((c) => jobRow('cron:' + c.id, c.status, 'Cron GitHub · ' + c.label + ' (' + c.rhythm + ')', c.headline,
        c.last_at ? 'Dernier passage reçu ' + agoFr(c.last_at) : 'Aucun passage reçu par ce serveur'))
    },
    {
      id: 'jobs:news',
      title: 'Sources d’actus',
      count: r.news.active,
      status: newsStatus,
      statuses: [newsStatus],
      body: () => jobRow('news', r.news.status, 'Sources d’actus', r.news.headline,
        r.news.failing.length ? r.news.failing.map((s) => s.name + ' (' + plural(s.error_count, 'erreur', 'erreurs') + ')').join(' · ') : null)
    }
  ];
  const jobStatuses = jobSubs.flatMap((s) => s.statuses);
  secs.push({
    id: 'jobs',
    title: 'Synchros et tâches planifiées',
    hint: 'ce qui tourne sans que personne ne l’ait demandé',
    status: worst(jobStatuses),
    statuses: jobStatuses,
    subs: jobSubs
  });

  // 4 — Le modèle de données. Aucune santé propre : il décrit, il ne mesure
  // pas. Ses pastilles sont celles des sources, reprises dans le schéma.
  secs.push({
    id: 'mcd',
    title: 'Modèle de données (MCD)',
    hint: 'd’où vient une donnée, qui la rafraîchit, qui la lit',
    status: 'idle',
    statuses: [],
    descriptive: true,
    subs: [
      { id: 'mcd:flow', title: 'Le chemin d’une donnée', count: LAYERS.length, status: 'idle', statuses: [], hint: 'de la source à l’écran', body: () => mcdFlow(r) },
      { id: 'mcd:batch', title: 'Les passes de rafraîchissement', count: BATCHES.length, status: 'idle', statuses: [], hint: 'rythme, source, tables écrites', body: () => mcdBatches(r) },
      { id: 'mcd:rules', title: 'Les règles qui ne se lisent pas sur un schéma', count: RULES.length, status: 'idle', statuses: [], body: () => mcdRules() }
    ]
  });

  // 5 — Les plateformes, qui n'ont pas d'état : ce sont des portes.
  secs.push({
    id: 'platforms',
    title: 'Plateformes',
    hint: 'les consoles où tout cela se configure',
    status: 'idle',
    statuses: [],
    descriptive: true,
    body: () => platformGrid(r.server ? r.server.service_id : null)
  });

  return { secs, leaves };
}

// ---------- Le bandeau d'alerte ----------

// Il remontait « 2 points en difficulté » sans dire lesquels (demande du
// 23/09/2026 : « j'aimerais savoir précisément sur quels éléments »). Il nomme
// maintenant chaque élément, et chaque nom ouvre sa section, sa sous-section,
// et saute dessus.
function jumpTo(leaf, rerender) {
  if (leaf.sectionId) dt.open.add(leaf.sectionId);
  if (leaf.subId) dt.open.add(leaf.subId);
  dt.focus = leaf.key;
  rerender();
  // Après le rendu : la ligne n'existe dans le document qu'une fois sa
  // sous-section dépliée.
  requestAnimationFrame(() => {
    const node = document.getElementById(anchor(leaf.key));
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function banner(r, leaves, ctx) {
  const { rerender } = ctx;
  const down = leaves.filter((l) => l.status === 'down');
  const warn = leaves.filter((l) => l.status === 'warn');
  const tone = down.length ? 'down' : warn.length ? 'warn' : 'ok';
  const title = down.length ? plural(down.length, 'point en difficulté', 'points en difficulté')
    : warn.length ? 'Tout répond · ' + plural(warn.length, 'point à surveiller', 'points à surveiller')
      : 'Tout fonctionne';
  const sub = 'Mesuré à ' + timeFr(r.generated_at) + ' · ' + (r.environment === 'production' ? 'serveur de production' : 'serveur local');
  const refresh = el('button', {
    class: 'bz-btn is-sm', type: 'button', disabled: dt.refreshing, text: dt.refreshing ? 'Actualisation…' : 'Actualiser',
    onclick: () => {
      dt.refreshing = true;
      rerender();
      loadData().then(() => {
        dt.refreshing = false;
        rerender();
      });
    }
  });
  const all = el('button', {
    class: 'bz-btn is-sm is-violet', type: 'button', disabled: dt.probingAll, text: dt.probingAll ? 'Tests en cours…' : 'Tout tester',
    onclick: () => probe(null, ctx)
  });
  const chip = (leaf) => el('button', {
    class: 'dt-chip is-' + leaf.status, type: 'button',
    title: 'Ouvrir « ' + leaf.label + ' » dans la liste',
    onclick: () => jumpTo(leaf, rerender)
  }, dot(leaf.status), el('span', { text: leaf.label }));
  const named = [...down, ...warn];
  return el('section', { class: 'dt-banner is-' + tone },
    el('div', { class: 'dt-banner-row' },
      dot(tone),
      el('div', { class: 'dt-banner-text' }, el('b', { text: title }), el('span', { class: 'bz-small bz-muted', text: sub })),
      el('div', { class: 'dt-banner-actions' }, refresh, all)),
    named.length ? el('div', { class: 'dt-chips' },
      el('span', { class: 'bz-tiny dt-chips-label', text: down.length && warn.length ? 'En panne, puis à surveiller :' : down.length ? 'En panne :' : 'À surveiller :' }),
      named.map(chip)) : null);
}

export function renderData({ rerender, toast, icon }) {
  const ctx = { rerender, toast };
  if (dt.status === 'idle') {
    dt.status = 'loading';
    loadData().then(rerender);
  }
  const blocks = [];
  if (dt.report) {
    const { secs, leaves } = buildTree(dt.report, ctx);
    if (dt.error) blocks.push(el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginBottom: '10px' }, text: 'Dernière mise à jour impossible : ' + dt.error }));
    blocks.push(banner(dt.report, leaves, ctx));
    blocks.push(...secs.map((s) => section(s, rerender)));
  } else if (dt.status === 'absent') {
    blocks.push(el('section', { class: 'bz-card adm-agent-empty' },
      el('span', { class: 'adm-agent-empty-icon' }, icon('data', 22)),
      el('b', { text: 'Data : pas encore branché côté serveur' }),
      el('p', { class: 'bz-small bz-muted', text: 'Ce serveur ne connaît pas encore /admin/data. L’état des services apparaîtra ici dès que l’API qui le mesure sera en ligne. Les plateformes, elles, sont déjà là.' })),
    el('h2', { class: 'bz-h3 adm-agent-title', text: 'Plateformes' }), platformGrid(null));
  } else if (dt.status === 'error') {
    blocks.push(el('div', { class: 'bz-msg is-err', role: 'alert' },
      el('span', { text: 'Data indisponible : ' + dt.error + ' ' }),
      el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Réessayer', onclick: () => { dt.status = 'loading'; rerender(); loadData().then(rerender); } })),
    el('h2', { class: 'bz-h3 adm-agent-title', text: 'Plateformes' }), platformGrid(null));
  } else {
    blocks.push(el('div', { class: 'bz-skeleton', style: { height: '84px' } }), el('div', { class: 'bz-skeleton', style: { height: '360px', marginTop: '12px' } }));
  }
  return el('div', { class: 'dt' }, blocks);
}
