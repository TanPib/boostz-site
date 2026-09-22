// La vue « Data » de la console : l'état des services extérieurs dont dépend
// l'application, de ses passes quotidiennes, des crons GitHub et du serveur,
// avec les liens vers les consoles qui la configurent.
//
// Née du blocage tcgcsv du 09/09/2026 : une semaine de 403 que rien n'a montré
// avant qu'on lise les journaux de Render. Tout vient de GET /admin/data
// (services/upstreamReport.js). Les verdicts et leurs phrases y sont calculés,
// la console n'y ajoute que la couleur.
//
// LES PLATEFORMES SONT ÉCRITES EN DUR, ICI : elles doivent rester là quand
// l'API est tombée, c'est-à-dire au moment où on en a le plus besoin.
import { call } from './api.js';
import { el, dateTime } from './chrome.js';

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
const dot = (status) => el('span', { class: 'dt-dot is-' + (status || 'idle'), 'aria-hidden': 'true' });
const external = (href, text, cls) => el('a', { class: cls || null, href, target: '_blank', rel: 'noopener noreferrer', text });
const plural = (n, one, many) => n + ' ' + (n > 1 ? many : one);

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

const dt = { status: 'idle', report: null, error: null, seq: 0, refreshing: false, probing: new Set(), probingAll: false };

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
  const v = p.extra && p.extra.vision;
  if (v) return el('span', { class: 'dt-meta', text: 'Comparaisons d’impression aujourd’hui : ' + num(v.used) + ' / ' + num(v.limit) });
  return null;
}

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
  return el('div', { class: 'dt-row' },
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

function jobRow(status, label, headline, meta) {
  return el('div', { class: 'dt-row' },
    dot(status),
    el('div', { class: 'dt-main' },
      el('div', { class: 'dt-top' }, el('b', { text: label }), pill(status)),
      el('span', { class: 'dt-headline is-' + status, text: headline }),
      meta ? el('span', { class: 'dt-meta', text: meta }) : null));
}

function jobsCard(r) {
  const rows = [];
  if (!r.syncs.enabled) rows.push(el('p', { class: 'bz-tiny dt-note', text: 'Synchros de fond coupées sur ce serveur : c’est normal en local, elles ne tournent qu’en production.' }));
  for (const s of r.syncs.items) {
    rows.push(jobRow(s.status, s.label, s.headline,
      (s.last_success_at ? 'Dernière réussite ' + agoFr(s.last_success_at) : 'Aucune réussite enregistrée') + ' · rythme ' + (s.period_h > 24 ? 'hebdomadaire' : 'quotidien')));
  }
  for (const c of r.crons) {
    rows.push(jobRow(c.status, 'Cron GitHub · ' + c.label + ' (' + c.rhythm + ')', c.headline,
      c.last_at ? 'Dernier passage reçu ' + agoFr(c.last_at) : 'Aucun passage reçu par ce serveur'));
  }
  rows.push(jobRow(r.news.status, 'Sources d’actus', r.news.headline,
    r.news.failing.length ? r.news.failing.map((s) => s.name + ' (' + plural(s.error_count, 'erreur', 'erreurs') + ')').join(' · ') : null));
  return el('section', { class: 'bz-card dt-group' }, rows);
}

function serverCard(s) {
  const line = (label, value, tone) => el('div', { class: 'adm-line' },
    el('span', { class: 'bz-muted', text: label }),
    el('b', { class: tone ? 'dt-headline is-' + tone : null }, value));
  const m = s.migrations || {};
  const pending = (m.pending || []).join(', ');
  return el('section', { class: 'bz-card dt-server' },
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

function reportBlocks(r, ctx) {
  const { red, orange } = r.summary;
  const tone = red ? 'down' : orange ? 'warn' : 'ok';
  const title = red ? plural(red, 'point en difficulté', 'points en difficulté')
    : orange ? 'Tout répond · ' + plural(orange, 'point à surveiller', 'points à surveiller')
      : 'Tout fonctionne';
  const sub = 'Mesuré à ' + timeFr(r.generated_at) + ' · ' + (r.environment === 'production' ? 'serveur de production' : 'serveur local')
    + (red && orange ? ' · ' + plural(orange, 'autre à surveiller', 'autres à surveiller') : '');
  const refresh = el('button', {
    class: 'bz-btn is-sm', type: 'button', disabled: dt.refreshing, text: dt.refreshing ? 'Actualisation…' : 'Actualiser',
    onclick: () => {
      dt.refreshing = true;
      ctx.rerender();
      loadData().then(() => {
        dt.refreshing = false;
        ctx.rerender();
      });
    }
  });
  const all = el('button', {
    class: 'bz-btn is-sm is-violet', type: 'button', disabled: dt.probingAll, text: dt.probingAll ? 'Tests en cours…' : 'Tout tester',
    onclick: () => probe(null, ctx)
  });
  const blocks = [
    dt.error ? el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginBottom: '10px' }, text: 'Dernière mise à jour impossible : ' + dt.error }) : null,
    el('section', { class: 'dt-banner is-' + tone },
      dot(tone),
      el('div', { class: 'dt-banner-text' }, el('b', { text: title }), el('span', { class: 'bz-small bz-muted', text: sub })),
      el('div', { class: 'dt-banner-actions' }, refresh, all)),
    el('h2', { class: 'bz-h3 adm-agent-title', text: 'Sources externes' })
  ];
  for (const g of r.groups) {
    const list = r.providers.filter((p) => p.group === g.id);
    if (!list.length) continue;
    blocks.push(el('section', { class: 'bz-card dt-group' },
      el('div', { class: 'adm-list-head', text: g.label + ' · ' + list.length }),
      list.map((p) => providerRow(p, ctx))));
  }
  blocks.push(el('h2', { class: 'bz-h3 adm-agent-title', text: 'Synchros et tâches planifiées' }), jobsCard(r));
  blocks.push(el('h2', { class: 'bz-h3 adm-agent-title', text: 'Serveur' }), serverCard(r.server));
  return blocks;
}

export function renderData({ rerender, toast, icon }) {
  const ctx = { rerender, toast };
  if (dt.status === 'idle') {
    dt.status = 'loading';
    loadData().then(rerender);
  }
  const blocks = [];
  if (dt.report) blocks.push(...reportBlocks(dt.report, ctx));
  else if (dt.status === 'absent') {
    blocks.push(el('section', { class: 'bz-card adm-agent-empty' },
      el('span', { class: 'adm-agent-empty-icon' }, icon('data', 22)),
      el('b', { text: 'Data : pas encore branché côté serveur' }),
      el('p', { class: 'bz-small bz-muted', text: 'Ce serveur ne connaît pas encore /admin/data. L’état des services apparaîtra ici dès que l’API qui le mesure sera en ligne. Les plateformes, elles, sont déjà là.' })));
  } else if (dt.status === 'error') {
    blocks.push(el('div', { class: 'bz-msg is-err', role: 'alert' },
      el('span', { text: 'Data indisponible : ' + dt.error + ' ' }),
      el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Réessayer', onclick: () => { dt.status = 'loading'; rerender(); loadData().then(rerender); } })));
  } else {
    blocks.push(el('div', { class: 'bz-skeleton', style: { height: '84px' } }), el('div', { class: 'bz-skeleton', style: { height: '360px', marginTop: '12px' } }));
  }
  blocks.push(el('h2', { class: 'bz-h3 adm-agent-title', text: 'Plateformes' }), platformGrid(dt.report && dt.report.server ? dt.report.server.service_id : null));
  return el('div', { class: 'dt' }, blocks);
}
