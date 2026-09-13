// La console d'administration de boostz.fr.
//
// Elle ne décide de rien. Chaque bouton appelle une route /admin/* et le serveur
// accepte ou refuse selon le rôle et le rang du compte connecté ; les boutons
// grisés ne font qu'annoncer un refus certain, avec sa raison au survol. Tout
// texte venu de l'API (pseudos, messages, signalements) passe par textContent.
import { session, refreshMe, call, isAdmin } from './api.js';
import { el, clear, put, renderTop, gate, dateShort, dateTime, roleLabel, rolePillClass, initialOf } from './chrome.js';

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
  q: '', userFilter: 'all',
  loaded: false
};

const pill = (map, key) => {
  const [label, cls] = map[key] || [key, 'bz-pill'];
  return el('span', { class: cls, text: label });
};

const shortId = (id) => '#' + String(id).slice(-6).toUpperCase();

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

// Les boutons d'une ligne. `why` grise le bouton et dit pourquoi au survol ;
// le serveur refuserait de toute façon.
function userButtons(u) {
  const me = state.me;
  const isSuper = !!me.is_super_admin;
  const self = u.id === me.id;
  const out = [];
  const btn = (label, tone, onclick, why) => el('button', {
    class: 'bz-btn is-sm is-' + tone,
    type: 'button',
    text: label,
    disabled: !!why,
    title: why || '',
    onclick: why ? undefined : onclick
  });
  const superWhy = isSuper ? null : SUPER_ONLY;
  if (u.deleted) return [el('span', { class: 'bz-tiny', text: '—' })];
  if (u.banned_at) {
    out.push(btn('Réactiver', 'green', () => userActs.unban(u), superWhy));
    out.push(btn('Supprimer', 'red', () => userActs.remove(u), superWhy));
    return out;
  }
  if (u.is_super_admin) {
    out.push(btn('Retirer le rang', 'amber', () => userActs.superOff(u), superWhy || (state.superCount <= 1 ? 'C’est le dernier super admin.' : null)));
    out.push(btn('Retirer admin', 'violet', () => userActs.demote(u), superWhy || (state.superCount <= 1 ? 'C’est le dernier super admin.' : null)));
  } else if (u.role === 'admin') {
    out.push(btn('Retirer admin', 'violet', () => userActs.demote(u), state.adminCount <= 1 ? 'C’est le dernier administrateur.' : null));
    out.push(btn('Nommer super admin', 'amber', () => userActs.superOn(u), superWhy));
  } else {
    out.push(btn('Passer admin', 'violet', () => userActs.promote(u)));
  }
  if (!u.is_super_admin) out.push(btn('Avertir', 'violet', () => userActs.warn(u), self ? 'C’est ton compte.' : null));
  if (!u.is_super_admin) {
    out.push(btn('Bannir', 'red', () => userActs.ban(u), self ? 'C’est ton compte.' : superWhy));
    out.push(btn('Supprimer', 'red', () => userActs.remove(u), self ? 'Passe par la page de suppression.' : superWhy));
  }
  return out;
}

function statusPills(u) {
  const pills = [];
  if (u.deleted) pills.push(el('span', { class: 'bz-pill is-grey', text: 'Supprimé' }));
  else if (u.banned_at) pills.push(el('span', { class: 'bz-pill is-red', text: 'Banni' }));
  else pills.push(el('span', { class: rolePillClass(u), text: roleLabel(u) }));
  if (!u.deleted && !u.is_adult) pills.push(el('span', { class: 'bz-pill is-amber', text: 'Mineur' }));
  return pills;
}

// ---------- Onglet Utilisateurs ----------
function renderUsers() {
  const q = state.q.trim().toLowerCase();
  const filters = {
    all: () => true,
    members: (u) => !u.deleted && !u.banned_at && u.role !== 'admin',
    admins: (u) => !u.deleted && u.role === 'admin',
    banned: (u) => !!u.banned_at && !u.deleted,
    deleted: (u) => u.deleted
  };
  const shown = state.users.filter(filters[state.userFilter]).filter((u) =>
    !q || (u.pseudo || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));

  const search = el('input', { class: 'bz-input', type: 'search', value: state.q, placeholder: 'Rechercher un pseudo ou une adresse…', 'aria-label': 'Rechercher un compte', style: { flex: '1', minWidth: '200px' } });
  search.addEventListener('input', () => {
    state.q = search.value;
    const pos = search.selectionStart;
    render();
    const again = host.querySelector('input[type=search]');
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });
  const filter = el('select', { class: 'bz-input', 'aria-label': 'Filtrer par statut', style: { width: 'auto' } });
  for (const [value, label] of [['all', 'Tous les comptes'], ['members', 'Membres'], ['admins', 'Admins'], ['banned', 'Bannis'], ['deleted', 'Supprimés']]) {
    filter.append(el('option', { value, text: label, selected: state.userFilter === value }));
  }
  filter.addEventListener('change', () => { state.userFilter = filter.value; render(); });

  const rows = shown.map((u) => el('tr', { class: u.deleted ? 'is-deleted' : (u.banned_at ? 'is-banned' : '') },
    el('td', {},
      el('div', { class: 'bz-row', style: { gap: '9px', flexWrap: 'nowrap' } },
        el('span', { class: 'bz-avatar', 'aria-hidden': 'true', text: initialOf(u) }),
        el('b', { style: { fontFamily: 'var(--font-ui)' }, text: u.pseudo || '—' })
      )
    ),
    el('td', { class: 'bz-muted', title: u.email, style: { whiteSpace: 'nowrap', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis' }, text: u.email }),
    el('td', { class: 'bz-muted', style: { whiteSpace: 'nowrap' }, text: dateShort(u.created_date) }),
    el('td', { style: { textAlign: 'center', fontWeight: '700', color: u.reports_received >= 3 ? 'var(--text-danger)' : 'var(--text-muted)' }, text: String(u.reports_received) }),
    el('td', { style: { textAlign: 'center' }, class: 'bz-muted', text: String(u.reports_sent) }),
    el('td', {}, el('div', { class: 'bz-row', style: { gap: '5px' } }, statusPills(u)), u.banned_reason && !u.deleted ? el('div', { class: 'bz-tiny', title: u.banned_reason, style: { marginTop: '4px', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: 'Motif : ' + u.banned_reason }) : null),
    el('td', {}, el('div', { class: 'bz-row', style: { gap: '5px', justifyContent: 'flex-end' } }, userButtons(u)))
  ));

  return el('section', { class: 'bz-card', style: { padding: '0', overflow: 'hidden', marginTop: '16px' } },
    el('div', { class: 'bz-row', style: { padding: '14px 16px', borderBottom: '1px solid var(--line)' } },
      search, filter,
      el('span', { class: 'bz-small bz-muted', style: { whiteSpace: 'nowrap' }, text: shown.length + (shown.length > 1 ? ' comptes' : ' compte') })
    ),
    el('div', { class: 'bz-table-wrap' },
      el('table', { class: 'bz-table' },
        el('thead', {}, el('tr', {},
          el('th', { text: 'Pseudo' }), el('th', { text: 'E-mail' }), el('th', { text: 'Inscription' }),
          el('th', { style: { textAlign: 'center' }, text: 'Reçus' }), el('th', { style: { textAlign: 'center' }, text: 'Émis' }),
          el('th', { text: 'Statut' }), el('th', { style: { textAlign: 'right' }, text: 'Actions' })
        )),
        el('tbody', {}, rows)
      )
    ),
    shown.length ? null : el('p', { class: 'bz-small bz-muted', style: { padding: '20px 16px', margin: '0', textAlign: 'center' }, text: 'Aucun compte ne correspond.' })
  );
}

// ---------- Onglet Signalements ----------
function renderReports() {
  const list = el('div', { class: 'adm-list' });
  for (const r of state.reports) {
    list.append(el('button', {
      class: 'adm-item', type: 'button', 'aria-current': r.id === state.reportId ? 'true' : 'false',
      onclick: () => { state.reportId = r.id; render(); }
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
      el('div', { class: 'bz-row' }, el('b', { style: { fontFamily: 'var(--font-display)', fontSize: '16px' }, text: 'Signalement ' + shortId(r.id) }), pill(REPORT_STATUS, r.status)),
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
      el('div', { class: 'bz-row', style: { marginTop: '16px', gap: '7px' } },
        el('button', { class: 'bz-btn is-violet', type: 'button', text: 'Avertir', disabled: !!cannotAct || !target, title: cannotAct || '', onclick: () => target && userActs.warn(target, r.id) }),
        el('button', { class: 'bz-btn is-red', type: 'button', text: 'Bannir le compte', disabled: !!banWhy || !target, title: banWhy || '', onclick: () => target && userActs.ban(target) })
      ),
      el('div', { class: 'bz-row', style: { marginTop: '10px', gap: '6px' } },
        el('span', { class: 'bz-tiny', text: 'Statut :' }),
        statusBtn('INVESTIGATING', 'En cours', 'violet'),
        statusBtn('RESOLVED', 'Traité', 'green'),
        statusBtn('DISMISSED', 'Classé sans suite', 'grey'),
        statusBtn('OPEN', 'Rouvrir', 'grey')
      )
    );
  }

  return el('div', { class: 'adm-split' },
    el('section', { class: 'bz-card adm-list-card' },
      el('div', { class: 'adm-list-head', text: 'Signalements · ' + state.reports.length }),
      list
    ),
    detail
  );
}

// ---------- Onglet Support ----------
async function openTicket(id) {
  state.ticketId = id;
  state.ticket = null;
  render();
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

  const detail = el('div', { class: 'bz-card adm-detail' });
  const t = state.ticket;
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
    const statusRow = el('div', { class: 'bz-row', style: { gap: '6px', marginTop: '10px' } },
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
        el('span', { class: 'bz-bubble', text: m.body || '(capture jointe)' })
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
        ctxText ? el('p', { class: 'bz-tiny', text: ctxText }) : null
      ),
      thread,
      el('div', { class: 'bz-stack', style: { gap: '8px', marginTop: '12px' } }, reply, el('div', {}, send))
    );
  }

  return el('div', {},
    filters,
    el('div', { class: 'adm-split', style: { marginTop: '12px' } },
      el('section', { class: 'bz-card adm-list-card' },
        el('div', { class: 'adm-list-head', text: 'Tickets · ' + state.tickets.length }),
        list),
      detail
    )
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

function renderJournal() {
  const rows = state.actions.map((a) => el('tr', {},
    el('td', { class: 'bz-muted', style: { whiteSpace: 'nowrap' }, text: dateTime(a.created_date) }),
    el('td', {}, el('b', { style: { fontFamily: 'var(--font-ui)' }, text: a.actor.pseudo || '—' })),
    el('td', { text: ACTIONS[a.action] || a.action }),
    el('td', { text: a.target ? (a.target.pseudo || a.target.email || '—') : '—' }),
    el('td', { class: 'bz-muted', style: { maxWidth: '280px', overflowWrap: 'anywhere' }, text: a.reason || '—' }),
    el('td', { class: 'bz-muted', text: detailText(a) || '—' })
  ));
  return el('section', { class: 'bz-card', style: { padding: '0', overflow: 'hidden', marginTop: '16px' } },
    el('div', { class: 'adm-list-head', text: 'Journal des actions · 200 dernières' }),
    el('div', { class: 'bz-table-wrap' },
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
  renderTop(topHost, { label: 'ADMINISTRATION', next: 'admin', adminLabel: true });
}

function kpi(label, value, color) {
  return el('div', { class: 'bz-card is-tight' },
    el('span', { class: 'bz-eyebrow', text: label }),
    el('div', { style: { fontFamily: 'var(--font-display)', fontWeight: '700', fontSize: '22px', marginTop: '3px', color: color || 'var(--text)' }, text: String(value) })
  );
}

function render() {
  if (!state.loaded) return;
  const tab = (id, label, count) => el('button', {
    class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(state.tab === id),
    onclick: () => { state.tab = id; render(); }
  }, label, count ? el('span', { class: 'bz-count', text: String(count) }) : null);

  const openReports = state.reports.filter((r) => r.status === 'OPEN').length;
  const openTickets = (state.ticketCounts.PENDING || 0) + (state.ticketCounts.OPEN || 0);
  const banned = state.users.filter((u) => u.banned_at && !u.deleted).length;

  const panel = state.tab === 'users' ? renderUsers()
    : state.tab === 'reports' ? renderReports()
      : state.tab === 'support' ? renderSupport()
        : renderJournal();

  const scrollY = window.scrollY;
  put(clear(host),
    el('div', { class: 'bz-grid adm-kpis' },
      kpi('Comptes', state.users.filter((u) => !u.deleted).length),
      kpi('Signalements ouverts', openReports, openReports ? 'var(--text-danger)' : null),
      kpi('Tickets à traiter', openTickets, openTickets ? 'var(--soft-violet-text)' : null),
      kpi('Comptes bannis', banned)
    ),
    el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Sections de la console', style: { marginTop: '22px' } },
      tab('users', 'Utilisateurs'),
      tab('reports', 'Signalements', openReports),
      tab('support', 'Support', state.ticketCounts.PENDING || 0),
      tab('journal', 'Journal')
    ),
    panel,
    el('p', { class: 'bz-tiny', style: { marginTop: '12px' },
      text: state.me.is_super_admin
        ? 'Tu es super admin : tu peux bannir, supprimer un compte et nommer un super admin. Chaque geste est inscrit au journal.'
        : 'Seul un super admin peut bannir, supprimer un compte ou nommer un super admin. Chaque geste est inscrit au journal.' }),
    el('nav', { class: 'bz-foot' },
      el('a', { href: 'compte.html', text: 'Mon compte' }),
      el('a', { href: 'index.html', class: 'push', text: '← Retour au site' })
    )
  );
  window.scrollTo(0, scrollY);
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
}
