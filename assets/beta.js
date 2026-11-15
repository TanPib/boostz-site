// La vue « Bêta » de la console (13/10/2026) : les testeurs de la bêta, sur
// Android (Google Play) et sur iPhone (TestFlight), à récompenser à la sortie.
//
// Un testeur est un compte vu avec l'appli des magasins avant la sortie
// publique : l'appli le dit au serveur à chaque lancement, et GET
// /admin/beta-testers rend la liste (server/src/lib/betaTesters.js). Les
// PRÉ-INSCRITS du groupe Google n'y sont pas : Google ne donne aucun accès
// programmable aux membres d'un groupe @googlegroups.com. Ils se comptent sur
// la page du groupe, que la vue relie.
//
// « 14 jours » suit la règle de Google pour ouvrir la production : au moins
// 12 testeurs inscrits depuis 14 jours d'affilée. Elle ne regarde qu'Android :
// d'où le filtre par téléphone (15/11/2026), qui dit à qui écrire pour tenir
// ces 14 jours, et « Copier les e-mails », qui suit ce filtre.
//
// Les comptes de test (le compte de démonstration confié aux examinateurs des
// magasins) restent visibles, grisés en bas de liste, mais ne comptent dans
// aucun chiffre et ne sont jamais copiés : le serveur les marque
// (`is_test_account`) et les retire de ses totaux.
import { call } from './api.js';
import { el, dateShort } from './chrome.js';

const GROUP_MEMBERS = 'https://groups.google.com/g/boostz-beta/members';
const GOOGLE_RULE = 12;

const bt = { status: 'idle', data: null, error: null, seq: 0, platform: '' };

// ---------- Téléphone et profil d'un compte ----------
// Partagé avec l'onglet Utilisateurs (admin.js) : les deux listes parlent des
// mêmes comptes, avec les mêmes mots et le même filtre.
const PLATFORM_LABELS = { android: 'Android', ios: 'iPhone' };

export const onPlatform = (x, platform) => (x.platforms || []).includes(platform);

// « Android », « iPhone », « Android + iPhone », ou null quand le compte n'a
// jamais lancé l'appli des magasins.
export function platformText(x) {
  const names = Object.keys(PLATFORM_LABELS).filter((p) => onPlatform(x, p)).map((p) => PLATFORM_LABELS[p]);
  return names.length ? names.join(' + ') : null;
}

// « Public » ou « Privé » : le réglage « Profil public » de l'appli, privé par
// défaut. Null quand le serveur ne le dit pas encore.
export function profileText(x) {
  if (x.is_public === undefined || x.is_public === null) return null;
  return x.is_public ? 'Public' : 'Privé';
}

// Les totaux du filtre pour une liste de comptes.
export function platformCounts(list) {
  return {
    '': list.length,
    android: list.filter((x) => onPlatform(x, 'android')).length,
    ios: list.filter((x) => onPlatform(x, 'ios')).length
  };
}

// Le filtre « Tous · Android · iPhone ». `set` coche le choix et écrit les
// totaux sans reconstruire les boutons : l'onglet Utilisateurs redessine ses
// lignes sur place, et le bouton touché garde le focus.
export function platformFilter(onPick) {
  const tabs = [['', 'Tous'], ...Object.entries(PLATFORM_LABELS)].map(([value, label]) => {
    const count = el('span', { class: 'bz-count' });
    return { value, count, btn: el('button', { class: 'bz-tab', type: 'button', role: 'tab', onclick: () => onPick(value) }, label, count) };
  });
  return {
    node: el('div', { class: 'bz-tabs adm-platforms', role: 'tablist', 'aria-label': 'Filtrer par téléphone' }, tabs.map((t) => t.btn)),
    set(value, counts) {
      for (const t of tabs) {
        t.btn.setAttribute('aria-selected', String(t.value === value));
        t.count.textContent = String(counts[t.value] ?? 0);
      }
    }
  };
}

export const testPill = () => el('span', {
  class: 'bz-pill is-grey',
  title: 'Compte de démonstration confié aux examinateurs des magasins : il ne compte dans aucun chiffre.',
  text: 'Test'
});

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

// `hint` tient sur une ligne : sur téléphone, les trois cartes font 100 px de
// large et une phrase s'y empilait mot par mot. Le détail va dans `title`.
function figure(label, value, hint, title) {
  return el('div', { class: 'bz-card is-tight adm-kpi', title: title || null },
    el('span', { class: 'bz-eyebrow', text: label }),
    el('div', { class: 'adm-kpi-value', text: value }),
    hint ? el('span', { class: 'adm-kpi-sub', text: hint }) : null
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

const pseudoOf = (t) => el('span', { class: 'bz-row', style: { gap: '6px', flexWrap: 'nowrap' } },
  el('b', { style: { fontFamily: 'var(--font-ui)' }, text: t.pseudo || '—' }),
  t.is_test_account ? testPill() : null
);

function testerCard(t) {
  const profile = profileText(t);
  const account = [platformText(t), profile ? 'profil ' + profile.toLowerCase() : null].filter(Boolean).join(' · ');
  return el('div', { class: 'bz-card is-tight' + (t.is_test_account ? ' is-test' : '') },
    pseudoOf(t),
    el('div', { class: 'bz-small', style: { overflowWrap: 'anywhere' }, text: t.email || '—' }),
    account ? el('div', { class: 'bz-tiny', text: account }) : null,
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
  const all = d.testers || [];
  // Les vrais testeurs d'abord, dans l'ordre du serveur ; les comptes de test
  // après eux, hors des totaux du filtre et de la copie des e-mails.
  const real = all.filter((t) => !t.is_test_account);
  const tests = all.filter((t) => t.is_test_account);
  const wanted = (t) => !bt.platform || onPlatform(t, bt.platform);
  const shown = real.filter(wanted);
  const list = [...shown, ...tests.filter(wanted)];
  const hasProfile = all.some((t) => profileText(t) !== null);

  const filter = platformFilter((value) => { bt.platform = value; rerender(); });
  filter.set(bt.platform, platformCounts(real));
  filter.node.style.marginTop = '12px';

  const rows = list.map((t) => el('tr', { class: t.is_test_account ? 'is-test' : null },
    el('td', {}, pseudoOf(t)),
    el('td', { style: { overflowWrap: 'anywhere' }, text: t.email || '—' }),
    el('td', { style: { whiteSpace: 'nowrap' }, text: platformText(t) || '—' }),
    hasProfile ? el('td', { class: t.is_public ? null : 'bz-muted', text: profileText(t) || '—' }) : null,
    el('td', { class: 'bz-muted', style: { whiteSpace: 'nowrap' }, text: dateShort(t.first_seen_at) }),
    el('td', { class: 'bz-muted', style: { whiteSpace: 'nowrap' }, text: dateShort(t.last_seen_at) }),
    el('td', { style: { textAlign: 'right' }, text: String(t.days_count) }),
    el('td', { class: 'bz-muted', text: t.version_code ? 'vc' + t.version_code : '—' })
  ));

  const where = bt.platform ? ' sur ' + PLATFORM_LABELS[bt.platform] : '';
  const testNote = !tests.length ? ''
    : tests.length > 1 ? ' ' + tests.length + ' comptes de test, grisés en bas de liste, ne sont pas comptés.'
      : ' 1 compte de test, grisé en bas de liste, n’est pas compté.';

  return el('div', {},
    bt.error ? el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '16px' }, text: 'Dernière mise à jour impossible : ' + bt.error }) : null,
    el('div', { class: 'bz-grid adm-kpis bt-kpis', style: { marginTop: '16px' } },
      figure('Testeurs', String(d.total), d.android === undefined ? null : d.android + ' Android · ' + d.ios + ' iPhone'),
      figure('Vus aujourd’hui', String(d.seen_today)),
      figure(phone ? 'Depuis 14 jours' : 'Présents depuis 14 jours', d.fourteen_days + ' / ' + GOOGLE_RULE,
        phone ? 'Sur Android' : 'Sur Android : règle de Google pour ouvrir la production',
        'Google ouvre la production quand 12 testeurs Android sont inscrits depuis 14 jours d’affilée. Le chiffre officiel est dans la Play Console.')
    ),
    el('p', { class: 'bz-small bz-muted', style: { marginTop: '12px' } },
      el('span', { text: 'Un testeur est un compte vu avec l’appli des magasins (Google Play ou TestFlight) avant la sortie (14 janvier 2027). Les pré-inscrits du groupe Google se comptent sur ' }),
      external(GROUP_MEMBERS, 'la page des membres du groupe'),
      el('span', { text: '.' + testNote })
    ),
    filter.node,
    el('section', { class: 'bz-card', style: { padding: '0', overflow: 'hidden', marginTop: '12px' } },
      el('div', { class: 'adm-list-head', style: { display: 'flex', alignItems: 'center', gap: '12px' } },
        // Sur téléphone, le filtre juste au-dessus dit déjà de qui il s'agit :
        // le titre long s'y repliait sur quatre lignes à côté des boutons.
        el('span', { style: { flex: '1' }, text: phone ? 'Plus anciens d’abord' : 'Testeurs' + where + ' · du plus ancien au plus récent' }),
        el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Copier les e-mails', title: 'Les e-mails des testeurs affichés, sans les comptes de test', disabled: shown.length ? null : 'disabled', onclick: () => copyEmails(shown, toast) }),
        el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Actualiser', onclick: () => { loadBeta().then(rerender); } })
      ),
      !list.length
        ? el('p', { class: 'bz-small bz-muted', style: { padding: '20px 16px', margin: '0', textAlign: 'center' }, text: all.length ? 'Aucun testeur' + where + ' pour l’instant.' : 'Aucun testeur pour l’instant. Ils apparaîtront ici dès qu’ils ouvriront l’appli de la bêta.' })
        : phone ? el('div', { class: 'bz-cards' }, list.map(testerCard))
          : el('div', { class: 'bz-table-wrap' },
            el('table', { class: 'bz-table' },
              el('thead', {}, el('tr', {},
                el('th', { text: 'Pseudo' }), el('th', { text: 'E-mail' }),
                el('th', { text: 'Appli', title: 'Le téléphone sur lequel le compte a lancé l’appli de la bêta' }),
                hasProfile ? el('th', { text: 'Profil', title: 'Le réglage « Profil public » de l’appli' }) : null,
                el('th', { text: 'Premier jour' }), el('th', { text: 'Dernier jour' }), el('th', { text: 'Jours', style: { textAlign: 'right' } }), el('th', { text: 'Version' }))),
              el('tbody', {}, rows)
            ))
    )
  );
}
