import { session, refreshMe, call } from './api.js';
import { el, clear, put, renderTop, gate, say, dateFr, dateTime, thumbs } from './chrome.js';

const TOPICS = [
  ['collection', 'Ma collection (cartes, scellés)'],
  ['scan', 'Scan et reconnaissance de cartes'],
  ['prices', 'Prix et cotes'],
  ['exchanges', 'Échanges'],
  ['community', 'Communauté, forums, profils'],
  ['shop', 'Boosties, boutique et achats'],
  ['account', 'Mon compte et mes données'],
  ['other', 'Autre chose']
];
const WHEN = [
  ['', 'Je ne précise pas'],
  ['now', 'À l’instant'],
  ['today', 'Aujourd’hui'],
  ['week', 'Cette semaine'],
  ['older', 'Plus ancien, ou je ne sais plus']
];
const STATUS = {
  PENDING: ['En attente', 'bz-pill is-amber'],
  OPEN: ['En cours', 'bz-pill is-violet'],
  CLOSED: ['Clôturée', 'bz-pill is-green']
};

const main = document.getElementById('main');
const top = document.getElementById('top');
const state = { user: null, tickets: [], selected: null, detail: null };

const pill = (status) => {
  const [label, cls] = STATUS[status] || [status, 'bz-pill'];
  return el('span', { class: cls, text: label });
};

function field(label, control, hint) {
  const id = control.id;
  return el('div', { class: 'bz-field' },
    el('label', { class: 'bz-label', for: id }, label, hint ? el('small', { text: ' — ' + hint }) : null),
    control
  );
}

function select(id, options) {
  const s = el('select', { id, class: 'bz-input' });
  for (const [value, label] of options) s.append(el('option', { value, text: label }));
  return s;
}

// ---------- Nouvelle demande ----------
function newTicketCard() {
  const card = el('section', { class: 'bz-card', 'aria-labelledby': 'new-title' });
  const msg = el('div', { 'aria-live': 'polite' });

  function showForm() {
    const topic = select('topic', TOPICS);
    const subject = el('input', { id: 'subject', class: 'bz-input', maxlength: '120', required: true, placeholder: 'Ex. : la cote de ma carte a doublé en un jour' });
    const when = select('when', WHEN);
    const description = el('textarea', { id: 'description', class: 'bz-input', maxlength: '4000', required: true, rows: '5', placeholder: 'Décris ce qui s’est passé, avec la carte ou l’échange concerné si possible.' });
    const steps = el('textarea', { id: 'steps', class: 'bz-input', maxlength: '2000', rows: '3', placeholder: '1. J’ouvre… 2. Je touche… 3. Il se passe…' });
    const submit = el('button', { class: 'bz-btn is-primary', type: 'submit', text: 'Envoyer la demande' });

    const form = el('form', { class: 'bz-stack', style: { gap: '13px', marginTop: '14px' }, novalidate: true },
      field('Zone concernée', topic),
      field('Objet', subject),
      field('Quand', when, 'facultatif'),
      field('Ta demande', description),
      field('Étapes pour reproduire', steps, 'facultatif'),
      msg,
      el('div', { class: 'bz-row bz-actions' }, submit, el('span', { class: 'bz-tiny', text: 'Tu retrouves la réponse ici et dans l’application.' }))
    );

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!subject.value.trim()) return say(msg, 'Donne un objet à ta demande.', 'err');
      if (description.value.trim().length < 10) return say(msg, 'Décris ta demande en quelques mots (10 caractères au moins).', 'err');
      submit.disabled = true;
      say(msg, '');
      try {
        const body = { topic: topic.value, subject: subject.value.trim(), description: description.value.trim() };
        if (steps.value.trim()) body.steps = steps.value.trim();
        if (when.value) body.when_hint = when.value;
        const { ticket } = await call('/support/tickets', { method: 'POST', body });
        showDone(ticket.subject);
        await loadTickets(ticket.id);
      } catch (err) {
        say(msg, err.message, 'err');
        submit.disabled = false;
      }
    });

    clear(card).append(el('h2', { id: 'new-title', class: 'bz-h3', text: 'Nouvelle demande' }), form);
  }

  function showDone(subject) {
    put(clear(card),
      el('div', { class: 'bz-msg is-ok', role: 'status' },
        el('div', {},
          el('b', { style: { fontFamily: 'var(--font-ui)' }, text: 'Demande envoyée' }),
          el('p', { style: { margin: '4px 0 0', color: 'var(--text-muted)' }, text: 'Objet : ' + subject + '. Elle apparaît dans « Mes demandes ».' }),
          el('button', { class: 'bz-btn', type: 'button', style: { marginTop: '10px' }, text: 'Ouvrir une autre demande', onclick: showForm })
        )
      )
    );
  }

  showForm();
  return card;
}

// ---------- Mes demandes ----------
const listHost = el('div', { class: 'tk-listhost' });
const NARROW = window.matchMedia('(max-width: 760px)');
let listScroll = 0;

function closeReading() {
  main.classList.remove('is-reading');
  window.scrollTo({ top: listScroll, behavior: 'instant' });
}
const threadHost = el('div', { class: 'tk-threadhost' });
const mineCard = el('section', { class: 'bz-card', 'aria-labelledby': 'mine-title' });

function renderList() {
  clear(listHost);
  if (!state.tickets.length) {
    listHost.append(el('p', { class: 'bz-small bz-muted', style: { marginTop: '10px' }, text: 'Aucune demande pour le moment.' }));
    return;
  }
  const list = el('div', { class: 'tk-list' });
  for (const t of state.tickets) {
    list.append(el('button', {
      class: 'tk-item',
      type: 'button',
      'aria-current': state.selected === t.id ? 'true' : 'false',
      onclick: () => openTicket(t.id)
    },
    t.has_unread ? el('span', { class: 'bz-dot', title: 'Nouvelle réponse' }) : null,
    el('span', { class: 'tk-subject', text: t.subject }),
    pill(t.status),
    el('span', { class: 'tk-date', text: dateFr(t.last_message_at || t.created_date) })
    ));
  }
  listHost.append(list);
}

function renderThread() {
  clear(threadHost);
  const t = state.detail;
  if (!t) {
    threadHost.append(el('p', { class: 'bz-small bz-muted', text: 'Sélectionne une demande pour lire la conversation.' }));
    return;
  }
  const fiche = el('div', { class: 'fiche' },
    el('span', { class: 'bz-eyebrow', text: t.topic_label + (t.when_label ? ' · ' + t.when_label : '') }),
    el('p', { text: t.description }),
    t.steps ? el('p', { class: 'bz-muted', text: 'Étapes : ' + t.steps }) : null,
    thumbs(t.images)
  );
  const thread = el('div', { class: 'bz-thread', style: { marginTop: '14px' } });
  for (const m of t.messages || []) {
    if (m.kind === 'system') {
      thread.append(el('span', { class: 'bz-system', text: m.body + ' · ' + dateFr(m.created_date) }));
      continue;
    }
    const mine = m.kind === 'user';
    thread.append(el('div', { class: 'bz-bubble-wrap' + (mine ? ' is-mine' : '') },
      el('span', { class: 'bz-bubble-meta', text: (mine ? 'Toi' : 'Support boostZ') + ' · ' + dateTime(m.created_date) }),
      m.body ? el('span', { class: 'bz-bubble', text: m.body }) : null,
      thumbs(m.images)
    ));
  }

  const msg = el('div', { 'aria-live': 'polite', style: { marginTop: '10px' } });
  let composer = null;
  if (t.can_post) {
    const input = el('textarea', { class: 'bz-input', rows: '3', maxlength: '4000', 'aria-label': 'Ta réponse', placeholder: 'Répondre au support…' });
    const send = el('button', { class: 'bz-btn is-violet', type: 'button', text: 'Envoyer' });
    send.addEventListener('click', async () => {
      if (!input.value.trim()) return say(msg, 'Écris un message.', 'err');
      send.disabled = true;
      try {
        await call(`/support/tickets/${t.id}/messages`, { method: 'POST', body: { message: input.value.trim() } });
        await openTicket(t.id);
      } catch (err) {
        say(msg, err.message, 'err');
        send.disabled = false;
      }
    });
    composer = el('div', { class: 'bz-stack', style: { marginTop: '14px', gap: '8px' } }, input, el('div', { class: 'bz-row bz-actions' }, send));
  } else if (t.can_reopen) {
    const input = el('textarea', { class: 'bz-input', rows: '2', maxlength: '4000', 'aria-label': 'Pourquoi rouvrir', placeholder: 'Explique en quelques mots pourquoi tu rouvres cette demande.' });
    const reopen = el('button', { class: 'bz-btn is-violet', type: 'button', text: 'Rouvrir la demande' });
    reopen.addEventListener('click', async () => {
      if (!input.value.trim()) return say(msg, 'Explique pourquoi tu rouvres la demande.', 'err');
      reopen.disabled = true;
      try {
        await call(`/support/tickets/${t.id}/reopen`, { method: 'POST', body: { message: input.value.trim() } });
        await loadTickets(t.id);
      } catch (err) {
        say(msg, err.message, 'err');
        reopen.disabled = false;
      }
    });
    composer = el('div', { class: 'bz-stack', style: { marginTop: '14px', gap: '8px' } },
      el('span', { class: 'bz-small bz-muted', text: 'Cette demande est clôturée.' }), input, el('div', { class: 'bz-row bz-actions' }, reopen));
  } else if (t.status === 'PENDING') {
    composer = el('p', { class: 'bz-small bz-muted', style: { marginTop: '14px' }, text: 'Ta demande n’a pas encore été prise en charge. Tu pourras répondre dès que le support l’aura ouverte.' });
  }

  put(threadHost,
    el('div', { class: 'bz-row' }, el('h3', { class: 'bz-h3', style: { flex: '1', minWidth: '0', overflowWrap: 'anywhere' }, text: t.subject }), pill(t.status)),
    el('div', { style: { marginTop: '10px' } }, fiche),
    thread, composer, msg
  );
}

async function openTicket(id) {
  const changed = !state.detail || state.detail.id !== id;
  state.selected = id;
  renderList();
  clear(threadHost).append(el('div', { class: 'bz-skeleton', style: { height: '120px' } }));
  try {
    const { ticket } = await call(`/support/tickets/${id}`);
    state.detail = ticket;
    // Ouvrir, c'est lire : la pastille « nouveau » de la liste s'éteint.
    const row = state.tickets.find((x) => x.id === id);
    if (row) row.has_unread = false;
    renderList();
    renderThread();
    // Écran étroit : la conversation remplace la liste, montrée depuis son haut.
    if (NARROW.matches) {
      if (!main.classList.contains('is-reading')) listScroll = window.scrollY;
      main.classList.add('is-reading');
      if (changed) window.scrollTo({ top: Math.max(0, mineCard.getBoundingClientRect().top + window.scrollY - 72), behavior: 'instant' });
    }
  } catch (err) {
    clear(threadHost).append(el('div', { class: 'bz-msg is-err', role: 'alert', text: err.message }));
  }
}

async function loadTickets(openId) {
  const { tickets } = await call('/support/tickets');
  state.tickets = tickets;
  main.classList.toggle('has-tickets', tickets.length > 0);
  renderList();
  if (openId) await openTicket(openId);
  else renderThread();
}

async function start() {
  if (!session()) {
    renderTop(top, { label: 'SUPPORT', next: 'support' });
    return gate(main, {
      title: 'Connexion requise',
      text: 'Le support a besoin de ton compte pour ouvrir une demande, retrouver ta collection et te répondre.',
      next: 'support'
    });
  }
  try {
    state.user = await refreshMe();
  } catch (err) {
    renderTop(top, { label: 'SUPPORT', next: 'support' });
    if (err.status === 401) return start();
    return clear(main).append(el('div', { class: 'bz-msg is-err', role: 'alert', text: err.message }));
  }
  renderTop(top, { label: 'SUPPORT', next: 'support' });

  const mine = mineCard;
  put(clear(mine),
    el('button', { class: 'tk-back', type: 'button', onclick: closeReading }, el('span', { 'aria-hidden': 'true', text: '‹' }), 'Mes demandes'),
    el('h2', { id: 'mine-title', class: 'bz-h3', text: 'Mes demandes' }),
    listHost,
    el('hr', { class: 'tk-sep', style: { border: '0', borderTop: '1px solid var(--line)', margin: '16px 0' } }),
    threadHost
  );

  put(clear(main),
    el('h1', { class: 'bz-h1', text: 'Contacter le support' }),
    el('p', { class: 'bz-lead' },
      'Connecté en tant que ', el('b', { style: { color: 'var(--text)' }, text: state.user.pseudo || state.user.email }),
      '. Pour une carte ou un échange précis, donne son nom : on le retrouve plus vite.'),
    el('div', { class: 'two' },
      el('div', { class: 'left' }, newTicketCard()),
      el('div', { class: 'right' }, mine)
    ),
    el('nav', { class: 'bz-foot' },
      el('a', { href: 'compte.html', text: 'Mon compte' }),
      el('a', { href: 'suppression-compte.html', text: 'Supprimer mon compte' }),
      el('a', { href: 'confidentialite.html', text: 'Politique de confidentialité' }),
      el('a', { href: 'index.html', class: 'push', text: '← Retour au site' })
    )
  );

  try {
    await loadTickets();
  } catch (err) {
    clear(listHost).append(el('div', { class: 'bz-msg is-err', role: 'alert', text: err.message }));
  }
}

start();
