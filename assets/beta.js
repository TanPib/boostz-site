// La vue « Bêta » de la console (13/10/2026) : les testeurs de la bêta de
// Google Play, à récompenser à la sortie.
//
// Un testeur est un compte vu avec l'appli du Play Store avant la sortie
// publique : l'appli le dit au serveur à chaque lancement, et GET
// /admin/beta-testers rend la liste (server/src/lib/betaTesters.js). Les
// PRÉ-INSCRITS du groupe Google n'y sont pas : Google ne donne aucun accès
// programmable aux membres d'un groupe @googlegroups.com. Ils se comptent sur
// la page du groupe, que la vue relie.
//
// « 14 jours » suit la règle de Google pour ouvrir la production : au moins
// 12 testeurs inscrits depuis 14 jours d'affilée.
import { call } from './api.js';
import { el, dateShort } from './chrome.js';

const GROUP_MEMBERS = 'https://groups.google.com/g/boostz-beta/members';
const GOOGLE_RULE = 12;

const bt = { status: 'idle', data: null, error: null, seq: 0 };

async function loadBeta() {
  const seq = ++bt.seq;
  try {
    const data = await call('/admin/beta-testers');
    if (seq !== bt.seq) return;
    bt.data = data;
    bt.status = 'ready';
    bt.error = null;
  } catch (e) {
    if (seq !== bt.seq) return;
    // Une API plus ancienne que la console : l'onglet le dit calmement.
    if (e.status === 404) {
      bt.status = 'absent';
      bt.data = null;
    } else {
      bt.status = bt.data ? 'ready' : 'error';
      bt.error = e.message;
    }
  }
}

const external = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', text });

function figure(label, value, hint) {
  return el('div', { class: 'bz-card is-tight adm-kpi' },
    el('span', { class: 'bz-eyebrow', text: label }),
    el('div', { class: 'adm-kpi-value', text: value }),
    hint ? el('span', { class: 'bz-tiny bz-muted', text: hint }) : null
  );
}

async function copyEmails(testers, toast) {
  const emails = testers.map((t) => t.email).filter(Boolean);
  if (!emails.length) return toast('Aucun e-mail à copier.', 'note');
  try {
    await navigator.clipboard.writeText(emails.join(', '));
    toast(emails.length + (emails.length > 1 ? ' e-mails copiés.' : ' e-mail copié.'));
  } catch {
    toast('Copie impossible : sélectionne les e-mails dans la liste.', 'note');
  }
}

function testerCard(t) {
  return el('div', { class: 'bz-card is-tight' },
    el('b', { style: { fontFamily: 'var(--font-ui)' }, text: t.pseudo || '—' }),
    el('div', { class: 'bz-small', style: { overflowWrap: 'anywhere' }, text: t.email || '—' }),
    el('div', { class: 'bz-tiny bz-muted', text: 'Depuis le ' + dateShort(t.first_seen_at) + ' · ' + t.days_count + (t.days_count > 1 ? ' jours' : ' jour') + ' · vu le ' + dateShort(t.last_seen_at) })
  );
}

export function renderBeta({ rerender, toast, phone }) {
  if (bt.status === 'idle') {
    bt.status = 'loading';
    loadBeta().then(rerender);
  }
  if (bt.status === 'loading' && !bt.data) {
    return el('div', {}, el('div', { class: 'bz-skeleton', style: { height: '84px', marginTop: '16px' } }), el('div', { class: 'bz-skeleton', style: { height: '240px', marginTop: '12px' } }));
  }
  if (bt.status === 'absent') {
    return el('section', { class: 'bz-card', style: { marginTop: '16px' } },
      el('b', { text: 'Bêta : pas encore branchée côté serveur' }),
      el('p', { class: 'bz-small bz-muted', text: 'Ce serveur ne connaît pas encore /admin/beta-testers. La liste des testeurs apparaîtra ici dès qu’il sera en ligne.' }));
  }
  if (bt.status === 'error') {
    return el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '16px' } },
      el('span', { text: 'Bêta indisponible : ' + bt.error + ' ' }),
      el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Réessayer', onclick: () => { bt.status = 'loading'; rerender(); loadBeta().then(rerender); } }));
  }

  const d = bt.data;
  const testers = d.testers || [];
  const rows = testers.map((t) => el('tr', {},
    el('td', {}, el('b', { style: { fontFamily: 'var(--font-ui)' }, text: t.pseudo || '—' })),
    el('td', { style: { overflowWrap: 'anywhere' }, text: t.email || '—' }),
    el('td', { class: 'bz-muted', style: { whiteSpace: 'nowrap' }, text: dateShort(t.first_seen_at) }),
    el('td', { class: 'bz-muted', style: { whiteSpace: 'nowrap' }, text: dateShort(t.last_seen_at) }),
    el('td', { style: { textAlign: 'right' }, text: String(t.days_count) }),
    el('td', { class: 'bz-muted', text: t.version_code ? 'vc' + t.version_code : '—' })
  ));

  return el('div', {},
    bt.error ? el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '16px' }, text: 'Dernière mise à jour impossible : ' + bt.error }) : null,
    el('div', { class: 'bz-grid adm-kpis', style: { marginTop: '16px' } },
      figure('Testeurs', String(d.total)),
      figure('Vus aujourd’hui', String(d.seen_today)),
      figure('Présents depuis 14 jours', d.fourteen_days + ' / ' + GOOGLE_RULE, 'Règle de Google pour ouvrir la production')
    ),
    el('p', { class: 'bz-small bz-muted', style: { marginTop: '12px' } },
      el('span', { text: 'Un testeur est un compte vu avec l’appli du Play Store avant la sortie (14 janvier 2027). Les pré-inscrits du groupe Google se comptent sur ' }),
      external(GROUP_MEMBERS, 'la page des membres du groupe'),
      el('span', { text: '.' })
    ),
    el('section', { class: 'bz-card', style: { padding: '0', overflow: 'hidden', marginTop: '12px' } },
      el('div', { class: 'adm-list-head', style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        el('span', { style: { flex: '1' }, text: 'Testeurs · du plus ancien au plus récent' }),
        el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Copier les e-mails', disabled: testers.length ? null : 'disabled', onclick: () => copyEmails(testers, toast) }),
        el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Actualiser', onclick: () => { loadBeta().then(rerender); } })
      ),
      !testers.length
        ? el('p', { class: 'bz-small bz-muted', style: { padding: '20px 16px', margin: '0', textAlign: 'center' }, text: 'Aucun testeur pour l’instant. Ils apparaîtront ici dès qu’ils ouvriront l’appli du Play Store : la bêta ouvre le 14 novembre.' })
        : phone ? el('div', { class: 'bz-cards' }, testers.map(testerCard))
          : el('div', { class: 'bz-table-wrap' },
            el('table', { class: 'bz-table' },
              el('thead', {}, el('tr', {}, el('th', { text: 'Pseudo' }), el('th', { text: 'E-mail' }), el('th', { text: 'Premier jour' }), el('th', { text: 'Dernier jour' }), el('th', { text: 'Jours', style: { textAlign: 'right' } }), el('th', { text: 'Version' }))),
              el('tbody', {}, rows)
            ))
    )
  );
}
