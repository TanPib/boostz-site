// L'onglet « Prospection » de la console (31/10/2026) : le CRM des boutiques à
// qui BoostZ propose le programme Boutiques partenaires (GET /admin/prospection,
// boostz-mobile server/src/routes/adminProspection.js et lib/prospection*.js).
//
// Ce qu'on y fait : suivre l'avancement par région et par département, ouvrir
// la fiche d'une boutique (son historique, ses e-mails, ses messages privés à
// copier), noter un appel ou un « STOP », envoyer un e-mail, modifier les
// textes, régler l'envoi automatique et tenir la liste « Ne pas contacter ».
// Tout admin lit et note ; seul un super admin envoie, règle, modifie les
// textes, importe, ou retire une adresse de la liste.
//
// Aucun texte venu de l'API n'entre en HTML : les aperçus d'e-mails sont
// construits ici, élément par élément (renderMarked), depuis le texte balisé
// (**gras**, « - » pour une liste, {schema} pour le schéma).
import { call } from './api.js';
import { el, dateShort, dateTimeShort } from './chrome.js';

const pr = {
  status: 'idle', data: null, error: null, view: 'overview', busy: new Set(),
  list: { q: '', status: '', priority: '', region: '', department: '', channel: '', review: '', page: 0, data: null, loading: false, seq: 0 },
  fiche: null, ficheId: null, back: 'list',
  templates: null, tplKey: 'email_1', draft: null, preview: null,
  optouts: null, optQ: '', importing: null,
  // Les blocs dépliés : la page est redessinée à chaque réponse de l'API, et un
  // aperçu ouvert ne doit pas se refermer sous les yeux.
  open: new Set()
};

const STATUS_TONE = {
  TO_CONTACT: 'is-grey', CONTACTED: 'is-violet', FOLLOWED_UP: 'is-violet', TO_PROCESS: 'is-amber', INTERESTED: 'is-green',
  MEETING: 'is-green', PARTNER: 'is-green', NOT_INTERESTED: 'is-red', OPTED_OUT: 'is-red', INVALID: 'is-red'
};
const CHANNELS = { email: 'E-mail', facebook: 'Facebook', instagram: 'Instagram', phone: 'Téléphone', none: 'Aucun contact' };
const WEEKDAYS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Jeu'], [5, 'Ven'], [6, 'Sam'], [7, 'Dim']];

const btn = (text, onclick, opts = {}) => el('button', { class: 'bz-btn is-sm' + (opts.tone ? ' is-' + opts.tone : ''), type: 'button', text, onclick, disabled: !!opts.disabled, title: opts.title || null });
const pill = (text, tone) => el('span', { class: 'bz-pill ' + (tone || 'is-grey'), text });
const tile = (label, value, sub, tone) => el('div', { class: 'bz-card is-tight adm-kpi' },
  el('span', { class: 'bz-eyebrow', text: label }),
  el('div', { class: 'adm-kpi-value', style: tone ? { color: tone } : null, text: String(value) }),
  sub ? el('span', { class: 'bz-tiny bz-muted', text: sub }) : null);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const bar = (part, total, tone = '#A98BFF') => el('div', { class: 'pr-bar', title: part + ' / ' + total },
  el('span', { style: { width: pct(part, total) + '%', background: tone } }));
// Un lien vers l'extérieur n'est accepté qu'en http(s).
const safeUrl = (u) => {
  const s = String(u || '').trim();
  if (!s) return null;
  const full = /^https?:\/\//i.test(s) ? s : 'https://' + s;
  return /^https?:\/\/[^\s"<>]+$/i.test(full) ? full : null;
};
// Un bloc dépliable qui se souvient d'être ouvert.
const fold = (key, summary, ...children) => {
  const d = el('details', { class: 'pr-details', open: pr.open.has(key) }, el('summary', { text: summary }), ...children);
  d.addEventListener('toggle', () => { if (d.open) pr.open.add(key); else pr.open.delete(key); });
  return d;
};
const ext = (href, text) => (safeUrl(href) ? el('a', { href: safeUrl(href), target: '_blank', rel: 'noopener noreferrer', text }) : null);

async function copy(text, ctx) {
  try {
    await navigator.clipboard.writeText(text);
    ctx.toast('Copié.');
  } catch {
    ctx.toast('Copie impossible dans ce navigateur : sélectionne le texte à la main.', 'err');
  }
}

// ---------- chargements ----------

async function loadOverview(rerender) {
  try {
    pr.data = await call('/admin/prospection');
    pr.status = 'ready';
    pr.error = null;
  } catch (e) {
    pr.status = e.status === 404 ? 'absent' : pr.data ? 'ready' : 'error';
    pr.error = e.message;
  }
  rerender();
}

function listQuery() {
  const l = pr.list;
  const p = new URLSearchParams();
  for (const k of ['q', 'status', 'priority', 'region', 'department', 'channel', 'review']) if (l[k]) p.set(k, l[k]);
  if (l.page) p.set('page', String(l.page));
  if (l.sort) p.set('sort', l.sort);
  return p.toString();
}

async function loadList(rerender) {
  const seq = ++pr.list.seq;
  pr.list.loading = true;
  rerender();
  try {
    const data = await call('/admin/prospection/prospects?' + listQuery());
    if (seq !== pr.list.seq) return;
    pr.list.data = data;
  } catch (e) {
    if (seq !== pr.list.seq) return;
    pr.list.error = e.message;
  }
  pr.list.loading = false;
  rerender();
}

async function openFiche(id, ctx, back = pr.view) {
  pr.ficheId = id;
  pr.back = back === 'fiche' ? pr.back : back;
  pr.view = 'fiche';
  pr.fiche = null;
  ctx.rerender();
  try {
    pr.fiche = await call('/admin/prospection/prospects/' + encodeURIComponent(id));
  } catch (e) {
    ctx.toast(e.message, 'err');
    pr.view = pr.back;
  }
  ctx.rerender();
}

async function loadTemplates(ctx) {
  try {
    pr.templates = await call('/admin/prospection/templates');
    selectTemplate(pr.tplKey);
  } catch (e) {
    ctx.toast(e.message, 'err');
  }
  ctx.rerender();
}

async function loadOptOuts(ctx) {
  try {
    pr.optouts = (await call('/admin/prospection/opt-outs' + (pr.optQ ? '?q=' + encodeURIComponent(pr.optQ) : ''))).opt_outs;
  } catch (e) {
    ctx.toast(e.message, 'err');
  }
  ctx.rerender();
}

// Un geste : bouton occupé le temps de la requête, puis tout est relu.
async function act(key, fn, ctx, message) {
  if (pr.busy.has(key)) return null;
  pr.busy.add(key);
  ctx.rerender();
  try {
    const r = await fn();
    if (message) ctx.toast(typeof message === 'function' ? message(r) : message);
    return r;
  } catch (e) {
    ctx.toast(e.message, 'err');
    return null;
  } finally {
    pr.busy.delete(key);
    loadOverview(ctx.rerender);
  }
}

// ---------- l'aperçu d'un e-mail, construit élément par élément ----------

function inline(text) {
  const out = [];
  const parts = String(text).split('**');
  parts.forEach((part, i) => { if (part) out.push(i % 2 ? el('b', { text: part }) : document.createTextNode(part)); });
  return out;
}

// La signature Gmail de BoostZ, telle que le serveur l'ajoute aux e-mails
// (boostz-mobile server/src/lib/prospectionSignature.js), avec les images du
// site.
function signaturePreview() {
  const img = (file, alt, w, h) => el('img', { src: 'assets/signature/' + file, alt, width: String(w), height: String(h), style: { display: 'block', width: w + 'px', height: h ? h + 'px' : 'auto', maxWidth: '100%' } });
  return el('div', { class: 'pr-sig' },
    el('p', { class: 'pr-sig-hello', text: 'Boostément,' }),
    el('div', { class: 'pr-sig-card' },
      img('carte-tp-feutre.png', 'TP', 52, 70),
      el('div', {},
        el('div', { class: 'pr-sig-name', text: 'Tanguy Pibarot' }),
        el('div', { class: 'pr-sig-role' }, 'Fondateur de ', el('b', { text: 'BoostZ' })),
        el('div', { class: 'pr-sig-role', text: 'boostz.info@gmail.com · 06.14.43.68.86' }),
        el('div', { class: 'pr-sig-links' }, el('b', { text: 'boostz.fr' }),
          ...[['icone-instagram.png', 'Instagram'], ['icone-tiktok.png', 'TikTok'], ['icone-facebook.png', 'Facebook'], ['icone-discord.png', 'Discord']].map(([f, a]) => img(f, a, 22, 22))))),
    img('banniere-boostz.png', 'BoostZ, ton compagnon TCG : collection, cote, échange. boostz.fr', 480, 0));
}

export function renderMarked(body, footer) {
  const box = el('div', { class: 'pr-mail' });
  for (const block of String(body || '').trim().split(/\n{2,}/)) {
    if (block.trim() === '{schema}') {
      box.append(el('img', { src: 'assets/prospection/schema-echange.png', alt: 'Schéma : un échange, de l’appli à votre comptoir', class: 'pr-mail-schema' }));
      continue;
    }
    if (block.trim() === '{signature}') {
      box.append(signaturePreview());
      continue;
    }
    let list = null;
    let para = null;
    for (const line of block.split('\n')) {
      if (/^- /.test(line)) {
        para = null;
        if (!list) { list = el('ul'); box.append(list); }
        list.append(el('li', {}, ...inline(line.slice(2))));
      } else {
        list = null;
        if (!para) { para = el('p'); box.append(para); } else para.append(el('br'));
        para.append(...inline(line));
      }
    }
  }
  if (footer) {
    const f = el('div', { class: 'pr-mail-footer' }, el('span', { text: '—' }));
    for (const line of String(footer).split('\n')) f.append(el('br'), document.createTextNode(line));
    box.append(f);
  }
  return box;
}

// ---------- vue d'ensemble ----------

function sendingCard(ctx, canWrite) {
  const d = pr.data;
  const s = d.settings;
  const state = !s.mail_configured ? ['is-red', 'La boîte Gmail n’est pas branchée sur le serveur : rien ne peut partir. Il manque PROSPECTION_GMAIL_USER et PROSPECTION_GMAIL_APP_PASSWORD sur Render.']
    : s.paused_reason ? ['is-red', 'En pause : ' + s.paused_reason]
      : !s.sending_enabled ? ['is-grey', 'Envoi automatique éteint. Les e-mails ne partent qu’à la main, depuis la fiche d’une boutique.']
        : !d.window.open ? ['is-amber', 'Envoi automatique allumé, hors plage : ' + d.window.reason]
          : !d.budget.ok ? ['is-amber', 'Envoi automatique allumé, en attente : ' + d.budget.reason]
            : ['is-green', 'Envoi automatique allumé : un e-mail toutes les ' + Math.floor(60 / s.hourly_cap) + ' minutes au plus.'];
  const toggle = canWrite && s.mail_configured
    ? btn(s.sending_enabled && !s.paused_reason ? 'Éteindre l’envoi' : 'Allumer l’envoi', () => act('toggle', () => call('/admin/prospection/settings', { method: 'PATCH', body: { sending_enabled: !(s.sending_enabled && !s.paused_reason) } }), ctx, s.sending_enabled && !s.paused_reason ? 'Envoi éteint.' : 'Envoi allumé.'),
      { tone: s.sending_enabled && !s.paused_reason ? 'red' : 'green', disabled: pr.busy.has('toggle') })
    : null;
  const queue = d.queue.length
    ? el('ol', { class: 'pr-queue' }, d.queue.map((q) => el('li', {},
      el('button', { class: 'pr-link', type: 'button', text: q.prospect.name, onclick: () => openFiche(q.prospect.id, ctx) }),
      el('span', { class: 'bz-tiny bz-muted', text: ' · ' + [q.prospect.city, q.prospect.priority].filter(Boolean).join(' · ') + ' · ' + (q.step === 2 ? 'relance' : 'premier e-mail') }))))
    : el('p', { class: 'bz-small bz-muted', text: 'Personne à qui écrire seul pour l’instant : plus de boutique « À contacter » sans réserve, et aucune relance due.' });
  return el('section', { class: 'bz-card pr-send' },
    el('div', { class: 'pr-send-head' },
      el('span', { class: 'hm-dot ' + state[0].replace('is-', 'is-'), 'aria-hidden': 'true' }),
      el('b', { text: state[1] }),
      toggle),
    el('div', { class: 'pr-send-meta bz-small bz-muted' },
      el('span', { text: 'Aujourd’hui : ' + d.budget.sent_today + ' / ' + s.daily_cap + ' e-mails' }),
      el('span', { text: 'Dernière heure : ' + d.budget.sent_last_hour + ' / ' + s.hourly_cap }),
      el('span', { text: 'Plage : ' + s.window_start + '–' + s.window_end + ', ' + WEEKDAYS.filter(([n]) => s.weekdays.includes(n)).map(([, l]) => l).join(' ') }),
      el('span', { text: 'Relance à J+' + s.followup_days }),
      el('span', { text: 'Expéditeur : ' + s.sender_name + (s.sender_address ? ' <' + s.sender_address + '>' : '') }),
      el('span', { text: 'Réponses lues : ' + (s.replies_checked_at ? dateTimeShort(s.replies_checked_at) : 'jamais') }),
      s.mail_configured ? btn('Lire les réponses maintenant', () => act('poll', () => call('/admin/prospection/poll', { method: 'POST' }), ctx, (r) => r.read + ' e-mail(s) lu(s), ' + r.matched + ' réponse(s) de boutiques.'), { disabled: pr.busy.has('poll') }) : null),
    s.last_error ? el('p', { class: 'bz-tiny', style: { color: 'var(--soft-red-text)', margin: '6px 0 0' }, text: 'Dernière erreur : ' + s.last_error }) : null,
    el('h3', { class: 'bz-h3', style: { marginTop: '12px' }, text: 'Prochains envois' }),
    queue);
}

function overviewView(ctx, canWrite) {
  const d = pr.data;
  const t = d.summary.total;
  const reviewCount = Object.values(d.to_review).reduce((a, b) => a + b, 0);
  const kpis = el('div', { class: 'adm-agent-kpis' },
    tile('Boutiques', t.total, (t.by_status.TO_CONTACT || 0) + ' à contacter'),
    tile('Contactées', t.contacted, pct(t.contacted, t.total) + ' % du total'),
    tile('En conversation', t.talking, d.to_process + ' réponse(s) à traiter', d.to_process ? '#F8C46A' : null),
    tile('Partenaires', t.partners, 'programme signé', t.partners ? '#5FD3A3' : null),
    tile('Refus et STOP', t.closed, d.opt_outs + ' adresse(s) bloquée(s)'),
    tile('À vérifier', reviewCount, 'avant tout envoi', reviewCount ? '#F8C46A' : null));
  const todo = [];
  if (d.to_process) todo.push(btn(d.to_process + ' réponse(s) à traiter', () => presetList(ctx, { status: 'TO_PROCESS,INTERESTED' }), { tone: 'amber' }));
  if (reviewCount) todo.push(btn(reviewCount + ' fiche(s) à vérifier', () => presetList(ctx, { review: 'any' }), { tone: 'amber' }));
  if (d.followups_due) todo.push(el('span', { class: 'bz-small bz-muted', text: d.followups_due + ' relance(s) due(s), envoyées par la passe automatique.' }));

  const regions = el('div', { class: 'bz-table-wrap' }, el('table', { class: 'bz-table pr-table' },
    el('thead', {}, el('tr', {}, ['Région', 'Boutiques', 'Contactées', 'Avancement', 'En conversation', 'Partenaires', 'Refus'].map((h) => el('th', { text: h })))),
    el('tbody', {}, d.summary.regions.map((r) => el('tr', { class: 'pr-click', onclick: () => presetList(ctx, { region: r.region }) },
      el('td', { text: r.region }), el('td', { text: String(r.total) }), el('td', { text: String(r.contacted) }),
      el('td', {}, bar(r.contacted, r.total)), el('td', { text: String(r.talking) }), el('td', { text: String(r.partners) }), el('td', { text: String(r.closed) }))))));
  const departments = el('div', { class: 'bz-table-wrap' }, el('table', { class: 'bz-table pr-table' },
    el('thead', {}, el('tr', {}, ['Dépt', 'Département', 'Région', 'Boutiques', 'Contactées', 'Avancement', 'Partenaires'].map((h) => el('th', { text: h })))),
    el('tbody', {}, d.summary.departments.map((dep) => el('tr', { class: 'pr-click', onclick: () => presetList(ctx, { department: dep.code }) },
      el('td', { text: dep.code }), el('td', { text: dep.name }), el('td', { class: 'bz-muted', text: dep.region }), el('td', { text: String(dep.total) }),
      el('td', { text: String(dep.contacted) }), el('td', {}, bar(dep.contacted, dep.total, dep.partners ? '#5FD3A3' : '#A98BFF')), el('td', { text: String(dep.partners) }))))));
  const recent = d.recent.length
    ? el('ul', { class: 'pr-timeline' }, d.recent.map((e) => el('li', {},
      el('span', { class: 'bz-tiny bz-muted', text: dateTimeShort(e.created_date) }),
      el('b', { text: ' ' + e.label + ' · ' }),
      e.prospect ? el('button', { class: 'pr-link', type: 'button', text: e.prospect.name, onclick: () => openFiche(e.prospect.id, ctx) }) : null,
      e.summary ? el('div', { class: 'bz-small bz-muted pr-clip', text: e.summary }) : null)))
    : el('p', { class: 'bz-small bz-muted', text: 'Rien encore.' });
  return el('div', { class: 'bl' },
    kpis,
    todo.length ? el('div', { class: 'bz-row' }, ...todo) : null,
    sendingCard(ctx, canWrite),
    el('section', { class: 'bz-card' }, el('h3', { class: 'bz-h3', text: 'Par région' }), regions),
    el('section', { class: 'bz-card' }, fold('departments', 'Par département (' + d.summary.departments.length + ')', departments)),
    el('section', { class: 'bz-card' }, el('h3', { class: 'bz-h3', text: 'Dernière activité' }), recent));
}

function presetList(ctx, filters) {
  Object.assign(pr.list, { q: '', status: '', priority: '', region: '', channel: '', review: '', department: '', page: 0 }, filters);
  pr.view = 'list';
  loadList(ctx.rerender);
}

// ---------- la liste ----------

function listView(ctx) {
  const d = pr.data;
  const l = pr.list;
  const set = (k) => (e) => { l[k] = e.target.value; l.page = 0; loadList(ctx.rerender); };
  const select = (k, label, options) => el('select', { class: 'bz-input pr-filter', 'aria-label': label, onchange: set(k) },
    el('option', { value: '', text: label }), options.map(([v, t]) => el('option', { value: v, text: t, selected: l[k] === v })));
  let timer = null;
  const search = el('input', {
    type: 'search', class: 'bz-input pr-search', placeholder: 'Nom, ville, département, e-mail, code postal…', value: l.q,
    oninput: (e) => { clearTimeout(timer); timer = setTimeout(() => { l.q = e.target.value.trim(); l.page = 0; loadList(ctx.rerender); }, 300); }
  });
  const filters = el('div', { class: 'pr-filters' },
    search,
    select('status', 'Tous les statuts', [...Object.entries(d.statuses), ['TO_PROCESS,INTERESTED', 'Réponses à traiter']]),
    select('priority', 'Toutes priorités', [['A', 'Priorité A'], ['B', 'Priorité B'], ['C', 'Priorité C']]),
    select('region', 'Toutes les régions', d.summary.regions.map((r) => [r.region, r.region])),
    select('channel', 'Tous les canaux', [['email', 'E-mail'], ['social', 'Réseaux sans e-mail'], ['phone', 'Téléphone seulement'], ['none', 'Aucun contact']]),
    select('review', 'Réserves', [['any', 'À vérifier (toutes)'], ...Object.entries(d.review_reasons).map(([k, v]) => [k, v.split(' :')[0].split('.')[0]])]),
    l.department ? btn('Département ' + l.department + ' ✕', () => { l.department = ''; loadList(ctx.rerender); }) : null);
  if (!l.data) {
    if (!l.loading) loadList(ctx.rerender);
    return el('div', { class: 'bl' }, filters, el('div', { class: 'bz-skeleton', style: { height: '300px' } }));
  }
  const rows = l.data.prospects;
  const list = rows.length
    ? el('div', { class: 'bz-table-wrap' }, el('table', { class: 'bz-table pr-table' },
      el('thead', {}, el('tr', {}, ['', 'Boutique', 'Ville', 'Dépt', 'Statut', 'Canal', 'Dernier geste'].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.map((p) => el('tr', { class: 'pr-click', onclick: () => openFiche(p.id, ctx, 'list') },
        el('td', {}, pill(p.priority, p.priority === 'A' ? 'is-green' : p.priority === 'B' ? 'is-amber' : 'is-grey')),
        el('td', {}, el('b', { text: p.name }), p.review ? el('div', { class: 'bz-tiny', style: { color: '#F8C46A' }, text: '⚠ ' + p.review_label }) : null),
        el('td', { text: p.city || '—' }), el('td', { text: p.department_code || '—' }),
        el('td', {}, pill(p.status_label, STATUS_TONE[p.status])),
        el('td', { text: CHANNELS[p.channel] || p.channel }),
        el('td', { class: 'bz-muted', text: p.last_event_at ? dateShort(p.last_event_at) : '—' }))))))
    : el('p', { class: 'bz-small bz-muted', text: 'Aucune boutique ne correspond.' });
  const pages = Math.ceil(l.data.total / l.data.page_size);
  const nav = pages > 1 ? el('div', { class: 'bz-row', style: { justifyContent: 'space-between' } },
    btn('← Précédentes', () => { l.page -= 1; loadList(ctx.rerender); }, { disabled: l.page === 0 }),
    el('span', { class: 'bz-small bz-muted', text: 'Page ' + (l.page + 1) + ' sur ' + pages }),
    btn('Suivantes →', () => { l.page += 1; loadList(ctx.rerender); }, { disabled: l.page + 1 >= pages })) : null;
  return el('div', { class: 'bl' }, filters,
    el('p', { class: 'bz-small bz-muted', style: { margin: 0 }, text: l.data.total + ' boutique(s)' + (l.loading ? ' · chargement…' : '') }),
    list, nav);
}

// ---------- la fiche ----------

async function note(ctx, type, label, placeholder) {
  const v = await ctx.ask({ title: label, text: pr.fiche.prospect.name, fields: [{ name: 'text', label: 'Détails (facultatif sauf pour une note)', type: 'textarea', placeholder }], confirmLabel: 'Enregistrer' });
  if (!v) return;
  const channel = type === 'dm' ? (pr.fiche.prospect.channel === 'instagram' ? 'instagram' : 'facebook') : type === 'call' ? 'phone' : type === 'visit' ? 'visit' : null;
  const r = await act('ev', () => call('/admin/prospection/prospects/' + pr.ficheId + '/events', { method: 'POST', body: { type, text: v.text, channel } }), ctx, 'Noté.');
  if (r) { pr.fiche = r; ctx.rerender(); }
}

async function edit(ctx) {
  const p = pr.fiche.prospect;
  const fields = [['email', 'E-mail'], ['email_source', 'Source de l’adresse (« sur son site exemple.fr »)'], ['phone', 'Téléphone'], ['website', 'Site'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['notes', 'Notes']];
  const v = await ctx.ask({ title: 'Modifier la fiche', text: 'Laisse un champ vide pour garder sa valeur actuelle (affichée en gris), ou écris « - » pour l’effacer.', fields: fields.map(([name, label]) => ({ name, label, type: name === 'notes' ? 'textarea' : 'text', placeholder: p[name] || '' })), confirmLabel: 'Enregistrer' });
  if (!v) return;
  // ask() part de champs vides : un champ laissé vide garde l'ancienne valeur,
  // « - » l'efface.
  const body = {};
  for (const [name] of fields) {
    if (v[name] === '-') body[name] = null;
    else if (v[name]) body[name] = v[name];
  }
  if (!Object.keys(body).length) return;
  const r = await act('edit', () => call('/admin/prospection/prospects/' + pr.ficheId, { method: 'PATCH', body }), ctx, 'Fiche enregistrée.');
  if (r) { pr.fiche = r; ctx.rerender(); }
}

async function setReview(ctx, review) {
  const r = await act('review', () => call('/admin/prospection/prospects/' + pr.ficheId, { method: 'PATCH', body: { review } }), ctx, review ? 'Mise de côté.' : 'Réserve levée : la boutique peut recevoir les envois automatiques.');
  if (r) { pr.fiche = r; ctx.rerender(); }
}

async function send(ctx, step) {
  const p = pr.fiche.prospect;
  const ok = await ctx.ask({ title: step === 2 ? 'Envoyer la relance' : 'Envoyer le premier e-mail', text: 'À ' + p.email + ', depuis la boîte Gmail de BoostZ, maintenant. Il compte dans les plafonds du jour.', confirmLabel: 'Envoyer' });
  if (!ok) return;
  const r = await act('send', () => call('/admin/prospection/prospects/' + pr.ficheId + '/send', { method: 'POST', body: { step } }), ctx, 'E-mail envoyé.');
  if (r) { pr.fiche = r; ctx.rerender(); }
}

async function stop(ctx) {
  const v = await ctx.ask({
    title: 'STOP : ne plus contacter cette boutique',
    text: 'Toutes ses adresses (e-mail, Facebook, Instagram, téléphone) entrent dans « Ne pas contacter », pour trois ans. Plus rien ne lui sera envoyé, par aucun canal.',
    fields: [{ name: 'channel', label: 'Où a-t-elle refusé ?', type: 'select', options: [{ value: 'email', label: 'Par e-mail' }, { value: 'facebook', label: 'Sur Facebook' }, { value: 'instagram', label: 'Sur Instagram' }, { value: 'phone', label: 'Au téléphone' }, { value: 'visit', label: 'En boutique' }] }],
    confirmLabel: 'Bloquer', tone: 'red'
  });
  if (!v) return;
  const r = await act('stop', () => call('/admin/prospection/prospects/' + pr.ficheId + '/opt-out', { method: 'POST', body: { channel: v.channel } }), ctx, 'Boutique bloquée.');
  if (r) { pr.fiche = r; ctx.rerender(); }
}

function ficheView(ctx, canWrite) {
  const back = btn('← Retour', () => { pr.view = pr.back || 'list'; ctx.rerender(); });
  if (!pr.fiche) return el('div', { class: 'bl' }, back, el('div', { class: 'bz-skeleton', style: { height: '400px' } }));
  const f = pr.fiche;
  const p = f.prospect;
  const busy = (k) => pr.busy.has(k);
  const contacts = el('dl', { class: 'pr-dl' },
    el('dt', { text: 'E-mail' }), el('dd', {}, p.email ? el('a', { href: 'mailto:' + p.email, text: p.email }) : el('span', { class: 'bz-muted', text: 'aucun' }),
      p.other_emails.length ? el('span', { class: 'bz-tiny bz-muted', text: ' · autres : ' + p.other_emails.join(', ') }) : null),
    el('dt', { text: 'Source citée' }), el('dd', { text: p.email_source || '—' }),
    el('dt', { text: 'Vérification' }), el('dd', { class: 'bz-small', text: p.email_check || '—' }),
    el('dt', { text: 'Téléphone' }), el('dd', {}, p.phone ? el('a', { href: 'tel:' + p.phone.replace(/[^\d+]/g, ''), text: p.phone }) : el('span', { text: '—' })),
    el('dt', { text: 'En ligne' }), el('dd', { class: 'pr-links' }, ext(p.website, 'Site'), ext(p.facebook, 'Facebook'), ext(p.instagram, 'Instagram'), ext(p.tiktok, 'TikTok')),
    el('dt', { text: 'Adresse' }), el('dd', { text: [p.address, p.postal_code, p.city].filter(Boolean).join(' · ') || '—' }),
    el('dt', { text: 'Jeux' }), el('dd', { text: (p.games.join(', ') || '—') + (p.tournaments ? ' · tournois' : '') }),
    el('dt', { text: 'Repérée' }), el('dd', { class: 'bz-small bz-muted', text: [p.origin, p.found_at].filter(Boolean).join(' · ') || '—' }),
    p.checks ? el('dt', { text: 'Contrôles' }) : null, p.checks ? el('dd', { class: 'bz-small', text: p.checks }) : null,
    p.notes ? el('dt', { text: 'Notes' }) : null, p.notes ? el('dd', { class: 'bz-small', text: p.notes }) : null);

  const sendBtn = (step) => {
    const blocker = f.can_send['email_' + step];
    const label = step === 2 ? 'Envoyer la relance' : 'Envoyer le premier e-mail';
    return btn(label, () => send(ctx, step), { tone: 'primary', disabled: !canWrite || !!blocker || busy('send'), title: !canWrite ? 'Réservé aux super admins.' : blocker || null });
  };
  const actions = el('div', { class: 'pr-actions' },
    sendBtn(1), sendBtn(2),
    btn('Appel', () => note(ctx, 'call', 'Noter un appel', 'Ce qui a été dit.'), { disabled: f.opted_out, title: f.opted_out ? 'La boutique a refusé : plus aucun contact.' : null }),
    btn('Message privé envoyé', () => note(ctx, 'dm', 'Noter un message privé', 'Facebook ou Instagram, et ce qui a été écrit.'), { disabled: f.opted_out, title: f.opted_out ? 'La boutique a refusé : plus aucun contact.' : null }),
    btn('Passage en boutique', () => note(ctx, 'visit', 'Noter un passage', ''), { disabled: f.opted_out }),
    btn('Réponse positive', () => note(ctx, 'reply_positive', 'Noter une réponse positive', 'Ce qu’elle a répondu.'), { tone: 'green' }),
    btn('Rendez-vous', () => note(ctx, 'meeting', 'Noter un rendez-vous', 'Date, heure, appel ou visite.'), { tone: 'green' }),
    btn('Partenaire', () => note(ctx, 'partner', 'Devenue partenaire', 'Convention signée le…'), { tone: 'green' }),
    btn('Réponse négative', () => note(ctx, 'reply_negative', 'Noter un refus', 'Le refus bloque la boutique partout.'), { tone: 'red' }),
    btn('STOP', () => stop(ctx), { tone: 'red', disabled: f.opted_out }),
    btn('Note', () => note(ctx, 'note', 'Ajouter une note', '')),
    btn('Modifier la fiche', () => edit(ctx)),
    p.review ? btn('Lever la réserve', () => setReview(ctx, null), { tone: 'amber' }) : btn('Mettre de côté', () => setReview(ctx, 'manual')));

  const mails = el('section', { class: 'bz-card' }, el('h3', { class: 'bz-h3', text: 'E-mails de cette boutique' }),
    ...[['email_1', 'Premier e-mail'], ['email_2', 'Relance']].map(([k, label]) => {
      const m = f.emails[k];
      if (!m) return el('p', { class: 'bz-small bz-muted', text: label + ' : après le premier e-mail.' });
      if (m.error) return el('p', { class: 'bz-small', style: { color: 'var(--soft-red-text)' }, text: label + ' : ' + m.error });
      return fold('mail-' + k, label + ' · « ' + m.subject + ' »', renderMarked(m.body, m.footer));
    }));
  const texts = f.opted_out ? null : el('section', { class: 'bz-card' }, el('h3', { class: 'bz-h3', text: 'À copier pour les autres canaux' }),
    ...[['dm_facebook', 'Message privé Facebook'], ['dm_instagram', 'Message privé Instagram'], ['call_script', 'Trame d’appel'], ['reply_positive', 'Réponse après un « oui »']].map(([k, label]) => fold('text-' + k, label,
      el('pre', { class: 'pr-pre', text: f.texts[k] }),
      btn('Copier', () => copy(f.texts[k], ctx)))));
  const timeline = el('section', { class: 'bz-card' }, el('h3', { class: 'bz-h3', text: 'Historique' }),
    f.events.length ? el('ul', { class: 'pr-timeline' }, f.events.map((e) => el('li', {},
      el('span', { class: 'bz-tiny bz-muted', text: dateTimeShort(e.created_date) + (e.automatic ? ' · automatique' : '') }),
      el('b', { text: ' ' + e.label }),
      e.summary ? el('div', { class: 'bz-small bz-muted pr-clip', text: e.summary }) : null))) : el('p', { class: 'bz-small bz-muted', text: 'Rien encore.' }));

  return el('div', { class: 'bl' },
    back,
    el('section', { class: 'bz-card' },
      el('div', { class: 'pr-fiche-head' },
        el('h2', { class: 'bz-h2', style: { margin: 0 }, text: p.name }),
        pill(STATUS_TONE[p.status] === 'is-red' ? p.status_label : p.status_label, STATUS_TONE[p.status]),
        pill('Priorité ' + p.priority, p.priority === 'A' ? 'is-green' : 'is-grey'),
        f.opted_out ? pill('Ne pas contacter', 'is-red') : null),
      el('p', { class: 'bz-small bz-muted', text: [p.city, p.department_name && (p.department_name + ' (' + p.department_code + ')'), p.region, p.shop_type].filter(Boolean).join(' · ') }),
      f.opted_out ? el('div', { class: 'bz-msg is-err', role: 'alert', text: 'Ne pas contacter : cette boutique a refusé (ou une de ses adresses est dans la liste). Plus aucun message, appel ni passage, par aucun canal. Sa fiche est effacée 30 jours après son refus ; seule la liste d’opposition la garde, trois ans.' }) : null,
      p.review ? el('div', { class: 'bz-msg pr-warn', text: '⚠ ' + p.review_label + ' Les envois automatiques l’ignorent tant que la réserve n’est pas levée.' }) : null,
      f.can_send.followup_due && !f.can_send.email_2 ? el('div', { class: 'bz-msg is-ok', text: 'La relance est due.' }) : null,
      actions,
      contacts),
    mails, texts, timeline);
}

// ---------- les textes ----------

function selectTemplate(key) {
  pr.tplKey = key;
  const t = pr.templates && pr.templates.templates.find((x) => x.key === key);
  pr.draft = t ? { subject: t.subject || '', body: t.body } : null;
  pr.preview = null;
}

async function refreshPreview(ctx) {
  try {
    pr.preview = await call('/admin/prospection/templates/preview', { method: 'POST', body: { key: pr.tplKey, subject: pr.draft.subject, body: pr.draft.body } });
  } catch (e) {
    pr.preview = { error: e.message };
  }
  ctx.rerender();
}

function templatesView(ctx, canWrite) {
  if (!pr.templates) {
    loadTemplates(ctx);
    return el('div', { class: 'bz-skeleton', style: { height: '400px' } });
  }
  const list = pr.templates.templates;
  const t = list.find((x) => x.key === pr.tplKey);
  if (!pr.preview) refreshPreview(ctx);
  let timer = null;
  const onEdit = (k) => (e) => { pr.draft[k] = e.target.value; clearTimeout(timer); timer = setTimeout(() => refreshPreview(ctx), 500); };
  const body = el('textarea', { class: 'bz-input pr-editor', rows: '22', oninput: onEdit('body'), disabled: !canWrite }, pr.draft.body);
  body.value = pr.draft.body;
  const insert = (name) => {
    const start = body.selectionStart ?? body.value.length;
    body.value = body.value.slice(0, start) + '{' + name + '}' + body.value.slice(body.selectionEnd ?? start);
    pr.draft.body = body.value;
    refreshPreview(ctx);
  };
  const chips = el('div', { class: 'pr-chips' }, Object.entries(pr.templates.variables).map(([name, help]) => el('button', { class: 'bz-tab', type: 'button', title: help, text: '{' + name + '}', onclick: () => insert(name), disabled: !canWrite })));
  const save = btn('Enregistrer', () => act('tpl', async () => { pr.templates = await call('/admin/prospection/templates/' + pr.tplKey, { method: 'PUT', body: pr.draft }); selectTemplate(pr.tplKey); }, ctx, 'Texte enregistré : il sert dès le prochain envoi.'), { tone: 'primary', disabled: !canWrite || pr.busy.has('tpl') });
  const reset = t.custom ? btn('Revenir au texte d’origine', async () => {
    const ok = await ctx.ask({ title: 'Revenir au texte d’origine ?', text: 'Le texte modifié est perdu.', confirmLabel: 'Revenir', tone: 'red' });
    if (ok) act('tpl', async () => { pr.templates = await call('/admin/prospection/templates/' + pr.tplKey, { method: 'DELETE' }); selectTemplate(pr.tplKey); }, ctx, 'Texte d’origine rétabli.');
  }, { disabled: !canWrite }) : null;
  const test = t.key === 'email_1' || t.key === 'email_2' || t.key === 'footer'
    ? btn('M’envoyer un essai', () => act('test', () => call('/admin/prospection/test-email', { method: 'POST', body: { step: t.key === 'email_2' ? 2 : 1 } }), ctx, (r) => 'Essai envoyé à ' + r.to + ' (avec le texte enregistré).'), { disabled: !canWrite || pr.busy.has('test'), title: 'Le texte enregistré, envoyé à ton adresse de compte.' })
    : null;
  const preview = pr.preview
    ? (pr.preview.error ? el('div', { class: 'bz-msg is-err', text: pr.preview.error }) : null)
    : null;
  const rendered = pr.preview && !pr.preview.error
    ? (pr.preview.subject !== undefined || pr.preview.footer !== undefined
      ? el('div', {}, pr.preview.subject ? el('p', { class: 'bz-small' }, el('b', { text: 'Objet : ' }), document.createTextNode(pr.preview.subject)) : null, renderMarked(pr.preview.body, pr.preview.footer))
      : el('pre', { class: 'pr-pre', text: pr.preview.body || '' }))
    : null;
  return el('div', { class: 'bl' },
    el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Textes' }, list.map((x) => el('button', {
      class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(x.key === pr.tplKey), onclick: () => { selectTemplate(x.key); ctx.rerender(); }
    }, x.label, x.custom ? el('span', { class: 'bz-count', text: 'modifié' }) : null))),
    el('div', { class: 'pr-tpl' },
      el('section', { class: 'bz-card' },
        el('p', { class: 'bz-small bz-muted', style: { marginTop: 0 }, text: 'Syntaxe : **gras**, une ligne qui commence par « - » pour une liste, {schema} et {signature} seuls sur leur ligne pour le schéma et la signature Gmail (e-mails seulement). Le pied de page légal s’ajoute à chaque e-mail ; ses mentions (STOP, source de l’adresse, lien vers la politique, SIREN) sont obligatoires.' }),
        t.key === 'email_1' ? el('div', { class: 'bz-field' }, el('label', { class: 'bz-label', text: 'Objet' }), el('input', { class: 'bz-input', value: pr.draft.subject, oninput: onEdit('subject'), disabled: !canWrite })) : null,
        t.key === 'email_2' ? el('p', { class: 'bz-small bz-muted', text: 'Objet : « Re: » suivi de celui du premier e-mail (la relance part dans son fil).' }) : null,
        chips, body,
        el('div', { class: 'bz-row' }, save, reset, test),
        !canWrite ? el('p', { class: 'bz-tiny bz-muted', text: 'Lecture seule : réservé aux super admins.' }) : null),
      el('section', { class: 'bz-card' }, el('h3', { class: 'bz-h3', text: 'Aperçu' }),
        el('p', { class: 'bz-tiny bz-muted', text: 'Avec une boutique d’exemple : Les Jeux De l’Olympe, Le Perreux-sur-Marne.' }),
        preview, rendered)));
}

// ---------- réglages et import ----------

function settingsView(ctx, canWrite) {
  const s = pr.data.settings;
  const L = s.limits;
  const form = {};
  const num = (name, label, value, min, max, help) => el('div', { class: 'bz-field' },
    el('label', { class: 'bz-label', text: label }),
    form[name] = el('input', { class: 'bz-input', type: 'number', min: String(min), max: String(max), value: String(value), disabled: !canWrite }),
    help ? el('span', { class: 'bz-tiny bz-muted', text: help }) : null);
  const time = (name, label, value) => el('div', { class: 'bz-field' }, el('label', { class: 'bz-label', text: label }), form[name] = el('input', { class: 'bz-input', type: 'time', value, disabled: !canWrite }));
  const days = el('div', { class: 'bz-row' }, WEEKDAYS.map(([n, l]) => el('label', { class: 'bz-small pr-day' },
    form['d' + n] = el('input', { type: 'checkbox', checked: s.weekdays.includes(n), disabled: !canWrite }), document.createTextNode(' ' + l))));
  const save = btn('Enregistrer les réglages', () => act('settings', () => call('/admin/prospection/settings', {
    method: 'PATCH',
    body: {
      daily_cap: Number(form.daily.value), hourly_cap: Number(form.hourly.value), followup_days: Number(form.followup.value),
      window_start: form.start.value, window_end: form.end.value, sender_name: form.sender.value.trim(),
      weekdays: WEEKDAYS.map(([n]) => n).filter((n) => form['d' + n].checked)
    }
  }), ctx, 'Réglages enregistrés.'), { tone: 'primary', disabled: !canWrite || pr.busy.has('settings') });

  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', class: 'bz-input', disabled: !canWrite });
  const runImport = async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return ctx.toast('Choisis le fichier JSON des boutiques.', 'err');
    let rows;
    try {
      const data = JSON.parse(await file.text());
      rows = Array.isArray(data) ? data : data.prospects;
      if (!Array.isArray(rows)) throw new Error('format');
    } catch {
      return ctx.toast('Ce fichier n’est pas le JSON attendu (une liste de boutiques).', 'err');
    }
    const total = { created: 0, updated: 0, skipped: 0, errors: 0 };
    pr.importing = '0 / ' + rows.length;
    ctx.rerender();
    try {
      for (let i = 0; i < rows.length; i += 100) {
        const r = await call('/admin/prospection/import', { method: 'POST', body: { prospects: rows.slice(i, i + 100) } });
        total.created += r.created; total.updated += r.updated; total.skipped += r.skipped; total.refused = (total.refused || 0) + (r.refused || 0); total.errors += r.errors.length;
        pr.importing = Math.min(i + 100, rows.length) + ' / ' + rows.length;
        ctx.rerender();
      }
      ctx.toast(`Import terminé : ${total.created} créée(s), ${total.updated} mise(s) à jour, ${total.skipped} déjà contactée(s), ${total.refused || 0} écartée(s) (« Ne pas contacter »), ${total.errors} erreur(s).`);
    } catch (e) {
      ctx.toast('Import interrompu : ' + e.message, 'err');
    }
    pr.importing = null;
    pr.list.data = null;
    loadOverview(ctx.rerender);
  };
  const exportAll = () => act('export', async () => {
    const data = await call('/admin/prospection/export');
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'boostz-prospection-' + new Date().toISOString().slice(0, 10) + '.json' });
    document.body.append(a);
    a.click();
    a.remove();
  }, ctx, 'Export prêt.');

  return el('div', { class: 'bl' },
    el('section', { class: 'bz-card' },
      el('h3', { class: 'bz-h3', text: 'L’envoi automatique' }),
      el('p', { class: 'bz-small bz-muted', text: 'Les plafonds ne dépassent jamais ' + L.daily_cap_max + ' e-mails par jour ni ' + L.hourly_cap_max + ' par heure : la boîte d’envoi est l’adresse de contact de BoostZ, et Gmail suspend un compte qui envoie en masse. La relance ne part qu’une fois, dans le fil du premier e-mail, et jamais après une réponse.' }),
      el('div', { class: 'pr-grid' },
        num('daily', 'E-mails par jour', s.daily_cap, 1, L.daily_cap_max, 'Conseil : 10 à 15 la première semaine, 20 à 30 ensuite.'),
        num('hourly', 'E-mails par heure', s.hourly_cap, 1, L.hourly_cap_max),
        num('followup', 'Relance après (jours)', s.followup_days, L.followup_days_min, L.followup_days_max),
        time('start', 'Envois à partir de', s.window_start),
        time('end', 'Envois jusqu’à', s.window_end),
        el('div', { class: 'bz-field' }, el('label', { class: 'bz-label', text: 'Nom d’expéditeur' }), form.sender = el('input', { class: 'bz-input', value: s.sender_name, disabled: !canWrite }))),
      el('div', { class: 'bz-field' }, el('label', { class: 'bz-label', text: 'Jours d’envoi' }), days),
      save),
    el('section', { class: 'bz-card' },
      el('h3', { class: 'bz-h3', text: 'La boîte Gmail' }),
      el('p', { class: 'bz-small', text: s.mail_configured ? 'Branchée : ' + s.sender_address + '. Les e-mails partent de là et y restent visibles (« Envoyés») ; les réponses y sont lues tous les quarts d’heure, sans rien y marquer.' : 'Pas branchée. Sur Render, ajoute PROSPECTION_GMAIL_USER (boostz.info@gmail.com) et PROSPECTION_GMAIL_APP_PASSWORD : un mot de passe d’application Google (compte Google, Sécurité, validation en deux étapes, Mots de passe des applications).' })),
    el('section', { class: 'bz-card' },
      el('h3', { class: 'bz-h3', text: 'Importer des boutiques' }),
      el('p', { class: 'bz-small bz-muted', text: 'Le fichier JSON préparé avec le tableur. Une boutique déjà là garde son statut et son historique ; ses coordonnées sont mises à jour seulement tant qu’elle n’a pas été contactée. Une adresse déjà dans « Ne pas contacter » entre directement en STOP.' }),
      el('div', { class: 'bz-row' }, fileInput, btn(pr.importing ? 'Import… ' + pr.importing : 'Importer', runImport, { tone: 'primary', disabled: !canWrite || !!pr.importing })),
      el('div', { class: 'bz-row', style: { marginTop: '10px' } }, btn('Exporter toutes les boutiques (JSON)', exportAll, { disabled: pr.busy.has('export') }))));
}

// ---------- ne pas contacter ----------

function optOutsView(ctx, canWrite) {
  if (!pr.optouts) {
    loadOptOuts(ctx);
    return el('div', { class: 'bz-skeleton', style: { height: '300px' } });
  }
  const add = btn('Ajouter une adresse', async () => {
    const v = await ctx.ask({ title: 'Ajouter à « Ne pas contacter »', text: 'Une adresse e-mail, un numéro de téléphone ou un lien Facebook ou Instagram. Les boutiques qui l’ont sont bloquées tout de suite.', fields: [{ name: 'value', label: 'Adresse', required: true }], confirmLabel: 'Bloquer', tone: 'red' });
    if (v) { await act('optadd', () => call('/admin/prospection/opt-outs', { method: 'POST', body: { value: v.value } }), ctx, 'Ajoutée.'); loadOptOuts(ctx); }
  }, { tone: 'red' });
  let timer = null;
  const search = el('input', { type: 'search', class: 'bz-input pr-search', placeholder: 'Chercher une adresse…', value: pr.optQ, oninput: (e) => { clearTimeout(timer); timer = setTimeout(() => { pr.optQ = e.target.value.trim(); loadOptOuts(ctx); }, 300); } });
  const remove = (o) => async () => {
    const v = await ctx.ask({ title: 'Retirer ' + o.value + ' ?', text: 'Seulement si la boutique a elle-même demandé à être recontactée. Le motif est gardé au journal.', fields: [{ name: 'reason', label: 'Motif', type: 'textarea', required: true }], confirmLabel: 'Retirer', tone: 'red' });
    if (v) { await act('optdel', () => call('/admin/prospection/opt-outs/' + o.id, { method: 'DELETE', body: { reason: v.reason } }), ctx, 'Retirée.'); loadOptOuts(ctx); }
  };
  return el('div', { class: 'bl' },
    el('p', { class: 'bz-small bz-muted', style: { margin: 0 }, text: 'Ceux qui ont dit STOP ou non, sur n’importe quel canal. Gardés trois ans (politique de confidentialité, section 3), réduits à l’adresse et à la date ; la fiche de la boutique, elle, est effacée 30 jours après son refus. Rien ne leur est envoyé, ni seul ni à la main.' }),
    el('div', { class: 'bz-row' }, search, add),
    pr.optouts.length ? el('div', { class: 'bz-table-wrap' }, el('table', { class: 'bz-table pr-table' },
      el('thead', {}, el('tr', {}, ['Adresse', 'Canal', 'Depuis', ''].map((h) => el('th', { text: h })))),
      el('tbody', {}, pr.optouts.map((o) => el('tr', {},
        el('td', { text: o.value }), el('td', { text: o.channel }), el('td', { text: dateShort(o.created_date) }),
        el('td', {}, canWrite ? btn('Retirer', remove(o)) : null))))))
      : el('p', { class: 'bz-small bz-muted', text: 'Personne pour l’instant.' }));
}

// ---------- l'onglet ----------

export const prospectionToProcess = () => (pr.data ? pr.data.to_process : 0);

export function renderProspection(ctx) {
  if (pr.status === 'idle') { pr.status = 'loading'; loadOverview(ctx.rerender); }
  if (pr.status === 'loading') return el('div', { class: 'bl' }, el('div', { class: 'bz-skeleton', style: { height: '80px' } }), el('div', { class: 'bz-skeleton', style: { height: '360px', marginTop: '12px' } }));
  if (pr.status === 'absent') return el('section', { class: 'bz-card' }, el('b', { text: 'Prospection : pas encore en ligne sur le serveur' }), el('p', { class: 'bz-small bz-muted', text: 'Réessaie après le prochain déploiement.' }));
  if (pr.status === 'error') return el('div', { class: 'bz-msg is-err', role: 'alert' }, 'Prospection indisponible : ' + pr.error + ' ', btn('Réessayer', () => { pr.status = 'loading'; ctx.rerender(); loadOverview(ctx.rerender); }));
  const canWrite = !!(ctx.me && ctx.me.is_super_admin);
  const d = pr.data;
  const views = [['overview', 'Vue d’ensemble'], ['list', 'Boutiques', d.summary.total.total], ['templates', 'Textes'], ['settings', 'Réglages'], ['optouts', 'Ne pas contacter', d.opt_outs]];
  const tabs = el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Vue' }, views.map(([id, label, n]) => el('button', {
    class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(pr.view === id || (pr.view === 'fiche' && pr.back === id)),
    onclick: () => { pr.view = id; if (id === 'list') loadList(ctx.rerender); if (id === 'optouts') pr.optouts = null; ctx.rerender(); }
  }, label, n ? el('span', { class: 'bz-count', text: String(n) }) : null)));
  const panel = pr.view === 'list' ? listView(ctx)
    : pr.view === 'fiche' ? ficheView(ctx, canWrite)
      : pr.view === 'templates' ? templatesView(ctx, canWrite)
        : pr.view === 'settings' ? settingsView(ctx, canWrite)
          : pr.view === 'optouts' ? optOutsView(ctx, canWrite)
            : overviewView(ctx, canWrite);
  return el('div', { class: 'bl' },
    el('p', { class: 'bz-small bz-muted', style: { margin: '0' }, text: 'Les boutiques à qui BoostZ propose le programme Boutiques partenaires : qui a été contacté, qui a répondu, qui a dit non.' }),
    pr.error ? el('div', { class: 'bz-msg is-err', role: 'alert', text: 'Mise à jour impossible : ' + pr.error }) : null,
    tabs, panel);
}
