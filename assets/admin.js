// La console d'administration de boostz.fr.
//
// Elle ne décide de rien. Chaque bouton appelle une route /admin/* et le serveur
// accepte ou refuse selon le rôle et le rang du compte connecté ; les actions
// grisées ne font qu'annoncer un refus certain, avec sa raison. Tout
// texte venu de l'API (pseudos, messages, signalements) passe par textContent.
import { session, refreshMe, call, isAdmin } from './api.js';
import { el, clear, put, renderTop, gate, dateShort, dateTime, dateTimeShort, roleLabel, rolePillClass, initialOf, thumbs, togglePopover, closePopover } from './chrome.js';

const REASONS = {
  fraud: 'Arnaque ou tentative de fraude',
  counterfeit: 'Carte ou produit contrefait',
  item_not_as_described: 'Objet non conforme à l’annonce',
  no_show: 'Absence au rendez-vous',
  off_platform_payment: 'Demande d’argent ou de paiement',
  unsafe_meetup: 'Comportement dangereux au rendez-vous',
  harassment: 'Harcèlement ou intimidation',
  hate_speech: 'Propos haineux ou discriminatoires',
  inappropriate_content: 'Contenu choquant ou inapproprié',
  impersonation: 'Usurpation d’identité ou faux profil',
  underage: 'Compte semblant appartenir à un mineur',
  spam: 'Spam ou publicité',
  other: 'Autre'
};
const CONTEXTS = {
  forum_thread: 'Fil de forum',
  forum_message: 'Message de forum',
  place_review: 'Avis sur un lieu',
  place_message: 'Message sur un lieu',
  news_comment: 'Commentaire d’actualité'
};
const REPORT_STATUS = {
  OPEN: ['Ouvert', 'bz-pill is-red'],
  INVESTIGATING: ['En cours', 'bz-pill is-violet'],
  RESOLVED: ['Traité', 'bz-pill is-green'],
  DISMISSED: ['Classé sans suite', 'bz-pill is-grey']
};
const TICKET_STATUS = {
  PENDING: ['En attente', 'bz-pill is-amber'],
  OPEN: ['En cours', 'bz-pill is-violet'],
  CLOSED: ['Clôturé', 'bz-pill is-green']
};
const ACTIONS = {
  ban: 'Bannissement',
  unban: 'Levée du bannissement',
  role: 'Changement de rôle',
  super_admin: 'Rang de super admin',
  warn: 'Avertissement',
  delete_account: 'Suppression du compte',
  report_status: 'Décision sur un signalement'
};
const SUPER_ONLY = 'Réservé aux super admins.';

const state = {
  me: null,
  tab: 'users',
  users: [], adminCount: 0, superCount: 0,
  reports: [], reportId: null,
  tickets: [], ticketCounts: { PENDING: 0, OPEN: 0, CLOSED: 0 }, ticketFilter: '', ticketId: null, ticket: null,
  actions: [],
  pane: null,
  q: '', userKinds: new Set(['members', 'admins', 'supers', 'banned']),
  loaded: false
};

const pill = (map, key) => {
  const [label, cls] = map[key] || [key, 'bz-pill'];
  return el('span', { class: cls, text: label });
};

const shortId = (id) => '#' + String(id).slice(-6).toUpperCase();

// Le nom de chaque section, dans l'en-tête et la barre d'onglets du téléphone.
const SECTIONS = { users: 'Comptes', reports: 'Signalements', support: 'Support', journal: 'Journal' };

// Icônes en trait, même famille que celles de l'app (épaisseur 2, bouts ronds).
const ICONS = {
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.3a3.2 3.2 0 0 0-2.4-3.1M15.5 4.7a3.4 3.4 0 0 1 0 6.6',
  reports: 'M5 21V4M5 4h11.5l-2 4 2 4H5',
  support: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4V5.5Z',
  journal: 'M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z',
  filter: 'M4 6h16M7 12h10M10 18h4',
  send: 'M5 12h13M13 6l6 6-6 6',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6'
};
function icon(name, size = 20) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}

// Téléphone (640 px et moins) : des fiches au lieu des tableaux. Écran étroit
// (860 px et moins) : la liste OU le détail d'un signalement ou d'un ticket,
// jamais l'un sous l'autre. Posé sous la liste, le détail obligeait à redescendre
// chercher ce qu'on venait de toucher, puis à remonter pour le suivant.
const PHONE = window.matchMedia('(max-width: 640px)');
const NARROW = window.matchMedia('(max-width: 860px)');
let listScroll = 0;

function openPane(pane) {
  if (!NARROW.matches) return;
  if (!state.pane) listScroll = window.scrollY;
  state.pane = pane;
}

// Après avoir ouvert un détail : on le montre depuis son haut, sous les onglets.
function paneTop() {
  if (!NARROW.matches || !state.pane) return;
  if (PHONE.matches) return window.scrollTo({ top: 0, behavior: 'instant' });
  const anchor = host.querySelector('.adm-back');
  if (anchor) window.scrollTo({ top: Math.max(0, anchor.getBoundingClientRect().top + window.scrollY - 72), behavior: 'instant' });
}

function closePane() {
  state.pane = null;
  render();
  window.scrollTo({ top: listScroll, behavior: 'instant' });
}

function backButton(label) {
  return el('button', { class: 'adm-back', type: 'button', onclick: closePane }, el('span', { 'aria-hidden': 'true', text: '‹' }), label);
}

// Téléphone : l'en-tête d'un détail, collé sous la barre du site. Retour carré,
// titre sur une ligne, sous-titre, et une commande à droite (statut).
function paneHead(backLabel, title, sub, side) {
  return el('div', { class: 'adm-phead' },
    el('button', { class: 'adm-back is-square', type: 'button', 'aria-label': backLabel, onclick: closePane }, icon('back', 18)),
    el('div', { class: 'adm-phead-text' }, el('b', { text: title }), sub ? el('span', { text: sub }) : null),
    side || null
  );
}

let host, topHost, toastHost, toastTimer;

// ---------- Bandeau de retour ----------
function toast(text, type = 'ok') {
  clearTimeout(toastTimer);
  clear(toastHost).append(el('div', { class: 'bz-msg is-' + type, role: type === 'err' ? 'alert' : 'status', text }));
  toastTimer = setTimeout(() => clear(toastHost), type === 'err' ? 7000 : 4000);
}

// ---------- Boîte de dialogue ----------
// fields : [{ name, label, type: 'textarea'|'text', required, placeholder }]
// confirmText : saisie exacte exigée avant d'activer le bouton.
function ask({ title, text, fields = [], confirmLabel = 'Confirmer', tone = 'violet', confirmText = null }) {
  return new Promise((resolve) => {
    const inputs = {};
    const confirm = el('button', { class: 'bz-btn is-' + tone, type: 'submit', text: confirmLabel });
    const cancel = el('button', { class: 'bz-btn', type: 'button', text: 'Annuler' });
    const error = el('div');
    const body = el('form', { method: 'dialog', class: 'bz-stack', style: { gap: '12px' } },
      el('h2', { class: 'bz-h3', style: { fontSize: '16px' }, text: title }),
      text ? el('p', { class: 'bz-small bz-muted', style: { margin: '0', lineHeight: '1.6' }, text }) : null
    );
    for (const f of fields) {
      const id = 'dlg-' + f.name;
      const input = f.type === 'textarea'
        ? el('textarea', { id, class: 'bz-input', rows: '4', maxlength: '4000', placeholder: f.placeholder || '' })
        : el('input', { id, class: 'bz-input', autocomplete: 'off', placeholder: f.placeholder || '' });
      inputs[f.name] = input;
      body.append(el('div', { class: 'bz-field' }, el('label', { class: 'bz-label', for: id, text: f.label }), input));
    }
    if (confirmText) {
      const input = el('input', { id: 'dlg-confirm', class: 'bz-input', autocomplete: 'off', spellcheck: 'false', placeholder: confirmText });
      inputs.__confirm = input;
      confirm.disabled = true;
      input.addEventListener('input', () => { confirm.disabled = input.value.trim() !== confirmText; });
      body.append(el('div', { class: 'bz-field' },
        el('label', { class: 'bz-label', for: 'dlg-confirm' }, 'Retape ', el('b', { style: { textTransform: 'none', color: 'var(--text)' }, text: confirmText }), ' pour confirmer'),
        input));
    }
    body.append(error, el('div', { class: 'bz-row', style: { justifyContent: 'flex-end' } }, cancel, confirm));

    const dialog = el('dialog', { class: 'bz-dialog' }, body);
    document.body.append(dialog);
    const close = (value) => { dialog.close(); dialog.remove(); resolve(value); };
    cancel.addEventListener('click', () => close(null));
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    body.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = {};
      for (const f of fields) {
        values[f.name] = inputs[f.name].value.trim();
        if (f.required && !values[f.name]) {
          clear(error).append(el('div', { class: 'bz-msg is-err', text: f.label + ' : champ requis.' }));
          inputs[f.name].focus();
          return;
        }
      }
      if (confirmText && inputs.__confirm.value.trim() !== confirmText) return;
      close(values);
    });
    dialog.showModal();
    const first = fields.length ? inputs[fields[0].name] : (confirmText ? inputs.__confirm : confirm);
    first.focus();
  });
}

// ---------- Chargements ----------
async function loadUsers() {
  const data = await call('/admin/users?limit=500');
  state.users = data.users;
  state.adminCount = data.admin_count;
  state.superCount = data.super_admin_count;
}
async function loadReports() {
  state.reports = (await call('/admin/reports')).reports;
  if (!state.reportId && state.reports.length) state.reportId = state.reports[0].id;
}
async function loadTickets() {
  const q = state.ticketFilter ? '?status=' + encodeURIComponent(state.ticketFilter) : '';
  const data = await call('/admin/support/tickets' + q);
  state.tickets = data.tickets;
  state.ticketCounts = data.counts;
}
async function loadActions() {
  state.actions = (await call('/admin/actions')).actions;
}

async function loadAll() {
  const results = await Promise.allSettled([loadUsers(), loadReports(), loadTickets(), loadActions()]);
  const failed = results.find((r) => r.status === 'rejected');
  state.loaded = true;
  if (failed) {
    if (failed.reason && failed.reason.status === 401) return start();
    toast(failed.reason ? failed.reason.message : 'Chargement incomplet.', 'err');
  }
  render();
}

// Après un geste : relire ce qu'il a pu changer, puis redessiner.
async function after(message, ...loaders) {
  try {
    await Promise.all([loadActions(), ...loaders.map((fn) => fn())]);
  } catch (e) {
    toast(e.message, 'err');
  }
  render();
  if (message) toast(message, 'ok');
}

// ---------- Gestes sur les comptes ----------
const nameOf = (u) => u.pseudo || u.email || 'ce compte';

async function run(fn) {
  try {
    await fn();
  } catch (e) {
    toast(e.message, 'err');
  }
}

const userActs = {
  promote: (u) => run(async () => {
    await call(`/admin/users/${u.id}/role`, { method: 'PATCH', body: { role: 'admin' } });
    await after(nameOf(u) + ' est maintenant admin.', loadUsers);
  }),
  demote: (u) => run(async () => {
    const ok = await ask({ title: 'Retirer les droits admin', text: nameOf(u) + ' redeviendra membre' + (u.is_super_admin ? ' et perdra son rang de super admin.' : '.'), confirmLabel: 'Retirer', tone: 'red' });
    if (!ok) return;
    await call(`/admin/users/${u.id}/role`, { method: 'PATCH', body: { role: 'user' } });
    await after('Droits admin retirés à ' + nameOf(u) + '.', loadUsers);
  }),
  superOn: (u) => run(async () => {
    const ok = await ask({ title: 'Nommer super admin', text: nameOf(u) + ' pourra bannir, supprimer des comptes et nommer d’autres super admins.', confirmLabel: 'Nommer', tone: 'amber' });
    if (!ok) return;
    await call(`/admin/users/${u.id}/super-admin`, { method: 'PATCH', body: { super_admin: true } });
    await after(nameOf(u) + ' est maintenant super admin.', loadUsers);
  }),
  superOff: (u) => run(async () => {
    const self = u.id === state.me.id;
    const ok = await ask({ title: 'Retirer le rang de super admin', text: self ? 'Tu garderas les droits admin, mais tu ne pourras plus bannir ni supprimer.' : nameOf(u) + ' restera admin.', confirmLabel: 'Retirer le rang', tone: 'red' });
    if (!ok) return;
    await call(`/admin/users/${u.id}/super-admin`, { method: 'PATCH', body: { super_admin: false } });
    if (self) state.me = await refreshMe();
    await after('Rang de super admin retiré à ' + nameOf(u) + '.', loadUsers);
    if (self) renderHeader();
  }),
  warn: (u, reportId = null) => run(async () => {
    const values = await ask({
      title: 'Avertir ' + nameOf(u),
      text: 'Le message part dans un ticket de support à son nom. Le membre le voit comme une réponse non lue et peut y répondre.',
      fields: [{ name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Ce qui est reproché, et ce qui est attendu désormais.' }],
      confirmLabel: 'Envoyer l’avertissement'
    });
    if (!values) return;
    await call(`/admin/users/${u.id}/warn`, { method: 'POST', body: { message: values.message, ...(reportId ? { report_id: reportId } : {}) } });
    await after('Avertissement envoyé à ' + nameOf(u) + '.', loadReports, loadTickets);
  }),
  ban: (u) => run(async () => {
    const values = await ask({
      title: 'Bannir ' + nameOf(u),
      text: 'Le compte ne pourra plus utiliser l’application ; ses sessions ouvertes cessent de fonctionner. Réversible.',
      fields: [{ name: 'reason', label: 'Motif (gardé au dossier)', type: 'textarea', placeholder: 'Ex. : arnaque confirmée sur l’échange du 11 septembre.' }],
      confirmLabel: 'Bannir', tone: 'red'
    });
    if (!values) return;
    await call(`/admin/users/${u.id}/ban`, { method: 'POST', body: { reason: values.reason } });
    await after(nameOf(u) + ' est banni.', loadUsers, loadReports);
  }),
  unban: (u) => run(async () => {
    await call(`/admin/users/${u.id}/unban`, { method: 'POST' });
    await after(nameOf(u) + ' est réactivé.', loadUsers, loadReports);
  }),
  remove: (u) => run(async () => {
    const values = await ask({
      title: 'Supprimer le compte de ' + nameOf(u),
      text: 'Même effacement que la suppression faite par le membre : collection, photos, alertes et données personnelles. Immédiat et définitif.',
      fields: [{ name: 'reason', label: 'Motif (gardé au journal)', type: 'textarea' }],
      confirmText: u.pseudo || u.email,
      confirmLabel: 'Supprimer définitivement', tone: 'cta'
    });
    if (!values) return;
    await call(`/admin/users/${u.id}/delete`, { method: 'POST', body: { reason: values.reason } });
    await after('Compte de ' + nameOf(u) + ' supprimé.', loadUsers, loadReports);
  })
};

// Les gestes possibles sur un compte, pour le menu « … » de sa ligne. `why`
// désactive l'entrée et dit pourquoi, en toutes lettres sous le libellé : une
// infobulle ne s'affiche pas au doigt. Le serveur refuserait de toute façon.
function userMenuItems(u) {
  const me = state.me;
  const isSuper = !!me.is_super_admin;
  const self = u.id === me.id;
  const superWhy = isSuper ? null : SUPER_ONLY;
  const item = (label, tone, run, why) => ({ label, tone, run, why: why || null });
  const items = [];
  if (u.deleted) return items;
  if (u.banned_at) {
    items.push(item('Réactiver le compte', 'green', () => userActs.unban(u), superWhy));
    items.push(item('Supprimer le compte', 'red', () => userActs.remove(u), superWhy));
    return items;
  }
  if (u.is_super_admin) {
    const lastSuper = state.superCount <= 1 ? 'C’est le dernier super admin.' : null;
    items.push(item('Retirer le rang de super admin', 'amber', () => userActs.superOff(u), superWhy || lastSuper));
    items.push(item('Retirer les droits admin', 'violet', () => userActs.demote(u), superWhy || lastSuper));
  } else if (u.role === 'admin') {
    items.push(item('Retirer les droits admin', 'violet', () => userActs.demote(u), state.adminCount <= 1 ? 'C’est le dernier administrateur.' : null));
    items.push(item('Nommer super admin', 'amber', () => userActs.superOn(u), superWhy));
  } else {
    items.push(item('Passer admin', 'violet', () => userActs.promote(u)));
  }
  if (!u.is_super_admin) {
    items.push(item('Avertir', 'violet', () => userActs.warn(u), self ? 'C’est ton compte.' : null));
    items.push(item('Bannir', 'red', () => userActs.ban(u), self ? 'C’est ton compte.' : superWhy));
    items.push(item('Supprimer le compte', 'red', () => userActs.remove(u), self ? 'Passe par la page de suppression.' : superWhy));
  }
  return items;
}

// Le menu « … » d'une ligne. La fenêtre elle-même (placement, panneau sur
// téléphone, clavier) est dans chrome.js, partagée avec le menu du compte.
function openActionMenu(anchor, title, items) {
  const buttons = [];
  togglePopover(anchor, buttons, () => el('div', { class: 'bz-menu', role: 'menu', 'aria-label': title },
    el('div', { class: 'bz-menu-title', text: title }),
    items.length
      ? items.map((it) => {
        const b = el('button', {
          class: 'bz-menu-item is-' + it.tone,
          type: 'button',
          role: 'menuitem',
          disabled: !!it.why,
          onclick: () => { closePopover(); it.run(); }
        },
        el('span', { class: 'bz-menu-label', text: it.label }),
        it.why ? el('span', { class: 'bz-menu-why', text: it.why }) : null);
        buttons.push(b);
        return b;
      })
      : el('p', { class: 'bz-menu-why', style: { padding: '6px 10px', margin: '0' }, text: 'Aucune action possible sur un compte supprimé.' })
  ));
}

function statusPills(u) {
  const pills = [];
  if (u.deleted) pills.push(el('span', { class: 'bz-pill is-grey', text: 'Supprimé' }));
  else if (u.banned_at) pills.push(el('span', { class: 'bz-pill is-red', text: 'Banni' }));
  else pills.push(el('span', { class: rolePillClass(u), text: roleLabel(u) }));
  if (!u.deleted && !u.is_adult) pills.push(el('span', { class: 'bz-pill is-amber', text: 'Mineur' }));
  return pills;
}

// « il y a 3 h » sous la date exacte : la date dit quand, la durée dit si le
// membre est encore là.
function sinceFr(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return 'il y a ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'il y a ' + h + ' h';
  const d = Math.floor(h / 24);
  if (d === 1) return 'hier';
  if (d < 31) return 'il y a ' + d + ' j';
  const mo = Math.floor(d / 30);
  return 'il y a ' + mo + ' mois';
}

// Trois points dessinés : le caractère « … » dépend de la police et reste
// minuscule dans la plupart d'entre elles.
function dotsIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  for (const cx of [5, 12, 19]) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', '12');
    c.setAttribute('r', '2.1');
    svg.append(c);
  }
  return svg;
}

// Une information du compte sur deux lignes : [principale, précision]. La même
// paire remplit une cellule du tableau sur ordinateur et une fiche sur téléphone.
const cell2 = ([main, sub], attrs = {}) => el('td', attrs,
  el('div', { style: { whiteSpace: 'nowrap' } }, main),
  sub ? el('div', { class: 'bz-tiny', style: { whiteSpace: 'nowrap', marginTop: '2px' } }, sub) : null
);
const dd2 = ([main, sub]) => el('dd', {}, main, sub ? el('small', {}, sub) : null);

function ageInfo(u) {
  if (u.deleted) return ['—'];
  if (u.declared_age !== null && u.declared_age !== undefined) {
    const changed = u.current_age !== null && u.current_age !== u.declared_age;
    return [el('b', { style: { fontFamily: 'var(--font-ui)' }, text: u.declared_age + ' ans' }), changed ? u.current_age + ' ans aujourd’hui' : null];
  }
  if (u.current_age !== null && u.current_age !== undefined) {
    return [el('b', { style: { fontFamily: 'var(--font-ui)' }, text: u.current_age + ' ans' }), 'âge actuel'];
  }
  return [el('span', { class: 'bz-muted', text: 'Non déclaré' })];
}

function declaredAtInfo(u) {
  if (u.deleted) return ['—'];
  if (!u.birth_date_declared_at) {
    return [el('span', { class: 'bz-muted', text: u.current_age !== null && u.current_age !== undefined ? 'Non enregistrée' : '—' })];
  }
  if (u.birth_date_declared_estimated) {
    return [
      el('span', { title: 'Estimée d’après la fin de l’onboarding : la date exacte n’était pas enregistrée avant le 14 septembre 2026.', text: '≈ ' + dateTimeShort(u.birth_date_declared_at) }),
      'estimée'
    ];
  }
  return [el('span', { text: dateTimeShort(u.birth_date_declared_at) })];
}

function lastSeenInfo(u) {
  if (u.deleted) return ['—'];
  if (!u.last_app_seen_at) return [el('span', { class: 'bz-muted', text: 'Aucune' }), 'depuis le 14 sept. 2026'];
  return [el('span', { text: dateTimeShort(u.last_app_seen_at) }), sinceFr(u.last_app_seen_at)];
}

// ---------- Onglet Utilisateurs ----------
// Chaque compte tombe dans exactement une catégorie, dans cet ordre de priorité :
// un admin banni se range avec les bannis, un super admin n'est pas compté deux
// fois. La liste à cocher peut ainsi montrer un total juste par case.
const USER_KINDS = [
  ['members', 'Membres'],
  ['admins', 'Admins'],
  ['supers', 'Super admins'],
  ['banned', 'Bannis'],
  ['deleted', 'Supprimés']
];
const DEFAULT_KINDS = ['members', 'admins', 'supers', 'banned'];

function userKind(u) {
  if (u.deleted) return 'deleted';
  if (u.banned_at) return 'banned';
  if (u.is_super_admin) return 'supers';
  if (u.role === 'admin') return 'admins';
  return 'members';
}

function kindsLabel(kinds) {
  if (kinds.size === USER_KINDS.length) return 'Tous les comptes';
  if (kinds.size === 0) return 'Aucun compte';
  if (kinds.size === DEFAULT_KINDS.length && DEFAULT_KINDS.every((k) => kinds.has(k))) return 'Tous sauf supprimés';
  if (kinds.size === 1) return USER_KINDS.find(([k]) => kinds.has(k))[1];
  return kinds.size + ' catégories';
}

function caretIcon() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M6 9l6 6 6-6');
  svg.append(p);
  return svg;
}

// La liste « Comptes affichés ». Cocher une case redessine le tableau sur
// place, sans fermer la liste : on en coche souvent plusieurs d'affilée.
function openKindsList(anchor, onChange) {
  const boxes = [];
  const counts = Object.fromEntries(USER_KINDS.map(([k]) => [k, 0]));
  for (const u of state.users) counts[userKind(u)]++;
  const sync = () => { for (const b of boxes) if (b.type === 'checkbox') b.checked = state.userKinds.has(b.value); };
  const setAll = (kinds) => { state.userKinds = new Set(kinds); sync(); onChange(); };

  togglePopover(anchor, boxes, () => el('div', { class: 'bz-menu', role: 'dialog', 'aria-label': 'Comptes affichés' },
    el('div', { class: 'bz-menu-title', text: 'Comptes affichés' }),
    USER_KINDS.map(([kind, label]) => {
      const box = el('input', { type: 'checkbox', value: kind, checked: state.userKinds.has(kind) });
      box.addEventListener('change', () => {
        if (box.checked) state.userKinds.add(kind); else state.userKinds.delete(kind);
        onChange();
      });
      boxes.push(box);
      return el('label', { class: 'bz-check' }, box,
        el('span', { text: label }),
        el('span', { class: 'bz-check-count', text: String(counts[kind]) }));
    }),
    el('div', { class: 'bz-menu-foot' },
      (() => { const b = el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Tout cocher', onclick: () => setAll(USER_KINDS.map(([k]) => k)) }); boxes.push(b); return b; })(),
      (() => { const b = el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Par défaut', onclick: () => setAll(DEFAULT_KINDS) }); boxes.push(b); return b; })()
    )
  ));
}

function renderUsers() {
  const search = el('input', { class: 'bz-input', type: 'search', value: state.q, placeholder: 'Rechercher un pseudo ou une adresse…', 'aria-label': 'Rechercher un compte', style: { flex: '1', minWidth: '200px' } });
  search.addEventListener('input', () => { state.q = search.value; update(); });

  const phone = PHONE.matches;
  const filterLabel = el('span', { class: phone ? 'bz-sr' : null });
  const filterDot = el('span', { class: 'adm-filter-dot', hidden: true });
  const filter = phone
    ? el('button', { class: 'bz-filter-btn adm-filter-icon', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'Choisir les comptes affichés' }, icon('filter', 18), filterDot, filterLabel)
    : el('button', { class: 'bz-input bz-filter-btn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: 'Choisir les comptes affichés' }, filterLabel, caretIcon());
  filter.addEventListener('click', () => openKindsList(filter, update));

  const count = el('span', { class: 'bz-small bz-muted adm-count', style: { whiteSpace: 'nowrap' } });
  const tbody = el('tbody');
  const cards = el('div', { class: 'bz-cards' });
  const empty = el('p', { class: 'bz-small bz-muted adm-empty', style: { padding: '20px 16px', margin: '0', textAlign: 'center' } });

  // Redessine les lignes, le compteur et le libellé du bouton, sans toucher au
  // reste : la recherche garde son focus, la liste à cocher reste ouverte.
  function update() {
    const q = state.q.trim().toLowerCase();
    const matching = state.users.filter((u) =>
      !q || (u.pseudo || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
    const shown = matching.filter((u) => state.userKinds.has(userKind(u)));
    const hidden = matching.length - shown.length;
    filterLabel.textContent = kindsLabel(state.userKinds);
    // Un point sur le filtre dès qu'on s'écarte du réglage par défaut.
    filterDot.hidden = state.userKinds.size === DEFAULT_KINDS.length && DEFAULT_KINDS.every((k) => state.userKinds.has(k));
    count.textContent = shown.length + (shown.length > 1 ? ' comptes' : ' compte') + (hidden ? ' · ' + hidden + (hidden > 1 ? ' masqués' : ' masqué') : '');
    if (phone) put(clear(cards), shown.map(userLine));
    else put(clear(tbody), shown.map(userRow));
    empty.hidden = shown.length > 0;
    empty.textContent = state.userKinds.size ? 'Aucun compte ne correspond.' : 'Aucune catégorie cochée.';
  }
  update();

  if (phone) {
    search.style.minWidth = '0';
    return el('div', { class: 'adm-users-phone' },
      el('div', { class: 'adm-toolbar' }, search, filter),
      el('div', { class: 'adm-count' }, count),
      el('section', { class: 'bz-card adm-ulist' }, cards, empty)
    );
  }

  return el('section', { class: 'bz-card', style: { padding: '0', overflow: 'hidden', marginTop: '16px' } },
    el('div', { class: 'bz-row adm-users-bar', style: { padding: '14px 16px', borderBottom: '1px solid var(--line)' } },
      search, filter, count
    ),
    // Téléphone : des fiches. Un tableau de neuf colonnes cachait le statut et le
    // bouton « … » derrière un défilement horizontal.
    phone ? cards : el('div', { class: 'bz-table-wrap' },
      el('table', { class: 'bz-table is-compact', style: { minWidth: '1040px' } },
        el('thead', {}, el('tr', {},
          el('th', { text: 'Membre' }), el('th', { text: 'Inscription' }),
          el('th', { text: 'Âge déclaré' }), el('th', { text: 'Déclaré le' }), el('th', { text: 'Dernière utilisation' }),
          el('th', { style: { textAlign: 'center' }, text: 'Reçus' }), el('th', { style: { textAlign: 'center' }, text: 'Émis' }),
          el('th', { text: 'Statut' }), el('th', { style: { textAlign: 'right' } }, el('span', { class: 'bz-sr', text: 'Actions' }))
        )),
        tbody
      )
    ),
    empty
  );
}

// Téléphone : une ligne par compte. Toucher la ligne ouvre sa fiche, qui porte
// tout le détail et les actions. La fiche d'avant tenait 230 px par compte.
function userLine(u) {
  const name = nameOf(u);
  const age = u.declared_age ?? u.current_age;
  const meta = u.deleted ? 'Compte supprimé' : [
    age !== null && age !== undefined ? age + ' ans' : 'âge non déclaré',
    u.last_app_seen_at ? 'vu ' + sinceFr(u.last_app_seen_at) : 'jamais vu dans l’app',
    u.reports_received ? u.reports_received + ' signalement' + (u.reports_received > 1 ? 's' : '') : null
  ].filter(Boolean).join(' · ');
  const row = el('button', {
    class: 'bz-cardrow adm-urow' + (u.deleted ? ' is-deleted' : (u.banned_at ? ' is-banned' : '')),
    type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'Fiche de ' + name
  },
  el('span', { class: 'bz-avatar', 'aria-hidden': 'true', text: initialOf(u) }),
  el('span', { class: 'adm-urow-main' },
    el('span', { class: 'adm-urow-top' }, el('b', { text: u.pseudo || '—' }), el('span', { class: 'bz-cardrow-pills' }, statusPills(u))),
    el('span', { class: 'adm-urow-mail', text: u.email }),
    el('span', { class: 'adm-urow-meta' + (u.reports_received >= 3 ? ' is-alert' : ''), text: meta })
  ),
  el('span', { class: 'adm-urow-chev' }, icon('chevron', 16)));
  row.addEventListener('click', () => openUserSheet(row, u));
  return row;
}

function openUserSheet(anchor, u) {
  const name = nameOf(u);
  const items = userMenuItems(u);
  const buttons = [];
  const received = el('span', { style: { fontWeight: '700', color: u.reports_received >= 3 ? 'var(--text-danger)' : 'inherit' }, text: u.reports_received + ' reçu' + (u.reports_received > 1 ? 's' : '') });
  togglePopover(anchor, buttons, () => el('div', { class: 'bz-menu adm-usheet', role: 'dialog', 'aria-label': 'Fiche de ' + name },
    el('div', { class: 'bz-menu-account' },
      el('span', { class: 'bz-avatar is-lg', 'aria-hidden': 'true', text: initialOf(u) }),
      el('span', { style: { minWidth: '0', flex: '1' } }, el('b', { text: u.pseudo || '—' }), el('span', { text: u.email })),
      el('div', { class: 'bz-cardrow-pills adm-usheet-pills' }, statusPills(u))
    ),
    el('dl', { class: 'bz-dl adm-usheet-dl' },
      el('div', {}, el('dt', { text: 'Âge déclaré' }), dd2(ageInfo(u))),
      el('div', {}, el('dt', { text: 'Déclaré le' }), dd2(declaredAtInfo(u))),
      el('div', {}, el('dt', { text: 'Dernière utilisation' }), dd2(lastSeenInfo(u))),
      el('div', {}, el('dt', { text: 'Inscription' }), dd2([dateShort(u.created_date)])),
      el('div', { class: 'is-full' }, el('dt', { text: 'Signalements' }), dd2([el('span', {}, received, ' · ' + u.reports_sent + ' émis')])),
      u.banned_reason && !u.deleted ? el('div', { class: 'is-full' }, el('dt', { text: 'Motif du bannissement' }), dd2([u.banned_reason])) : null
    ),
    items.length ? el('div', { class: 'adm-usheet-label', text: 'Actions' }) : null,
    items.map((it) => {
      const b = el('button', {
        class: 'bz-menu-item is-' + it.tone, type: 'button', role: 'menuitem', disabled: !!it.why,
        onclick: () => { closePopover(); it.run(); }
      },
      el('span', { class: 'bz-menu-label', text: it.label }),
      it.why ? el('span', { class: 'bz-menu-why', text: it.why }) : null);
      buttons.push(b);
      return b;
    })
  ));
}

function moreButton(u) {
  const name = u.pseudo || u.email || 'ce compte';
  const more = el('button', {
    class: 'bz-more',
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-label': 'Actions pour ' + name,
    title: 'Actions'
  }, dotsIcon());
  more.addEventListener('click', () => openActionMenu(more, name, userMenuItems(u)));
  return more;
}

function userCard(u) {
  const received = el('span', { style: { fontWeight: '700', color: u.reports_received >= 3 ? 'var(--text-danger)' : 'inherit' }, text: u.reports_received + ' reçu' + (u.reports_received > 1 ? 's' : '') });
  return el('article', { class: 'bz-cardrow' + (u.deleted ? ' is-deleted' : (u.banned_at ? ' is-banned' : '')) },
    el('div', { class: 'bz-cardrow-head' },
      el('span', { class: 'bz-avatar', 'aria-hidden': 'true', text: initialOf(u) }),
      el('div', { class: 'bz-cardrow-name' },
        el('b', { text: u.pseudo || '—' }),
        el('span', { text: u.email }),
        el('div', { class: 'bz-cardrow-pills' }, statusPills(u))
      ),
      u.deleted ? null : moreButton(u)
    ),
    el('dl', { class: 'bz-dl' },
      el('div', {}, el('dt', { text: 'Âge déclaré' }), dd2(ageInfo(u))),
      el('div', {}, el('dt', { text: 'Déclaré le' }), dd2(declaredAtInfo(u))),
      el('div', {}, el('dt', { text: 'Dernière utilisation' }), dd2(lastSeenInfo(u))),
      el('div', {}, el('dt', { text: 'Inscription' }), dd2([dateShort(u.created_date)])),
      el('div', { class: 'is-full' }, el('dt', { text: 'Signalements' }), dd2([el('span', {}, received, ' · ' + u.reports_sent + ' émis')])),
      u.banned_reason && !u.deleted ? el('div', { class: 'is-full' }, el('dt', { text: 'Motif du bannissement' }), dd2([u.banned_reason])) : null
    )
  );
}

function userRow(u) {
  const more = moreButton(u);
  return el('tr', { class: u.deleted ? 'is-deleted' : (u.banned_at ? 'is-banned' : '') },
    el('td', {},
      el('div', { class: 'bz-row', style: { gap: '9px', flexWrap: 'nowrap' } },
        el('span', { class: 'bz-avatar', 'aria-hidden': 'true', text: initialOf(u) }),
        el('div', { style: { minWidth: '0' } },
          el('b', { style: { fontFamily: 'var(--font-ui)', display: 'block', whiteSpace: 'nowrap' }, text: u.pseudo || '—' }),
          el('span', { class: 'bz-tiny', title: u.email, style: { display: 'block', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }, text: u.email })
        )
      )
    ),
    cell2([el('span', { class: 'bz-muted', text: dateShort(u.created_date) })]),
    cell2(ageInfo(u)),
    cell2(declaredAtInfo(u)),
    cell2(lastSeenInfo(u)),
    el('td', { style: { textAlign: 'center', fontWeight: '700', color: u.reports_received >= 3 ? 'var(--text-danger)' : 'var(--text-muted)' }, text: String(u.reports_received) }),
    el('td', { style: { textAlign: 'center' }, class: 'bz-muted', text: String(u.reports_sent) }),
    el('td', {}, el('div', { class: 'bz-row', style: { gap: '5px' } }, statusPills(u)), u.banned_reason && !u.deleted ? el('div', { class: 'bz-tiny', title: u.banned_reason, style: { marginTop: '4px', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: 'Motif : ' + u.banned_reason }) : null),
    el('td', { style: { textAlign: 'right' } }, u.deleted ? el('span', { class: 'bz-tiny', text: '—' }) : more)
  );
}

// ---------- Onglet Signalements ----------
function renderReports() {
  const narrow = NARROW.matches;
  const showList = !narrow || state.pane !== 'report';
  const showDetail = !narrow || state.pane === 'report';
  const list = el('div', { class: 'adm-list' });
  for (const r of state.reports) {
    list.append(el('button', {
      class: 'adm-item', type: 'button', 'aria-current': r.id === state.reportId ? 'true' : 'false',
      onclick: () => { state.reportId = r.id; openPane('report'); render(); paneTop(); }
    },
    el('div', { class: 'bz-row', style: { gap: '8px' } },
      el('b', { style: { fontFamily: 'var(--font-ui)', fontSize: '12.5px' }, text: REASONS[r.reason] || r.reason }),
      pill(REPORT_STATUS, r.status),
      el('span', { class: 'adm-date', text: dateShort(r.created_date) })
    ),
    el('div', { class: 'bz-small', style: { marginTop: '7px', color: 'var(--text-muted)' } },
      'par ', el('b', { style: { color: 'var(--text)' }, text: r.reporter.pseudo || '—' }),
      ' → ', el('b', { style: { color: 'var(--text-danger)' }, text: r.reported.pseudo || '—' }))
    ));
  }
  if (!state.reports.length) list.append(el('p', { class: 'bz-small bz-muted', style: { padding: '16px', margin: '0' }, text: 'Aucun signalement. Bonne nouvelle.' }));

  const r = state.reports.find((x) => x.id === state.reportId);
  const detail = el('div', { class: 'bz-card adm-detail' });
  if (!r) {
    detail.append(el('p', { class: 'bz-small bz-muted', style: { margin: '0' }, text: 'Sélectionne un signalement pour voir le détail.' }));
  } else {
    const isSuper = !!state.me.is_super_admin;
    const target = state.users.find((u) => u.id === r.reported.id);
    const line = (label, value) => el('div', { class: 'adm-line' }, el('span', { class: 'bz-muted', text: label }), el('b', {}, value));
    const setStatus = (status, label) => run(async () => {
      await call(`/admin/reports/${r.id}`, { method: 'PATCH', body: { status } });
      await after('Signalement ' + shortId(r.id) + ' : ' + label + '.', loadReports);
    });
    const statusBtn = (status, label, tone) => el('button', {
      class: 'bz-btn is-sm is-' + tone, type: 'button', text: label, disabled: r.status === status,
      onclick: () => setStatus(status, label.toLowerCase())
    });
    const cannotAct = r.reported.deleted ? 'Ce compte est supprimé.' : null;
    const banWhy = cannotAct || (r.reported.banned_at ? 'Déjà banni.' : null) || (r.reported.is_super_admin ? 'Retire-lui d’abord le rang de super admin.' : null) || (isSuper ? null : SUPER_ONLY);

    put(detail,
      PHONE.matches ? null : el('div', { class: 'bz-row' }, el('b', { style: { fontFamily: 'var(--font-display)', fontSize: '16px' }, text: 'Signalement ' + shortId(r.id) }), pill(REPORT_STATUS, r.status)),
      el('div', { class: 'bz-stack', style: { gap: '8px', marginTop: '14px' } },
        line('Date', dateTime(r.created_date)),
        line('Motif', REASONS[r.reason] || r.reason),
        line('Signalant', (r.reporter.pseudo || '—') + (r.reporter.email ? ' · ' + r.reporter.email : '')),
        line('Signalé', el('span', { style: { color: 'var(--text-danger)' }, text: (r.reported.pseudo || '—') + ' · signalé ' + r.reported.reports_received + ' fois' + (r.reported.banned_at ? ' · banni' : '') + (r.reported.deleted ? ' · supprimé' : '') })),
        line('Contexte', r.context_type ? (CONTEXTS[r.context_type] || r.context_type) : 'Le membre, sans contenu précis')
      ),
      el('div', { class: 'adm-quote' },
        el('span', { class: 'bz-eyebrow', text: 'Commentaire du signalant' }),
        el('p', { text: r.description || '—' })
      ),
      r.content ? el('div', { class: 'adm-quote is-red' },
        el('span', { class: 'bz-eyebrow', style: { color: 'var(--text-danger)' }, text: 'Contenu signalé' }),
        el('p', { text: r.content })
      ) : null,
      r.content_deleted ? el('p', { class: 'bz-small bz-muted', style: { margin: '10px 0 0' }, text: 'Le contenu signalé a été supprimé depuis.' }) : null,
      el('div', { class: 'bz-row adm-actions', style: { marginTop: '16px', gap: '7px' } },
        el('button', { class: 'bz-btn is-violet', type: 'button', text: 'Avertir', disabled: !!cannotAct || !target, title: cannotAct || '', onclick: () => target && userActs.warn(target, r.id) }),
        el('button', { class: 'bz-btn is-red', type: 'button', text: 'Bannir le compte', disabled: !!banWhy || !target, title: banWhy || '', onclick: () => target && userActs.ban(target) })
      ),
      el('div', { class: 'bz-row adm-status', style: { marginTop: '10px', gap: '6px' } },
        el('span', { class: 'bz-tiny', text: 'Statut :' }),
        statusBtn('INVESTIGATING', 'En cours', 'violet'),
        statusBtn('RESOLVED', 'Traité', 'green'),
        statusBtn('DISMISSED', 'Classé sans suite', 'grey'),
        statusBtn('OPEN', 'Rouvrir', 'grey')
      )
    );
  }

  return el('div', { class: 'adm-split' },
    showList ? el('section', { class: 'bz-card adm-list-card' },
      el('div', { class: 'adm-list-head', text: 'Signalements · ' + state.reports.length }),
      list
    ) : null,
    showDetail && narrow ? (PHONE.matches && r
      ? paneHead('Tous les signalements', 'Signalement ' + shortId(r.id), REASONS[r.reason] || r.reason, pill(REPORT_STATUS, r.status))
      : backButton('Tous les signalements')) : null,
    showDetail ? detail : null
  );
}

// ---------- Onglet Support ----------
async function openTicket(id) {
  const opening = state.pane !== 'ticket' || state.ticketId !== id;
  state.ticketId = id;
  state.ticket = null;
  openPane('ticket');
  render();
  if (opening) paneTop();
  try {
    // Ouvrir, c'est prendre en charge : le serveur passe le ticket en cours et
    // l'écrit dans le fil du membre.
    const { ticket } = await call(`/admin/support/tickets/${id}`);
    state.ticket = ticket;
    await loadTickets();
  } catch (e) {
    toast(e.message, 'err');
  }
  render();
}

function renderSupport() {
  const narrow = NARROW.matches;
  const showList = !narrow || state.pane !== 'ticket';
  const showDetail = !narrow || state.pane === 'ticket';
  const filterBtn = (value, label, count) => el('button', {
    class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(state.ticketFilter === value),
    onclick: async () => {
      state.ticketFilter = value;
      try { await loadTickets(); } catch (e) { toast(e.message, 'err'); }
      render();
    }
  }, label, count === null ? null : el('span', { class: 'bz-count', text: String(count) }));

  const c = state.ticketCounts;
  const filters = el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Filtrer les tickets', style: { marginTop: '16px' } },
    filterBtn('', 'Tous', null),
    filterBtn('PENDING', 'En attente', c.PENDING),
    filterBtn('OPEN', 'En cours', c.OPEN),
    filterBtn('CLOSED', 'Clôturés', c.CLOSED)
  );

  const list = el('div', { class: 'adm-list' });
  for (const t of state.tickets) {
    list.append(el('button', {
      class: 'adm-item', type: 'button', 'aria-current': t.id === state.ticketId ? 'true' : 'false',
      onclick: () => openTicket(t.id)
    },
    el('div', { class: 'bz-row', style: { gap: '8px' } },
      t.has_unread ? el('span', { class: 'bz-dot', title: 'Nouveau message du membre' }) : null,
      el('b', { style: { fontFamily: 'var(--font-ui)', fontSize: '12.5px', flex: '1', minWidth: '0', overflowWrap: 'anywhere' }, text: t.subject }),
      pill(TICKET_STATUS, t.status)
    ),
    el('div', { class: 'bz-small bz-muted', style: { marginTop: '5px' } },
      el('span', { text: (t.user.pseudo || t.user.email || '—') + ' · ' + t.topic_label + ' · ' + t.age })
    )
    ));
  }
  if (!state.tickets.length) list.append(el('p', { class: 'bz-small bz-muted', style: { padding: '16px', margin: '0' }, text: 'Aucun ticket dans cette file.' }));

  const t = state.ticket;
  if (PHONE.matches && showDetail) return renderTicketChat(t);
  const detail = el('div', { class: 'bz-card adm-detail' });
  if (!state.ticketId) {
    detail.append(el('p', { class: 'bz-small bz-muted', style: { margin: '0' }, text: 'Sélectionne un ticket pour ouvrir la conversation. L’ouvrir le prend en charge.' }));
  } else if (!t) {
    detail.append(el('div', { class: 'bz-skeleton', style: { height: '140px' } }));
  } else {
    const setStatus = (status) => run(async () => {
      const { ticket } = await call(`/admin/support/tickets/${t.id}`, { method: 'PATCH', body: { status } });
      state.ticket = ticket;
      await loadTickets();
      render();
      toast('Ticket ' + shortId(t.id) + ' : ' + TICKET_STATUS[status][0].toLowerCase() + '.');
    });
    const statusRow = el('div', { class: 'bz-row adm-status', style: { gap: '6px', marginTop: '10px' } },
      ...['PENDING', 'OPEN', 'CLOSED'].map((s) => el('button', {
        class: 'bz-btn is-sm' + (t.status === s ? ' is-violet' : ''), type: 'button', text: TICKET_STATUS[s][0],
        disabled: t.status === s, onclick: () => setStatus(s)
      }))
    );
    const thread = el('div', { class: 'bz-thread adm-thread' });
    for (const m of t.messages || []) {
      if (m.kind === 'system') {
        thread.append(el('span', { class: 'bz-system', text: m.body + ' · ' + dateShort(m.created_date) }));
        continue;
      }
      const mine = m.kind === 'support';
      thread.append(el('div', { class: 'bz-bubble-wrap' + (mine ? ' is-mine' : '') },
        el('span', { class: 'bz-bubble-meta', text: (mine ? 'Support boostZ' : (t.user.pseudo || 'Membre')) + ' · ' + dateTime(m.created_date) }),
        m.body ? el('span', { class: 'bz-bubble', text: m.body }) : null,
        thumbs(m.images)
      ));
    }
    const reply = el('textarea', { class: 'bz-input', rows: '3', maxlength: '4000', 'aria-label': 'Réponse au membre', placeholder: 'Répondre au membre…' });
    const send = el('button', { class: 'bz-btn is-violet', type: 'button', text: 'Envoyer' });
    send.addEventListener('click', () => run(async () => {
      if (!reply.value.trim()) return toast('Écris une réponse.', 'err');
      send.disabled = true;
      await call(`/admin/support/tickets/${t.id}/messages`, { method: 'POST', body: { message: reply.value.trim() } });
      const { ticket } = await call(`/admin/support/tickets/${t.id}`);
      state.ticket = ticket;
      await loadTickets();
      render();
      toast('Réponse envoyée.');
    }));
    const ctx = t.context || {};
    const ctxText = [ctx.app_version && 'app ' + ctx.app_version, ctx.platform, ctx.os_version && 'OS ' + ctx.os_version, ctx.update_id && 'OTA ' + String(ctx.update_id).slice(0, 8)].filter(Boolean).join(' · ');

    put(detail,
      el('div', { class: 'bz-row' },
        el('b', { style: { fontFamily: 'var(--font-display)', fontSize: '15px', flex: '1', minWidth: '0', overflowWrap: 'anywhere' }, text: t.subject }),
        pill(TICKET_STATUS, t.status)),
      el('div', { class: 'bz-small bz-muted', style: { marginTop: '4px' } },
        el('span', { text: (t.user.pseudo || '—') + ' · ' + (t.user.email || '') + ' · ' + t.topic_label + (t.when_label ? ' · ' + t.when_label : '') })),
      statusRow,
      el('div', { class: 'adm-quote' },
        el('span', { class: 'bz-eyebrow', text: 'Demande' }),
        el('p', { text: t.description }),
        t.steps ? el('p', { class: 'bz-muted', text: 'Étapes : ' + t.steps }) : null,
        thumbs(t.images),
        ctxText ? el('p', { class: 'bz-tiny', text: ctxText }) : null
      ),
      thread,
      el('div', { class: 'bz-stack', style: { gap: '8px', marginTop: '12px' } }, reply, el('div', { class: 'bz-row bz-actions' }, send))
    );
  }

  return el('div', {},
    showList ? filters : null,
    el('div', { class: 'adm-split', style: { marginTop: '12px' } },
      showList ? el('section', { class: 'bz-card adm-list-card' },
        el('div', { class: 'adm-list-head', text: 'Tickets · ' + state.tickets.length }),
        list) : null,
      showDetail && narrow ? backButton('Tous les tickets') : null,
      showDetail ? detail : null
    )
  );
}

// Téléphone : la conversation d'un ticket comme une messagerie. En-tête collé
// avec retour et statut, la demande en tête du fil, et la zone de réponse
// collée au bas de l'écran avec un bouton d'envoi rond, comme dans l'app.
function renderTicketChat(t) {
  if (!t) {
    return el('div', { class: 'adm-chat' },
      paneHead('Tous les tickets', 'Chargement…', null, null),
      el('div', { class: 'bz-skeleton', style: { height: '140px', marginTop: '12px' } })
    );
  }
  const statusBtn = el('button', { class: 'adm-status-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Changer le statut du ticket' },
    pill(TICKET_STATUS, t.status));
  statusBtn.addEventListener('click', () => {
    const buttons = [];
    togglePopover(statusBtn, buttons, () => el('div', { class: 'bz-menu', role: 'menu', 'aria-label': 'Statut du ticket' },
      el('div', { class: 'bz-menu-title', text: 'Statut du ticket' }),
      ['PENDING', 'OPEN', 'CLOSED'].map((s) => {
        const b = el('button', {
          class: 'bz-menu-item', type: 'button', role: 'menuitem', disabled: t.status === s,
          onclick: () => {
            closePopover();
            run(async () => {
              const { ticket } = await call(`/admin/support/tickets/${t.id}`, { method: 'PATCH', body: { status: s } });
              state.ticket = ticket;
              await loadTickets();
              render();
              toast('Ticket ' + shortId(t.id) + ' : ' + TICKET_STATUS[s][0].toLowerCase() + '.');
            });
          }
        }, el('span', { class: 'bz-menu-label', text: TICKET_STATUS[s][0] }), t.status === s ? el('span', { class: 'bz-menu-why', text: 'Statut actuel' }) : null);
        buttons.push(b);
        return b;
      })
    ));
  });

  const ctx = t.context || {};
  const ctxText = [ctx.app_version && 'app ' + ctx.app_version, ctx.platform, ctx.os_version && 'OS ' + ctx.os_version, ctx.update_id && 'OTA ' + String(ctx.update_id).slice(0, 8)].filter(Boolean).join(' · ');
  const thread = el('div', { class: 'bz-thread adm-thread' });
  for (const m of t.messages || []) {
    if (m.kind === 'system') {
      thread.append(el('span', { class: 'bz-system', text: m.body + ' · ' + dateShort(m.created_date) }));
      continue;
    }
    const mine = m.kind === 'support';
    thread.append(el('div', { class: 'bz-bubble-wrap' + (mine ? ' is-mine' : '') },
      el('span', { class: 'bz-bubble-meta', text: (mine ? 'Support boostZ' : (t.user.pseudo || 'Membre')) + ' · ' + dateTime(m.created_date) }),
      m.body ? el('span', { class: 'bz-bubble', text: m.body }) : null,
      thumbs(m.images)
    ));
  }

  const reply = el('textarea', { class: 'adm-composer-input', rows: '1', maxlength: '4000', 'aria-label': 'Réponse au membre', placeholder: 'Répondre au membre…' });
  const send = el('button', { class: 'adm-send', type: 'button', 'aria-label': 'Envoyer la réponse', disabled: true }, icon('send', 18));
  // La zone grandit avec le texte, jusqu'à cinq lignes environ.
  reply.addEventListener('input', () => {
    reply.style.height = 'auto';
    reply.style.height = Math.min(reply.scrollHeight, 120) + 'px';
    send.disabled = !reply.value.trim();
  });
  send.addEventListener('click', () => run(async () => {
    if (!reply.value.trim()) return;
    send.disabled = true;
    await call(`/admin/support/tickets/${t.id}/messages`, { method: 'POST', body: { message: reply.value.trim() } });
    const { ticket } = await call(`/admin/support/tickets/${t.id}`);
    state.ticket = ticket;
    await loadTickets();
    render();
    // Le message envoyé est en bas du fil : on y va.
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    toast('Réponse envoyée.');
  }));

  return el('div', { class: 'adm-chat' },
    paneHead('Tous les tickets', t.subject, (t.user.pseudo || t.user.email || '—') + ' · ' + t.topic_label, statusBtn),
    el('div', { class: 'adm-quote adm-chat-fiche' },
      el('span', { class: 'bz-eyebrow', text: 'Demande' + (t.when_label ? ' · ' + t.when_label : '') }),
      el('p', { text: t.description }),
      t.steps ? el('p', { class: 'bz-muted', text: 'Étapes : ' + t.steps }) : null,
      thumbs(t.images),
      el('p', { class: 'bz-tiny', text: [t.user.email, ctxText].filter(Boolean).join(' · ') })
    ),
    thread,
    el('div', { class: 'adm-composer' }, reply, send)
  );
}

// ---------- Onglet Journal ----------
function detailText(a) {
  const d = a.details || {};
  const role = (r) => (r === 'admin' ? 'admin' : 'membre');
  switch (a.action) {
    case 'role': return role(d.from) + ' → ' + role(d.to) + (d.cleared_super_admin ? ', rang de super admin retiré' : '');
    case 'super_admin': return d.super_admin ? 'nommé super admin' : 'rang retiré';
    case 'report_status': return (REPORT_STATUS[d.from] || [d.from])[0] + ' → ' + (REPORT_STATUS[d.to] || [d.to])[0];
    case 'delete_account': return (d.cards_deleted ?? 0) + ' cartes, ' + (d.photos_deleted ?? 0) + ' photos, ' + (d.exchanges_cancelled ?? 0) + ' échanges annulés';
    case 'unban': return d.previous_reason ? 'motif initial : ' + d.previous_reason : '';
    case 'warn': return d.report_id ? 'lié au signalement ' + shortId(d.report_id) : '';
    default: return '';
  }
}

function journalCard(a) {
  const detail = [a.reason, detailText(a)].filter(Boolean).join(' · ');
  return el('article', { class: 'bz-cardrow adm-jrow' },
    el('div', { class: 'adm-jrow-top' },
      el('b', { text: ACTIONS[a.action] || a.action }),
      el('span', { text: dateTimeShort(a.created_date) })
    ),
    el('div', { class: 'adm-jrow-who' },
      el('span', { text: a.actor.pseudo || '—' }), ' → ', el('span', { text: a.target ? (a.target.pseudo || a.target.email || '—') : '—' })
    ),
    detail ? el('div', { class: 'adm-jrow-detail', text: detail }) : null
  );
}

function renderJournal() {
  const rows = PHONE.matches ? [] : state.actions.map((a) => el('tr', {},
    el('td', { class: 'bz-muted', style: { whiteSpace: 'nowrap' }, text: dateTime(a.created_date) }),
    el('td', {}, el('b', { style: { fontFamily: 'var(--font-ui)' }, text: a.actor.pseudo || '—' })),
    el('td', { text: ACTIONS[a.action] || a.action }),
    el('td', { text: a.target ? (a.target.pseudo || a.target.email || '—') : '—' }),
    el('td', { class: 'bz-muted', style: { maxWidth: '280px', overflowWrap: 'anywhere' }, text: a.reason || '—' }),
    el('td', { class: 'bz-muted', text: detailText(a) || '—' })
  ));
  return el('section', { class: 'bz-card', style: { padding: '0', overflow: 'hidden', marginTop: '16px' } },
    el('div', { class: 'adm-list-head', text: 'Journal des actions · 200 dernières' }),
    PHONE.matches ? el('div', { class: 'bz-cards' }, state.actions.map(journalCard)) : el('div', { class: 'bz-table-wrap' },
      el('table', { class: 'bz-table' },
        el('thead', {}, el('tr', {}, el('th', { text: 'Date' }), el('th', { text: 'Auteur' }), el('th', { text: 'Action' }), el('th', { text: 'Compte visé' }), el('th', { text: 'Motif' }), el('th', { text: 'Détail' }))),
        el('tbody', {}, rows)
      )
    ),
    state.actions.length ? null : el('p', { class: 'bz-small bz-muted', style: { padding: '20px 16px', margin: '0', textAlign: 'center' }, text: 'Aucune action enregistrée pour le moment.' })
  );
}

// ---------- Rendu général ----------
function renderHeader() {
  renderTop(topHost, { label: 'ADMINISTRATION', next: 'admin', adminLabel: true, title: state.loaded ? SECTIONS[state.tab] : '' });
}

function goTo(tab) {
  state.tab = tab;
  state.pane = null;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// Téléphone : la navigation de la console, collée en bas, comme celle de l'app.
function bottomNav(openReports, pending) {
  const item = (id, badge) => el('button', {
    class: 'adm-nav-item', type: 'button', 'aria-current': state.tab === id ? 'page' : null, onclick: () => goTo(id)
  },
  el('span', { class: 'adm-nav-icon' }, icon(id, 22), badge ? el('span', { class: 'adm-nav-badge', text: badge > 99 ? '99+' : String(badge) }) : null),
  el('span', { class: 'adm-nav-label', text: SECTIONS[id] }));
  return el('nav', { class: 'adm-nav', 'aria-label': 'Sections de la console' },
    item('users', 0), item('reports', openReports), item('support', pending), item('journal', 0));
}

// `short` : le libellé des chiffres clés sur téléphone, où ils tiennent en une
// rangée au lieu de manger le premier écran.
// Sur téléphone, chaque chiffre est un raccourci : il ouvre la liste qu'il compte.
function kpi(label, short, value, color, go) {
  return el(PHONE.matches && go ? 'button' : 'div', { class: 'bz-card is-tight adm-kpi', type: PHONE.matches && go ? 'button' : null, onclick: PHONE.matches ? go : null },
    el('span', { class: 'bz-eyebrow' }, el('span', { class: 'bz-hide-sm', text: label }), el('span', { class: 'bz-show-sm', text: short })),
    el('div', { class: 'adm-kpi-value', style: { color: color || 'var(--text)' }, text: String(value) })
  );
}

function render() {
  if (!state.loaded) return;
  closePopover();
  const phone = PHONE.matches;
  renderHeader();
  const tab = (id, label, count) => el('button', {
    class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(state.tab === id),
    onclick: () => { state.tab = id; state.pane = null; render(); }
  }, label, count ? el('span', { class: 'bz-count', text: String(count) }) : null);

  const openReports = state.reports.filter((r) => r.status === 'OPEN').length;
  const openTickets = (state.ticketCounts.PENDING || 0) + (state.ticketCounts.OPEN || 0);
  const banned = state.users.filter((u) => u.banned_at && !u.deleted).length;

  const panel = state.tab === 'users' ? renderUsers()
    : state.tab === 'reports' ? renderReports()
      : state.tab === 'support' ? renderSupport()
        : renderJournal();

  const scrollY = window.scrollY;
  const chat = phone && state.pane === 'ticket';
  document.body.classList.toggle('adm-with-nav', phone && !chat);
  document.body.classList.toggle('adm-with-composer', chat && !!state.ticket);
  put(clear(host),
    phone && state.pane ? null : el('div', { class: 'bz-grid adm-kpis' },
      kpi('Comptes', 'Comptes', state.users.filter((u) => !u.deleted).length, null, () => { state.userKinds = new Set(DEFAULT_KINDS); state.q = ''; goTo('users'); }),
      kpi('Signalements ouverts', 'Signal.', openReports, openReports ? 'var(--text-danger)' : null, () => goTo('reports')),
      kpi('Tickets à traiter', 'Tickets', openTickets, openTickets ? 'var(--soft-violet-text)' : null, () => run(async () => { state.ticketFilter = 'PENDING'; await loadTickets(); goTo('support'); })),
      kpi('Comptes bannis', 'Bannis', banned, null, () => { state.userKinds = new Set(['banned']); state.q = ''; goTo('users'); })
    ),
    phone ? null : el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Sections de la console', style: { marginTop: '22px' } },
      tab('users', 'Utilisateurs'),
      tab('reports', 'Signalements', openReports),
      tab('support', 'Support', state.ticketCounts.PENDING || 0),
      tab('journal', 'Journal')
    ),
    panel,
    phone ? null : el('p', { class: 'bz-tiny', style: { marginTop: '12px' },
      text: state.me.is_super_admin
        ? 'Tu es super admin : tu peux bannir, supprimer un compte et nommer un super admin. Chaque geste est inscrit au journal.'
        : 'Seul un super admin peut bannir, supprimer un compte ou nommer un super admin. Chaque geste est inscrit au journal.' }),
    phone ? null : el('nav', { class: 'bz-foot' },
      el('a', { href: 'compte.html', text: 'Mon compte' }),
      el('a', { href: 'index.html', class: 'push', text: '← Retour au site' })
    ),
    phone && !chat ? bottomNav(openReports, state.ticketCounts.PENDING || 0) : null
  );
  // Sans animation : html défile en douceur, et le redessin repartait du haut.
  window.scrollTo({ top: scrollY, behavior: 'instant' });
}

export async function start() {
  host = document.getElementById('main');
  topHost = document.getElementById('top');
  toastHost = document.getElementById('toast');

  if (!session()) {
    renderTop(topHost, { label: 'ADMINISTRATION', next: 'admin', adminLabel: true });
    return gate(host, { title: 'Accès réservé aux admins', text: 'Cette console est réservée aux comptes administrateurs. Connecte-toi avec ton compte pour continuer.', next: 'admin', red: true, cta: 'Ouvrir une session admin' });
  }
  const wake = setTimeout(() => toast('Le serveur se réveille, cela peut prendre une trentaine de secondes…', 'note'), 2500);
  try {
    state.me = await refreshMe();
  } catch (e) {
    clearTimeout(wake);
    if (e.status === 401) return start();
    renderTop(topHost, { label: 'ADMINISTRATION', next: 'admin', adminLabel: true });
    return clear(host).append(el('div', { class: 'bz-msg is-err', role: 'alert', text: e.message }));
  }
  renderHeader();
  if (!isAdmin(state.me)) {
    clearTimeout(wake);
    gate(host, { title: 'Accès réservé aux admins', text: 'Le compte ' + (state.me.pseudo || state.me.email) + ' n’a pas les droits administrateur.', next: 'admin', red: true, cta: 'Aller à mon compte' });
    // Pas vers la connexion : elle renverrait aussitôt ici un compte déjà connecté.
    const link = host.querySelector('a.bz-btn');
    if (link) link.setAttribute('href', 'compte.html');
    return;
  }
  await loadAll();
  clearTimeout(wake);
  clear(toastHost);
  // Tourner le téléphone ou redimensionner la fenêtre change la mise en page.
  PHONE.addEventListener('change', () => render());
  NARROW.addEventListener('change', () => { state.pane = null; render(); });
}
