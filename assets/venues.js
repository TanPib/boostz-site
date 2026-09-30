// L'onglet « Boutiques » de la console (lot B, 30/09/2026) : les demandes que
// les membres envoient depuis l'app. « Une boutique manque à la liste ? »
// propose une boutique qu'OpenStreetMap ne connaît pas (une création) ;
// « C'est ta boutique ? » demande à gérer une fiche qui existe déjà (une
// affiliation). Aucune boutique n'est créée et aucun gérant n'est rattaché
// sans une décision prise ici, et chaque décision est inscrite au journal par
// le serveur (routes/adminVenues.js).
//
// DEUX NIVEAUX, pour ne jamais mélanger le travail à faire et la consultation :
// « À valider », les seules demandes en attente, et « Annuaire », toutes les
// boutiques, avec la fiche admin de chacune (partenaire, note interne,
// gérants, et nom et adresse de celles créées sur demande). L'état de
// l'accueil des échanges et sa pause n'y sont pas : c'est le lot C.
//
// BRANCHÉ COMME data.js : l'état vit ici. admin.js n'importe que le chargement
// (pour le badge de l'onglet), le rendu et le compteur, et passe au rendu ses
// propres outils : toast, ask, after, et le volet des écrans étroits. Tout
// texte venu de l'API passe par el() et textContent, jamais par du HTML.
import { call } from './api.js';
import { el, put, clear, dateFr, dateTime } from './chrome.js';

// Le nom des volets ouverts sur écran étroit (state.pane dans admin.js) : une
// demande, ou la fiche d'une boutique de l'Annuaire.
const PANE = 'venue-request';
const DIR_PANE = 'venue-dir';

// `type` : le sous-onglet ouvert, CREATE ou CLAIM. L'API rend les compteurs des
// deux et la liste d'un seul ; `listType` dit à quel sous-onglet appartient
// `list`, pour ne jamais dessiner des créations sous « Affiliations » le temps
// d'un rechargement. `drafts` : ce que l'admin a déjà corrigé, coché ou écrit
// dans une demande, par demande - un redessin de la console (un chargement qui
// aboutit pendant qu'il tape) ne doit pas l'effacer. `busy` : la demande dont
// la décision est en route, pour qu'un double clic n'en envoie pas deux.
// `absent` : l'API ne connaît pas encore la route (404). `seq` : le numéro du
// dernier chargement lancé. `dirVenueId` : la boutique ouverte dans l'Annuaire.
const vn = {
  level: 'pending', type: 'CREATE',
  counts: { CREATE: 0, CLAIM: 0 }, list: null, listType: null,
  selId: null, drafts: new Map(), busy: null,
  loading: false, error: null, absent: false, seq: 0,
  dirVenueId: null
};

// L'Annuaire. `q`, `partnerOnly` et `page` : la recherche en cours, que
// `venues` et `total` reflètent une fois chargés. `seq` écarte la réponse
// d'une recherche dépassée : on tape vite, et une réponse lente pour « Ly »
// ne doit pas écraser celle pour « Lyon ». `venue` : la fiche admin ouverte
// (GET /admin/venues/:id), avec son propre `venueSeq`. `drafts` : ce que
// l'admin a écrit dans la note, le champ « Affilier » et les champs d'une
// boutique créée sur demande, par boutique. `busy` : un geste sur une fiche
// est en route ; pour l'interrupteur partenaire, il porte la valeur visée,
// que la case montre en attendant la réponse. `view` : les morceaux de l'écran
// affiché, que la recherche repeint sur place - redessiner toute la console
// pendant la frappe ferait perdre le champ de recherche, et le clavier avec
// lui sur téléphone. `search` : ce champ, un seul nœud pour tous les rendus.
const PAGE = 50;
const dir = {
  q: '', partnerOnly: false, page: 1,
  venues: null, total: 0, loading: false, error: null, seq: 0, timer: null,
  venue: null, venueLoading: false, venueError: null, venueSeq: 0,
  drafts: new Map(), busy: false, view: null, search: null
};

// Le badge de l'onglet : créations et affiliations en attente, additionnées.
export const venuesPendingCount = () => (vn.counts.CREATE || 0) + (vn.counts.CLAIM || 0);

// Ne lève jamais, comme loadIdeas (admin.js) et loadData (data.js) : chargée
// avec tout le reste pour le badge, une panne ici ne doit pas coûter à la
// console son bandeau d'erreur général. Le type est lu au départ, et la liste
// reçue garde ce type (`listType`) : si l'admin change de sous-onglet pendant
// le chargement, le rendu qui suit voit que la liste n'est pas la sienne et
// lance le bon. `seq` jette la réponse d'un chargement quand un autre est
// parti après lui (une décision, « Réessayer ») : seule la dernière compte.
export async function loadVenues() {
  const seq = ++vn.seq;
  const type = vn.type;
  vn.loading = true;
  try {
    const data = await call('/admin/venues/requests?type=' + type);
    if (seq !== vn.seq) return;
    const counts = data.counts || {};
    vn.counts = { CREATE: counts.CREATE || 0, CLAIM: counts.CLAIM || 0 };
    vn.list = data.requests || [];
    vn.listType = type;
    vn.absent = false;
    vn.error = null;
  } catch (e) {
    if (seq !== vn.seq) return;
    // Une API plus ancienne que la console : l'onglet le dit calmement, comme
    // les idées et la vue Data, au lieu d'afficher une panne.
    if (e.status === 404) {
      vn.absent = true;
      vn.counts = { CREATE: 0, CLAIM: 0 };
      vn.list = [];
      vn.listType = type;
    } else {
      vn.error = e.message;
    }
  } finally {
    if (seq === vn.seq) vn.loading = false;
  }
}

// Même règle que sinceFr (admin.js).
function sinceFr(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return 'il y a ' + min + ' min';
  const h = Math.floor(min / 60);
  if (h < 24) return 'il y a ' + h + ' h';
  const d = Math.floor(h / 24);
  if (d === 1) return 'hier';
  if (d < 31) return 'il y a ' + d + ' j';
  return 'il y a ' + Math.floor(d / 30) + ' mois';
}

// Le département d'un code postal, aux mêmes règles que le serveur
// (departmentCodeFromPostalCode) : les deux premiers chiffres, et 2A ou 2B
// pour la Corse. C'est lui qui range la boutique dans l'app : l'admin doit le
// voir changer pendant qu'il corrige le code postal.
function departmentOf(postal) {
  const v = String(postal || '').trim();
  if (!/^\d{5}$/.test(v)) return null;
  const prefix = v.slice(0, 2);
  if (prefix === '20') return Number(v) < 20200 ? '2A' : '2B';
  return prefix;
}

const SOURCES = { osm: 'OpenStreetMap', manual: 'Créée sur demande' };
const pseudoOf = (r) => (r.requester && r.requester.pseudo) || 'Un membre';
const muted = (text) => el('span', { class: 'bz-muted', text });
// Un numéro à appeler, touchable sur téléphone. Le lien ne garde que les
// chiffres et le « + » : rien d'autre que « tel: » ne peut y entrer.
const telLink = (phone) => el('a', { href: 'tel:' + String(phone).replace(/[^\d+]/g, ''), text: phone });
const line = (label, value) => el('div', { class: 'adm-line' }, el('span', { class: 'bz-muted', text: label }), el('b', {}, value));

// L'adresse d'une boutique sans répéter la ville : une fiche créée sur demande
// la porte déjà dans `address` (« 12 rue X, 69003 Lyon »), une fiche OSM pas
// toujours.
function addressOf(v) {
  const town = [v.postal_code, v.city].filter(Boolean).join(' ');
  if (!v.address) return town;
  return v.city && v.address.includes(v.city) ? v.address : [v.address, town].filter(Boolean).join(', ');
}

const titleOf = (r) => (r.type === 'CREATE'
  ? (r.proposed && r.proposed.name) || '—'
  : r.venue ? r.venue.name : 'Boutique supprimée depuis la demande');
const typePill = (r) => el('span', { class: 'bz-pill is-grey', text: r.type === 'CREATE' ? 'Création' : 'Affiliation' });

// Ce que l'admin a déjà corrigé ou coché dans une demande. Au départ : les
// champs proposés, et « Affilier » coché si le membre dit y travailler - sauf
// s'il est mineur, parce que le serveur refuserait.
function draftOf(r) {
  let d = vn.drafts.get(r.id);
  if (!d) {
    const p = r.proposed || {};
    d = {
      name: p.name || '', street: p.street || '', postal_code: p.postal_code || '', city: p.city || '',
      phone: r.phone || '',
      affiliate: !!r.works_there && !!(r.requester && r.requester.is_adult),
      partner: false,
      reason: ''
    };
    vn.drafts.set(r.id, d);
  }
  return d;
}

// ---------- Décisions ----------
// Une seule à la fois. Après coup, la demande quitte la liste tout de suite
// (le serveur vient de la trancher), le volet se referme sur écran étroit, puis
// after() relit les demandes et le journal, redessine et affiche le toast.
async function decide(ctx, r, verb, body, message) {
  if (vn.busy) return;
  vn.busy = r.id;
  ctx.rerender();
  try {
    await call('/admin/venues/requests/' + encodeURIComponent(r.id) + '/' + verb, { method: 'POST', body });
  } catch (e) {
    vn.busy = null;
    // 409 : la demande a été tranchée entre-temps (un autre admin, un autre
    // onglet), sa boutique a disparu, ou le membre n'est pas majeur. 404 : elle
    // n'existe plus. Dans ces cas la file affichée est fausse : on la relit.
    // Sinon (un champ refusé, le réseau), rien ne bouge et la saisie reste.
    if (e.status === 409 || e.status === 404) await ctx.after(null, loadVenues);
    else ctx.rerender();
    ctx.toast(e.message, 'err');
    return;
  }
  vn.busy = null;
  vn.list = (vn.list || []).filter((x) => x.id !== r.id);
  vn.counts[r.type] = Math.max(0, (vn.counts[r.type] || 0) - 1);
  vn.drafts.delete(r.id);
  if (vn.selId === r.id) vn.selId = null;
  if (ctx.narrow && ctx.pane === PANE) ctx.closePane();
  await ctx.after(message, loadVenues);
}

function approve(ctx, r) {
  const d = draftOf(r);
  if (r.type === 'CREATE') {
    return decide(ctx, r, 'approve', {
      name: d.name.trim(),
      street: d.street.trim(),
      postal_code: d.postal_code.trim(),
      city: d.city.trim(),
      // Vide pour retirer le numéro proposé, jamais null : le serveur lit null
      // comme « garder celui de la demande ».
      phone: d.phone.trim(),
      affiliate: !!r.requester.is_adult && d.affiliate,
      partner: d.partner
    }, 'Création validée');
  }
  return decide(ctx, r, 'approve', { partner: !!r.venue && !r.venue.is_partner && d.partner }, 'Affiliation validée');
}

// Le motif est écrit dans la fiche de la demande (300 caractères, comme le
// serveur) ; la boîte de confirmation le relit à l'admin avant l'envoi.
async function reject(ctx, r) {
  if (vn.busy) return;
  const reason = draftOf(r).reason.trim();
  const ok = await ctx.ask({
    title: 'Refuser la demande de ' + pseudoOf(r),
    text: reason
      ? 'Le membre recevra ce motif : « ' + reason + ' »'
      : 'Sans motif, le membre lira seulement : « L’équipe n’a pas pu valider ta demande. »',
    confirmLabel: 'Refuser', tone: 'red'
  });
  if (!ok) return;
  return decide(ctx, r, 'reject', { reason }, 'Demande refusée');
}

// Ouvrir l'Annuaire sur une boutique, depuis une demande (« Voir dans
// l'annuaire », une boutique proche). Sur écran étroit, le volet de la demande
// laisse la place à celui de la fiche ; son retour mène à la liste de
// l'Annuaire.
function openDirectory(ctx, venueId) {
  vn.level = 'directory';
  if (!venueId) return ctx.rerender();
  pickVenue(venueId);
  ctx.openPane(DIR_PANE);
  ctx.rerender();
  ctx.paneTop();
}

function openRequest(ctx, id) {
  vn.selId = id;
  ctx.openPane(PANE);
  ctx.rerender();
  ctx.paneTop();
}

// ---------- Morceaux communs aux deux fiches ----------
function checkbox(d, key, label, disabled = false) {
  const box = el('input', { type: 'checkbox', checked: !!d[key], disabled });
  box.addEventListener('change', () => { d[key] = box.checked; });
  // La marge négative aligne la case sur les champs sans perdre la zone de
  // survol de .bz-check.
  return el('label', { class: 'bz-check', style: disabled ? { margin: '0 -10px', cursor: 'not-allowed', color: 'var(--text-disabled)' } : { margin: '0 -10px' } },
    box, el('span', { text: label }));
}

function reasonField(d) {
  const box = el('textarea', { id: 'vn-reason', class: 'bz-input', rows: '3', maxlength: '300', placeholder: 'Ex. : Cette boutique est déjà sur Boostz, sous un autre nom.' });
  box.value = d.reason;
  box.addEventListener('input', () => { d.reason = box.value; });
  return el('div', { class: 'bz-field', style: { marginTop: '14px' } },
    el('label', { class: 'bz-label', for: 'vn-reason' }, 'Motif de refus · ', el('small', { text: 'Envoyé au membre' })),
    box,
    el('span', { class: 'bz-tiny', text: '300 caractères au plus. Vide, le membre lit « L’équipe n’a pas pu valider ta demande. »' }));
}

// `approveLabel` null : seul « Refuser » est proposé. `why` : pourquoi valider
// est grisé, écrit en toutes lettres sous les boutons (une infobulle ne
// s'affiche pas au doigt). Pendant qu'une décision est en route, TOUS les
// boutons sont grisés, pas seulement ceux de sa demande : decide() et reject()
// ignoreraient le clic, et un bouton qui ne répond pas sans le montrer laisse
// croire qu'une seconde décision est partie.
function decisionButtons(ctx, r, approveLabel, why = null) {
  const busy = !!vn.busy;
  return [
    el('div', { class: 'bz-row adm-actions', style: { marginTop: '14px', gap: '8px' } },
      el('button', { class: 'bz-btn is-red', type: 'button', text: 'Refuser', disabled: busy, onclick: () => reject(ctx, r) }),
      approveLabel ? el('button', { class: 'bz-btn is-green', type: 'button', text: approveLabel, disabled: busy || !!why, title: why, onclick: () => approve(ctx, r) }) : null),
    why && approveLabel ? el('p', { class: 'bz-tiny', style: { margin: '8px 0 0' }, text: why }) : null
  ];
}

function detailHead(ctx, r) {
  if (ctx.phone) return null;
  return el('div', { class: 'bz-row' },
    el('b', { style: { fontFamily: 'var(--font-display)', fontSize: '15px', flex: '1', minWidth: '0', overflowWrap: 'anywhere' }, text: titleOf(r) }),
    typePill(r));
}

// ---------- Fiche d'une création ----------
function createDetail(ctx, r) {
  const d = draftOf(r);
  const p = r.proposed || {};
  const pseudo = pseudoOf(r);
  const adult = !!r.requester.is_adult;

  const input = (key, label, attrs, extra = null) => {
    const id = 'vn-' + key;
    const node = el('input', Object.assign({ id, class: 'bz-input', autocomplete: 'off' }, attrs));
    node.value = d[key];
    node.addEventListener('input', () => { d[key] = node.value; });
    return { node, field: el('div', { class: 'bz-field' }, el('label', { class: 'bz-label', for: id, text: label }), node, extra) };
  };

  // Le département de l'API d'abord, puis celui de la saisie, recalculé à
  // chaque chiffre.
  const dept = el('span', { class: 'bz-tiny' });
  const showDept = () => {
    const code = d.postal_code.trim() === p.postal_code && p.department ? p.department : departmentOf(d.postal_code);
    dept.textContent = code ? 'Département ' + code : 'Département : 5 chiffres attendus';
  };
  showDept();

  const name = input('name', 'Nom', { maxlength: '120' });
  const street = input('street', 'Numéro et rue', { maxlength: '160' });
  const postal = input('postal_code', 'Code postal', { maxlength: '5', inputmode: 'numeric' }, dept);
  const city = input('city', 'Ville', { maxlength: '80' });
  const phone = input('phone', 'Téléphone', { type: 'tel', maxlength: '30', placeholder: 'Aucun : la fiche n’aura pas de numéro' });
  postal.node.addEventListener('input', showDept);

  const similar = Array.isArray(r.similar) ? r.similar : [];
  const similarBox = similar.length ? el('div', { class: 'adm-ai-note', style: { marginTop: '14px' } },
    el('span', { class: 'bz-eyebrow', text: similar.length > 1 ? similar.length + ' boutiques proches' : 'Une boutique proche' }),
    el('p', { text: 'Des boutiques proches existent déjà. Si c’est la même, refuse et rattache plutôt le membre à cette fiche depuis l’Annuaire.' }),
    el('div', { style: { marginTop: '8px', border: '1px solid rgba(255,255,255,.08)', borderRadius: '10px', overflow: 'hidden', background: 'rgba(8,6,14,.45)' } },
      similar.map((v) => el('button', { class: 'adm-item', type: 'button', title: 'Ouvrir cette boutique dans l’Annuaire', onclick: () => openDirectory(ctx, v.id) },
        el('b', { style: { display: 'block', fontFamily: 'var(--font-ui)', fontSize: '12.5px', overflowWrap: 'anywhere' }, text: v.name || '—' }),
        el('div', { class: 'bz-small bz-muted', style: { marginTop: '3px' }, text: addressOf(v) || '—' }))))
  ) : null;

  return [
    detailHead(ctx, r),
    el('div', { class: 'adm-quote' },
      el('span', { class: 'bz-eyebrow', text: 'Demande' }),
      el('div', { class: 'bz-stack', style: { gap: '6px', marginTop: '8px' } },
        line('Membre', [pseudo, r.requester.email].filter(Boolean).join(' · ')),
        line('Téléphone', r.phone ? telLink(r.phone) : muted('aucun')),
        line('Reçue le', dateTime(r.created_date) + ' · ' + sinceFr(r.created_date)),
        line('Y travaille', r.works_there ? 'Oui, dit y travailler' : 'Non')),
      r.message ? el('p', { text: r.message }) : null),
    el('span', { class: 'bz-eyebrow', style: { display: 'block', marginTop: '16px' }, text: 'Fiche proposée · modifiable avant publication' }),
    el('div', { class: 'bz-stack', style: { gap: '10px', marginTop: '8px' } },
      name.field,
      street.field,
      el('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: '10px', alignItems: 'start' } }, postal.field, city.field),
      phone.field),
    similarBox,
    el('div', { style: { marginTop: '12px' } },
      checkbox(d, 'affiliate', 'Affilier ' + pseudo + ' à la boutique', !adult),
      adult ? null : el('p', { class: 'bz-tiny', style: { margin: '0 0 6px 26px' }, text: pseudo + ' n’est pas majeur : il ne peut pas gérer la boutique.' }),
      checkbox(d, 'partner', 'Partenaire dès maintenant')),
    reasonField(d),
    ...decisionButtons(ctx, r, 'Valider la création')
  ];
}

// ---------- Fiche d'une affiliation ----------
function claimDetail(ctx, r) {
  const d = draftOf(r);
  const v = r.venue;
  const pseudo = pseudoOf(r);

  const who = el('div', { class: 'adm-quote' },
    el('span', { class: 'bz-eyebrow', text: 'Qui demande' }),
    el('div', { class: 'bz-stack', style: { gap: '6px', marginTop: '8px' } },
      line('Membre', [pseudo, r.requester.email].filter(Boolean).join(' · ')),
      line('Son numéro', r.phone ? telLink(r.phone) : muted('aucun')),
      line('Reçue le', dateTime(r.created_date) + ' · ' + sinceFr(r.created_date))),
    el('p', { class: r.message ? null : 'bz-muted', text: r.message || 'Pas de message.' }));

  // La boutique a été supprimée depuis : il n'y a plus rien à gérer, seul le
  // refus reste possible (le serveur répondrait 409 à une validation).
  if (!v) {
    return [
      detailHead(ctx, r),
      who,
      el('div', { class: 'bz-msg is-note', style: { marginTop: '14px' }, text: 'Boutique supprimée depuis la demande' }),
      reasonField(d),
      ...decisionButtons(ctx, r, null)
    ];
  }

  const managers = Array.isArray(v.managers) ? v.managers : [];
  // Le serveur refuse un gérant mineur : le bouton le dit avant le clic.
  const why = r.requester.is_adult ? null : pseudo + ' n’est pas majeur : il ne peut pas gérer la boutique.';

  return [
    detailHead(ctx, r),
    who,
    el('div', { class: 'adm-quote' },
      el('span', { class: 'bz-eyebrow', text: 'Numéro public de la boutique, à appeler avant de valider' }),
      el('p', {}, v.phone ? telLink(v.phone) : muted('aucun numéro connu'))),
    el('div', { class: 'adm-quote' },
      el('span', { class: 'bz-eyebrow', text: 'État actuel de la boutique' }),
      el('div', { class: 'bz-stack', style: { gap: '6px', marginTop: '8px' } },
        line('Adresse', addressOf(v) || '—'),
        line('Partenaire', v.is_partner
          ? el('span', {}, el('span', { class: 'bz-pill is-violet', text: 'Partenaire' }), v.partner_since ? ' depuis le ' + dateFr(v.partner_since) : null)
          : muted('Non')),
        line('Gérants', managers.length ? managers.map((m) => m.pseudo).join(', ') : muted('Aucun')),
        line('Source', SOURCES[v.source] || v.source || '—')),
      el('div', { class: 'bz-row', style: { marginTop: '10px' } },
        el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Voir dans l’annuaire', onclick: () => openDirectory(ctx, v.id) }))),
    v.is_partner ? null : el('div', { style: { marginTop: '12px' } }, checkbox(d, 'partner', 'Rendre aussi la boutique partenaire')),
    reasonField(d),
    ...decisionButtons(ctx, r, 'Valider l’affiliation', why)
  ];
}

// ---------- Liste ----------
function requestRow(ctx, x, current) {
  const create = x.type === 'CREATE';
  const p = x.proposed || {};
  const v = x.venue;
  const place = create ? [p.city, p.department].filter(Boolean).join(' · ') : (v ? v.city || '' : '');
  const who = create
    ? 'par ' + pseudoOf(x) + ' · ' + sinceFr(x.created_date)
    : pseudoOf(x) + ' demande à la gérer · ' + sinceFr(x.created_date);
  const titleStyle = { display: 'block', fontFamily: 'var(--font-ui)', fontSize: '12.5px', overflowWrap: 'anywhere' };
  if (!create && !v) titleStyle.color = 'var(--text-muted)';
  return el('button', {
    class: 'adm-item', type: 'button', 'aria-current': current ? 'true' : 'false',
    onclick: () => openRequest(ctx, x.id)
  },
  el('b', { style: titleStyle, text: titleOf(x) }),
  place ? el('div', { class: 'bz-small bz-muted', style: { marginTop: '4px' }, text: place }) : null,
  el('div', { class: 'bz-small bz-muted', style: { marginTop: '3px' }, text: who }));
}

// ---------- Rendu ----------
// ctx : { rerender, toast, ask, after, icon, narrow, phone, pane, openPane,
// closePane, paneTop, backButton, paneHead }, fournis par admin.js au moment
// du rendu.
//
// Un chargement de la file ne redessine que si « À valider » est encore à
// l'écran. Sur l'Annuaire, ce redessin détacherait le champ de recherche
// pendant que l'admin y tape, et fermerait le clavier du téléphone.
const rerenderPending = (ctx) => () => { if (vn.level === 'pending') ctx.rerender(); };

export function renderVenues(ctx) {
  const narrow = ctx.narrow;
  const phone = ctx.phone;
  const refresh = () => loadVenues().then(rerenderPending(ctx));
  // Première ouverture, ou sous-onglet changé : on charge sa liste.
  if (!vn.absent && !vn.error && !vn.loading && (vn.list === null || vn.listType !== vn.type)) refresh();

  if (vn.absent) {
    return el('section', { class: 'bz-card adm-agent-empty', style: { marginTop: '16px' } },
      el('span', { class: 'adm-agent-empty-icon' }, ctx.icon('venues', 22)),
      el('b', { text: 'Boutiques : pas encore branché côté serveur' }),
      el('p', { class: 'bz-small bz-muted', text: 'Ce serveur ne connaît pas encore /admin/venues. Les demandes des membres apparaîtront ici dès que l’API qui les reçoit sera en ligne.' })
    );
  }

  const tabBtn = (selected, label, count, onclick) => el('button', {
    class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(selected), onclick
  }, label, count === null ? null : el('span', { class: 'bz-count', text: String(count) }));

  const levels = el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Niveaux de l’onglet Boutiques', style: { marginTop: '16px' } },
    tabBtn(vn.level === 'pending', 'À valider', venuesPendingCount(), () => { if (vn.level === 'pending') return; vn.level = 'pending'; ctx.rerender(); }),
    // L'Annuaire se rouvre sur la dernière boutique consultée.
    tabBtn(vn.level === 'directory', 'Annuaire', null, () => { if (vn.level === 'directory') return; vn.level = 'directory'; ctx.rerender(); }));

  if (vn.level === 'directory') return renderDirectory(ctx, levels);

  const types = el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Type de demande', style: { marginTop: '10px' } },
    ['CREATE', 'CLAIM'].map((t) => tabBtn(vn.type === t, t === 'CREATE' ? 'Créations' : 'Affiliations', vn.counts[t] || 0, () => {
      if (vn.type === t) return;
      vn.type = t;
      vn.selId = null;
      vn.error = null;
      ctx.rerender();
    })));

  const list = vn.listType === vn.type ? vn.list : null;
  // « Réessayer » relance le chargement lui-même : le rendu ne le relance que
  // pour une liste absente ou d'un autre sous-onglet, et le bandeau « Mise à
  // jour impossible » s'affiche justement au-dessus d'une liste déjà là.
  const retry = el('button', {
    class: 'bz-btn is-sm', type: 'button', text: 'Réessayer',
    onclick: () => { vn.error = null; const p = loadVenues(); ctx.rerender(); p.then(rerenderPending(ctx)); }
  });

  if (!list && vn.error) {
    return el('div', {}, levels, types,
      el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '12px' } },
        el('span', { text: 'Boutiques indisponibles : ' + vn.error + ' ' }), retry));
  }
  if (!list) {
    return el('div', {}, levels, types, el('div', { class: 'bz-skeleton', style: { height: '140px', marginTop: '12px' } }));
  }

  // Les plus anciennes en premier, dans l'ordre de l'API. Sur grand écran, la
  // plus ancienne est ouverte d'office : décider l'une amène la suivante.
  const sel = list.find((x) => x.id === vn.selId) || (!narrow ? list[0] : null) || null;
  const showList = !narrow || ctx.pane !== PANE;
  const showDetail = narrow ? ctx.pane === PANE : !!sel;

  const rows = el('div', { class: 'adm-list' }, list.map((x) => requestRow(ctx, x, !!sel && x.id === sel.id)));
  if (!list.length) {
    rows.append(el('p', { class: 'bz-small bz-muted', style: { padding: '16px', margin: '0' },
      text: vn.type === 'CREATE' ? 'Aucune création en attente.' : 'Aucune affiliation en attente.' }));
  }

  let detail = null;
  if (showDetail) {
    detail = el('div', { class: 'bz-card adm-detail' });
    if (sel) put(detail, sel.type === 'CREATE' ? createDetail(ctx, sel) : claimDetail(ctx, sel));
    else detail.append(el('p', { class: 'bz-small bz-muted', style: { margin: '0' }, text: 'Cette demande n’est plus en attente.' }));
  }

  return el('div', {},
    showList ? levels : null,
    showList ? types : null,
    showList && vn.error ? el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '12px' } },
      el('span', { text: 'Mise à jour impossible : ' + vn.error + ' ' }), retry) : null,
    el('div', { class: 'adm-split', style: { marginTop: '12px' } },
      showList ? el('section', { class: 'bz-card adm-list-card' },
        el('div', { class: 'adm-list-head', text: (vn.type === 'CREATE' ? 'Créations' : 'Affiliations') + ' · ' + list.length + (vn.loading ? ' · mise à jour…' : '') }),
        rows) : null,
      showDetail && narrow ? (phone && sel
        ? ctx.paneHead('Toutes les demandes', titleOf(sel), sel.type === 'CREATE' ? 'Création · par ' + pseudoOf(sel) : 'Affiliation · ' + pseudoOf(sel), typePill(sel))
        : ctx.backButton('Toutes les demandes')) : null,
      detail
    )
  );
}

// ---------- Annuaire ----------
// Toutes les boutiques, 50 par page, cherchées par nom, ville ou département
// (GET /admin/venues), et la fiche admin de celle qu'on ouvre
// (GET /admin/venues/:id). Chaque geste de la fiche est inscrit au journal
// par le serveur.
const FIELD_KEYS = ['name', 'address', 'postal_code', 'city', 'phone'];
const venuePath = (v) => '/admin/venues/' + encodeURIComponent(v.id);
const plural = (n, one, many) => n.toLocaleString('fr-FR') + ' ' + (n > 1 ? many : one);

// Ne lève jamais. `page` : la page voulue, qui ne devient `dir.page` que si
// son chargement aboutit. Un échec reste dans `error`, que la liste affiche
// avec « Réessayer » - sauf avec `quiet`, pour un simple changement de page :
// la page et les lignes d'avant restent alors à l'écran, et l'appelant
// affiche l'échec en toast. Rend le message d'erreur, ou null.
async function loadDirectory({ page = dir.page, quiet = false } = {}) {
  const seq = ++dir.seq;
  dir.loading = true;
  const q = dir.q.trim();
  const params = [q ? 'q=' + encodeURIComponent(q) : null, dir.partnerOnly ? 'partner=1' : null, page > 1 ? 'page=' + page : null].filter(Boolean);
  try {
    const data = await call('/admin/venues' + (params.length ? '?' + params.join('&') : ''));
    if (seq !== dir.seq) return null;
    const venues = data.venues || [];
    const total = data.total || 0;
    // Le serveur borne la page (1 à 1000), et la sienne fait foi.
    const got = data.page || page;
    // Mais il ne la borne pas à la dernière : quand un geste ou un filtre a fait
    // fondre le total, la page courante peut revenir vide, sans rien pour en
    // sortir. On charge alors la dernière qui existe, ou la première. La cible
    // descend à chaque tour : la boucle s'arrête forcément.
    if (!venues.length && got > 1) {
      return await loadDirectory({ page: Math.min(got - 1, Math.max(1, Math.ceil(total / PAGE))), quiet });
    }
    dir.venues = venues;
    dir.total = total;
    dir.page = got;
    dir.error = null;
    return null;
  } catch (e) {
    if (seq !== dir.seq) return null;
    if (!quiet) dir.error = e.message;
    return e.message;
  } finally {
    if (seq === dir.seq) dir.loading = false;
  }
}

// Ne lève jamais non plus. Une boutique supprimée (404) ne laisse pas sa
// dernière fiche à l'écran.
async function loadDirVenue(id) {
  const seq = ++dir.venueSeq;
  dir.venueLoading = true;
  try {
    const v = await call('/admin/venues/' + encodeURIComponent(id));
    if (seq !== dir.venueSeq) return;
    dir.venue = v;
    dir.venueError = null;
  } catch (e) {
    if (seq !== dir.venueSeq) return;
    if (e.status === 404) {
      if (dir.venue && dir.venue.id === id) dir.venue = null;
      dir.venueError = 'Cette boutique n’existe plus.';
    } else {
      dir.venueError = e.message;
    }
  } finally {
    if (seq === dir.venueSeq) dir.venueLoading = false;
  }
}

const currentVenue = () => (dir.venue && dir.venue.id === vn.dirVenueId ? dir.venue : null);

// La fiche choisie se charge d'elle-même, une fois ; une erreur attend
// « Réessayer ». Si l'admin en a choisi une autre pendant le chargement, le
// repeint qui suit voit que la fiche reçue n'est pas la bonne et relance.
function ensureVenue() {
  if (vn.dirVenueId && !currentVenue() && !dir.venueLoading && !dir.venueError) loadDirVenue(vn.dirVenueId).then(repaintDetail);
}

function pickVenue(id) {
  if (vn.dirVenueId === id) return;
  vn.dirVenueId = id;
  dir.venueError = null;
}

function selectVenue(ctx, id) {
  pickVenue(id);
  ctx.openPane(DIR_PANE);
  ctx.rerender();
  ctx.paneTop();
}

// Repeindre sur place la liste, ou la fiche, de l'écran affiché. Rien quand
// elles ne sont pas à l'écran (volet ouvert, autre niveau, autre onglet) : le
// prochain rendu les peindra depuis l'état. Sur écran étroit, la fiche arrivée
// redessine tout, parce que l'en-tête du volet porte son nom.
function repaintList() {
  const view = dir.view;
  if (view && view.rows.isConnected) paintList(view);
}
function repaintDetail() {
  const view = dir.view;
  if (!view || !view.detail || !view.detail.isConnected) return;
  if (view.ctx.narrow) view.ctx.rerender();
  else paintDetail(view);
}

// Recharger la liste, en montrant « mise à jour… » tout de suite. Rend ce que
// rend loadDirectory : le message d'un échec, ou null.
function refreshList(opts) {
  const p = loadDirectory(opts).then((err) => { repaintList(); return err; });
  repaintList();
  return p;
}

// Un changement de page raté ne change rien à l'écran : l'ancienne page reste,
// et l'échec passe en toast.
async function goPage(view, page) {
  const err = await refreshList({ page, quiet: true });
  if (err) return view.ctx.toast(err, 'err');
  view.rows.scrollTop = 0;
  // Sur écran étroit la liste ne défile pas seule : on remonte à son haut,
  // sous la barre du site, si « Suivant » l'a laissé hors de l'écran.
  if (!view.card.isConnected || typeof view.card.getBoundingClientRect !== 'function') return;
  const top = view.card.getBoundingClientRect().top;
  if (top < 0) window.scrollTo({ top: Math.max(0, top + window.scrollY - 72), behavior: 'instant' });
}

// Ce que l'admin a écrit dans une fiche : la note, le champ « Affilier » et,
// pour une boutique créée sur demande, ses champs. Après un enregistrement,
// seule la partie enregistrée repart de ce que le serveur a rendu.
function dirDraftOf(v) {
  let d = dir.drafts.get(v.id);
  if (!d) {
    d = {};
    resetDraft(d, v, ['note', 'identifier', 'fields']);
    dir.drafts.set(v.id, d);
  }
  return d;
}
function resetDraft(d, v, parts) {
  if (parts.includes('note')) d.note = (v.profile && v.profile.partner_note) || '';
  if (parts.includes('identifier')) d.identifier = '';
  if (parts.includes('fields')) for (const k of FIELD_KEYS) d[k] = v[k] || '';
}

// Un geste sur la fiche ouverte, un seul à la fois. Toutes ces routes rendent
// la fiche à jour : elle remplace l'ancienne, puis after() relit la liste (les
// pastilles ont pu changer) et le journal, redessine et affiche le toast.
async function venueGesture(ctx, v, send, { message, reset = [], busy = true }) {
  if (dir.busy) return;
  dir.busy = busy;
  ctx.rerender();
  let fresh;
  try {
    fresh = await send();
  } catch (e) {
    dir.busy = false;
    // 404 : la boutique, le compte ou le gérant n'existe pas ou plus. 409 : le
    // geste est refusé (boutique OpenStreetMap, compte mineur, banni, déjà
    // gérant, pseudo porté par plusieurs comptes). La fiche affichée peut être
    // fausse : on la relit, avec la liste. Un 400 (un champ refusé) ne change
    // rien : la saisie reste, pour être corrigée.
    if (e.status === 404 || e.status === 409) await ctx.after(null, loadDirectory, () => loadDirVenue(v.id));
    else ctx.rerender();
    ctx.toast(e.message, 'err');
    return;
  }
  dir.busy = false;
  if (fresh && fresh.id) {
    dir.venue = fresh;
    resetDraft(dirDraftOf(fresh), fresh, reset);
  }
  await ctx.after(typeof message === 'function' ? message(fresh || v) : message, loadDirectory);
}

function setPartner(ctx, v, next) {
  return venueGesture(ctx, v, () => call(venuePath(v), { method: 'PATCH', body: { partner: next } }), {
    message: next ? v.name + ' est partenaire.' : v.name + ' n’est plus partenaire.',
    busy: { partner: next }
  });
}

function saveNote(ctx, v) {
  const note = dirDraftOf(v).note.trim();
  return venueGesture(ctx, v, () => call(venuePath(v), { method: 'PATCH', body: { partner_note: note } }), {
    message: (f) => (f.profile && f.profile.partner_note ? 'Note enregistrée.' : 'Note effacée.'),
    reset: ['note']
  });
}

// N'envoie que les champs changés : le serveur inscrit au journal ceux qu'il
// reçoit, et « nom, adresse, code postal, ville, téléphone » pour une faute
// de frappe dans le nom mentirait. Un téléphone vidé part vide, ce qui
// l'efface.
function saveFields(ctx, v) {
  const d = dirDraftOf(v);
  const body = {};
  for (const k of FIELD_KEYS) {
    const next = d[k].trim();
    if (next !== (v[k] || '')) body[k] = next;
  }
  if (!Object.keys(body).length) return ctx.toast('Rien n’a changé.', 'note');
  return venueGesture(ctx, v, () => call(venuePath(v), { method: 'PATCH', body }), { message: 'Fiche enregistrée.', reset: ['fields'] });
}

function addManager(ctx, v) {
  const identifier = dirDraftOf(v).identifier.trim();
  if (!identifier) return ctx.toast('Donne un pseudo ou un e-mail.', 'err');
  const before = new Set((v.managers || []).map((m) => m.user_id));
  return venueGesture(ctx, v, () => call(venuePath(v) + '/managers', { method: 'POST', body: { identifier } }), {
    message: (f) => {
      const added = (f.managers || []).find((m) => !before.has(m.user_id));
      return (added ? added.pseudo : identifier) + ' gère maintenant ' + f.name + '.';
    },
    reset: ['identifier']
  });
}

async function removeManager(ctx, v, m) {
  if (dir.busy) return;
  const ok = await ctx.ask({
    title: 'Retirer ' + (m.pseudo || 'ce gérant') + ' des gérants',
    // Le serveur ne prévient pas le gérant retiré (routes/adminVenues.js).
    text: (m.pseudo || 'Ce compte') + ' ne pourra plus tenir la fiche de ' + v.name + ' depuis l’appli. Il n’en est pas prévenu.',
    confirmLabel: 'Retirer', tone: 'red'
  });
  if (!ok) return;
  return venueGesture(ctx, v, () => call(venuePath(v) + '/managers/' + encodeURIComponent(m.user_id), { method: 'DELETE' }), {
    message: (m.pseudo || 'Ce compte') + ' ne gère plus ' + v.name + '.'
  });
}

// Une demande en attente sur la boutique ouverte : « À valider », dans son
// sous-onglet, sur elle. La file est relue, la demande pouvant être plus
// récente que la liste chargée.
function openPendingRequest(ctx, r) {
  vn.level = 'pending';
  vn.type = r.type === 'CREATE' ? 'CREATE' : 'CLAIM';
  vn.selId = r.id;
  vn.error = null;
  const p = loadVenues();
  ctx.openPane(PANE);
  ctx.rerender();
  ctx.paneTop();
  p.then(rerenderPending(ctx));
}

// Les pastilles d'une ligne de la liste. La fiche n'a pas les mêmes champs :
// ficheFlags les en déduit.
function venuePills(v) {
  return [
    v.is_partner ? el('span', { class: 'bz-pill is-violet', text: 'Partenaire' }) : null,
    v.is_managed ? el('span', { class: 'bz-pill is-green', text: 'Gérée' }) : null,
    v.source === 'manual' ? el('span', { class: 'bz-pill is-amber', text: 'Hors OSM' }) : null
  ].filter(Boolean);
}
const ficheFlags = (v) => ({ is_partner: !!(v.profile && v.profile.partner_since), is_managed: (v.managers || []).length > 0, source: v.source });

function venueRow(ctx, v) {
  const place = [v.city, v.department].filter(Boolean).join(' · ');
  const pills = venuePills(v);
  return el('button', {
    class: 'adm-item', type: 'button', 'aria-current': v.id === vn.dirVenueId ? 'true' : 'false',
    onclick: () => selectVenue(ctx, v.id)
  },
  el('div', { class: 'bz-row', style: { gap: '8px', flexWrap: 'nowrap', alignItems: 'flex-start' } },
    el('b', { style: { fontFamily: 'var(--font-ui)', fontSize: '12.5px', flex: '1', minWidth: '0', overflowWrap: 'anywhere' }, text: v.name || '—' }),
    pills.length ? el('span', { class: 'bz-row', style: { gap: '4px', justifyContent: 'flex-end', maxWidth: '55%' } }, pills) : null),
  place ? el('div', { class: 'bz-small bz-muted', style: { marginTop: '4px' }, text: place }) : null);
}

function paintList(view) {
  const { ctx, head, rows, pager } = view;
  head.textContent = (dir.venues ? plural(dir.total, 'boutique', 'boutiques') : 'Boutiques') + (dir.loading ? ' · mise à jour…' : '');
  clear(rows);
  clear(pager);
  // Pas l'attribut hidden : un display en ligne l'emporterait sur lui.
  pager.style.display = 'none';
  const retry = () => el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Réessayer', onclick: () => { dir.error = null; refreshList(); } });
  if (!dir.venues) {
    rows.append(dir.error
      ? el('div', { class: 'bz-msg is-err', role: 'alert', style: { margin: '14px' } }, el('span', { text: 'Annuaire indisponible : ' + dir.error + ' ' }), retry())
      : el('div', { class: 'bz-skeleton', style: { height: '120px', margin: '14px' } }));
    return;
  }
  if (dir.error) {
    rows.append(el('div', { class: 'bz-msg is-err', role: 'alert', style: { margin: '10px 14px' } }, el('span', { text: 'Mise à jour impossible : ' + dir.error + ' ' }), retry()));
  }
  for (const v of dir.venues) rows.append(venueRow(ctx, v));
  if (!dir.venues.length) {
    rows.append(el('p', { class: 'bz-small bz-muted', style: { padding: '16px', margin: '0' },
      text: dir.q.trim() || dir.partnerOnly ? 'Aucune boutique ne correspond.' : 'Aucune boutique.' }));
  }
  const pages = Math.max(1, Math.ceil(dir.total / PAGE));
  // Toujours là au-delà de la page 1, même si le total a fondu entre-temps :
  // « Précédent » reste un moyen d'en revenir.
  if (pages > 1 || dir.page > 1) {
    pager.style.display = 'flex';
    put(pager,
      el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Précédent', disabled: dir.page <= 1 || dir.loading, onclick: () => goPage(view, dir.page - 1) }),
      el('span', { class: 'bz-tiny', text: 'Page ' + dir.page + ' / ' + pages }),
      el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Suivant', disabled: dir.page >= pages || dir.loading, onclick: () => goPage(view, dir.page + 1) }));
  }
}

function paintDetail(view) {
  ensureVenue();
  const box = clear(view.detail);
  const v = currentVenue();
  if (!vn.dirVenueId) {
    box.append(el('p', { class: 'bz-small bz-muted', style: { margin: '0' }, text: 'Choisis une boutique pour ouvrir sa fiche : partenaire, note interne, gérants.' }));
  } else if (v) {
    put(box, venueFiche(view.ctx, v));
  } else if (dir.venueError) {
    box.append(el('div', { class: 'bz-msg is-err', role: 'alert' },
      el('span', { text: dir.venueError + ' ' }),
      el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Réessayer', onclick: () => { dir.venueError = null; paintDetail(view); } })));
  } else {
    box.append(el('div', { class: 'bz-skeleton', style: { height: '160px' } }));
  }
}

// Un champ du brouillon d'une fiche, gardé à chaque frappe.
function draftInput(d, key, label, attrs, extra = null) {
  const id = 'vd-' + key;
  const node = el('input', Object.assign({ id, class: 'bz-input', autocomplete: 'off' }, attrs));
  node.value = d[key];
  node.addEventListener('input', () => { d[key] = node.value; });
  return { node, field: el('div', { class: 'bz-field' }, el('label', { class: 'bz-label', for: id, text: label }), node, extra) };
}

// La fiche admin d'une boutique.
function venueFiche(ctx, v) {
  const d = dirDraftOf(v);
  const flags = ficheFlags(v);
  const busy = !!dir.busy;
  const manual = v.source === 'manual';
  const managers = v.managers || [];
  const pending = v.pending_requests || [];

  // L'identifiant OSM mène à la carte ; il n'est accepté que sous sa forme
  // « node/123 », et un site web que s'il commence par http(s) : aucun autre
  // schéma ne peut entrer dans un lien.
  const osmLink = !manual && /^(node|way|relation)\/\d+$/.test(v.osm_id || '')
    ? el('a', { href: 'https://www.openstreetmap.org/' + v.osm_id, target: '_blank', rel: 'noopener noreferrer', text: v.osm_id })
    : null;
  const source = manual ? 'Créée sur demande' : el('span', {}, 'OpenStreetMap', osmLink ? ' · ' : null, osmLink);
  const site = v.website && /^https?:\/\//i.test(v.website)
    ? el('a', { href: v.website, target: '_blank', rel: 'noopener noreferrer', text: v.website })
    : v.website || null;
  const pills = venuePills(flags);
  // Le numéro que voient les membres : celui que le gérant a saisi dans « Ma
  // fiche », sinon celui de la fiche d'origine (même règle que l'app,
  // lib/venueApi.js). PATCH, lui, n'écrit que celui de la fiche d'origine.
  const managerPhone = (v.profile && v.profile.phone) || null;
  const shownPhone = managerPhone || v.phone;

  // Le statut partenaire. Le retirer efface sa date côté serveur : on le
  // confirme. Annulé, la case revient cochée.
  // Pendant sa requête, la case montre la valeur visée, grisée : reprise de
  // l'ancienne fiche, elle semblerait revenir en arrière, comme un refus.
  const shownPartner = dir.busy && typeof dir.busy.partner === 'boolean' ? dir.busy.partner : flags.is_partner;
  const partnerBox = el('input', { type: 'checkbox', role: 'switch', checked: shownPartner, disabled: busy });
  partnerBox.addEventListener('change', async () => {
    const next = partnerBox.checked;
    if (!next) {
      const ok = await ctx.ask({
        title: 'Retirer le statut partenaire',
        text: v.name + ' perd son badge PARTENAIRE dans l’appli, et sa date de partenariat est effacée.',
        confirmLabel: 'Retirer', tone: 'red'
      });
      if (!ok) { partnerBox.checked = true; return; }
    }
    setPartner(ctx, v, next);
  });

  const note = el('textarea', { id: 'vd-note', class: 'bz-input', rows: '3', maxlength: '500', placeholder: 'Ex. : Contact : Julie, le samedi. Tournoi Lorcana chaque mois.' });
  note.value = d.note;
  note.addEventListener('input', () => { d.note = note.value; });

  const ident = el('input', { id: 'vd-identifier', class: 'bz-input', autocomplete: 'off', spellcheck: 'false', placeholder: 'Ex. : julie@exemple.fr', style: { flex: '1', minWidth: '0' } });
  ident.value = d.identifier;
  ident.addEventListener('input', () => { d.identifier = ident.value; });
  ident.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addManager(ctx, v); } });

  let fiche;
  if (manual) {
    // La règle du serveur, rappelée et vérifiée pendant la frappe : l'appli
    // tire le département de l'adresse, pas du code postal.
    const rule = el('span', { class: 'bz-tiny', text: 'L’adresse doit contenir le code postal.' });
    const checkRule = () => {
      const pc = d.postal_code.trim();
      rule.style.color = /^\d{5}$/.test(pc) && !d.address.includes(pc) ? 'var(--text-danger)' : '';
    };
    const name = draftInput(d, 'name', 'Nom', { maxlength: '120' });
    const address = draftInput(d, 'address', 'Adresse', { maxlength: '200' }, rule);
    const postal = draftInput(d, 'postal_code', 'Code postal', { maxlength: '5', inputmode: 'numeric' });
    const city = draftInput(d, 'city', 'Ville', { maxlength: '80' });
    // Quand le gérant affiche son propre numéro, ce champ n'est pas celui que
    // voient les membres : son libellé le dit, pour qu'une correction qui ne se
    // voit pas dans l'app ne passe pas pour un bug.
    const phone = draftInput(d, 'phone', managerPhone ? 'Téléphone de la fiche d’origine' : 'Téléphone', { type: 'tel', maxlength: '30', placeholder: 'Aucun' });
    address.node.addEventListener('input', checkRule);
    postal.node.addEventListener('input', checkRule);
    checkRule();
    fiche = el('div', { class: 'adm-quote' },
      el('span', { class: 'bz-eyebrow', text: 'Fiche · créée sur demande, elle se corrige ici' }),
      el('div', { class: 'bz-stack', style: { gap: '10px', marginTop: '8px' } },
        name.field,
        address.field,
        el('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: '10px', alignItems: 'start' } }, postal.field, city.field),
        phone.field),
      el('div', { class: 'bz-row', style: { marginTop: '10px' } },
        el('button', { class: 'bz-btn is-violet is-sm', type: 'button', text: 'Enregistrer', disabled: busy, onclick: () => saveFields(ctx, v) })));
  } else {
    fiche = el('p', { class: 'bz-tiny', style: { margin: '14px 0 0' }, text: 'Nom et adresse viennent d’OpenStreetMap et s’y corrigent.' });
  }

  return [
    ctx.phone ? null : el('div', { class: 'bz-row', style: { alignItems: 'flex-start' } },
      el('b', { style: { fontFamily: 'var(--font-display)', fontSize: '15px', flex: '1', minWidth: '0', overflowWrap: 'anywhere' }, text: v.name || '—' }),
      pills.length ? el('span', { class: 'bz-row', style: { gap: '4px' } }, pills) : null),
    ctx.phone && pills.length ? el('div', { class: 'bz-row', style: { gap: '4px' } }, pills) : null,
    el('div', { class: 'bz-stack', style: { gap: '6px', marginTop: '12px' } },
      line('Adresse', addressOf(v) || '—'),
      line('Département', v.department || '—'),
      line('Téléphone', shownPhone ? telLink(shownPhone) : muted('aucun')),
      managerPhone ? el('span', { class: 'bz-tiny', text: 'Numéro saisi par le gérant — c’est celui que voient les membres.' }) : null,
      site ? line('Site', site) : null,
      line('Source', source)),
    pending.length ? el('div', { class: 'adm-ai-note', style: { marginTop: '14px' } },
      el('span', { class: 'bz-eyebrow', text: pending.length > 1 ? pending.length + ' demandes en attente sur cette boutique' : 'Une demande en attente sur cette boutique' }),
      el('div', { class: 'bz-stack', style: { gap: '6px', marginTop: '8px' } },
        pending.map((r) => el('div', { class: 'bz-row', style: { gap: '8px' } },
          el('span', { class: 'bz-small', style: { flex: '1', minWidth: '0', overflowWrap: 'anywhere' },
            text: (r.type === 'CREATE' ? 'Création' : 'Affiliation') + ' · ' + (r.requester_pseudo || 'Un membre') + ' · ' + sinceFr(r.created_date) }),
          el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Ouvrir dans « À valider »', onclick: () => openPendingRequest(ctx, r) }))))) : null,
    el('div', { class: 'adm-quote' },
      el('span', { class: 'bz-eyebrow', text: 'Partenaire' }),
      el('label', { class: 'bz-check', style: { margin: '6px -10px 0' } }, partnerBox,
        el('span', { text: flags.is_partner ? 'Partenaire depuis le ' + dateFr(v.profile.partner_since) : 'Pas partenaire' })),
      el('span', { class: 'bz-tiny', style: { display: 'block', marginTop: '4px' }, text: 'Un partenaire n’a pour l’instant qu’un badge dans l’appli. La tête de liste et les lieux de RDV arrivent avec le lot suivant.' })),
    el('div', { class: 'bz-field', style: { marginTop: '14px' } },
      el('label', { class: 'bz-label', for: 'vd-note' }, 'Note interne · ', el('small', { text: 'lue par les seuls admins' })),
      note,
      el('div', { class: 'bz-row' },
        el('button', { class: 'bz-btn is-violet is-sm', type: 'button', text: 'Enregistrer la note', disabled: busy, onclick: () => saveNote(ctx, v) }))),
    el('div', { class: 'adm-quote' },
      el('span', { class: 'bz-eyebrow', text: 'Gérants · ' + managers.length }),
      managers.length
        ? el('div', {}, managers.map((m) => el('div', { class: 'bz-row', style: { gap: '8px', flexWrap: 'nowrap', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.06)' } },
          el('span', { style: { flex: '1', minWidth: '0' } },
            el('b', { style: { display: 'block', fontFamily: 'var(--font-ui)', fontSize: '13px', overflowWrap: 'anywhere' }, text: m.pseudo || '—' }),
            el('span', { class: 'bz-tiny', style: { display: 'block', overflowWrap: 'anywhere' }, text: [m.email, m.added_date ? 'depuis le ' + dateFr(m.added_date) : null].filter(Boolean).join(' · ') })),
          el('button', { class: 'bz-btn is-sm is-red', type: 'button', text: 'Retirer', disabled: busy, onclick: () => removeManager(ctx, v, m) }))))
        : el('span', { class: 'bz-small bz-muted', style: { display: 'block', marginTop: '6px' }, text: 'Aucun gérant.' }),
      el('label', { class: 'bz-label', for: 'vd-identifier', style: { display: 'block', marginTop: '12px' }, text: 'Pseudo ou e-mail d’un compte majeur' }),
      el('div', { class: 'bz-row', style: { gap: '8px', marginTop: '6px', flexWrap: 'nowrap' } },
        ident,
        el('button', { class: 'bz-btn is-violet', type: 'button', text: 'Affilier', disabled: busy, onclick: () => addManager(ctx, v) }))),
    fiche
  ];
}

// LE CHAMP DE RECHERCHE EST UN SEUL NŒUD, gardé d'un rendu à l'autre, et ses
// écouteurs ne lisent que l'état du module : aucun rendu n'a à le refaire. Un
// rendu complet de la console (after() après un geste) le détache pourtant
// avec l'ancien écran avant de le rattacher au nouveau, et un champ détaché
// perd le focus. renderDirectory le lui rend alors, curseur compris.
function searchInput() {
  if (dir.search) return dir.search;
  const search = el('input', { class: 'bz-input', type: 'search', placeholder: 'Nom, ville ou département', 'aria-label': 'Rechercher une boutique', autocomplete: 'off', style: { flex: '1 1 220px', minWidth: '0', width: 'auto' } });
  search.value = dir.q;
  search.addEventListener('input', () => {
    dir.q = search.value;
    clearTimeout(dir.timer);
    // 300 ms sans frappe avant d'interroger le serveur : une requête par mot,
    // pas une par lettre.
    dir.timer = setTimeout(() => { refreshList({ page: 1 }); }, 300);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    clearTimeout(dir.timer);
    refreshList({ page: 1 });
  });
  dir.search = search;
  return search;
}

function renderDirectory(ctx, levels) {
  const narrow = ctx.narrow;
  // Premier passage : la liste se charge. La vue construite plus bas montre
  // l'attente, et le repeint suit la réponse.
  if (dir.venues === null && !dir.loading && !dir.error) loadDirectory().then(repaintList);
  const showList = !narrow || ctx.pane !== DIR_PANE;
  const showDetail = !narrow || ctx.pane === DIR_PANE;

  const search = searchInput();
  // L'ancien écran est encore en place à cet instant : render() (admin.js)
  // construit le nouveau avant de vider la page. Si l'admin tape dans le
  // champ, on note son curseur, et on lui rend le focus une fois l'écran posé
  // - la microtâche passe après la fin, synchrone, de render().
  if (showList && document.activeElement === search) {
    const start = search.selectionStart;
    const end = search.selectionEnd;
    queueMicrotask(() => {
      if (!search.isConnected || document.activeElement === search) return;
      search.focus({ preventScroll: true });
      try { search.setSelectionRange(start, end); } catch { /* type sans sélection */ }
    });
  }
  const partnerFilter = el('button', {
    class: 'bz-tab', type: 'button', 'aria-pressed': String(dir.partnerOnly),
    // L'allure d'un onglet choisi quand le filtre est actif.
    style: dir.partnerOnly ? { background: 'var(--soft-violet-fill)', borderColor: 'var(--soft-violet-border)', color: 'var(--soft-violet-text)' } : null,
    onclick: () => { dir.partnerOnly = !dir.partnerOnly; clearTimeout(dir.timer); ctx.rerender(); refreshList({ page: 1 }); }
  }, 'Partenaires uniquement');

  const head = el('div', { class: 'adm-list-head' });
  const rows = el('div', { class: 'adm-list' });
  const pager = el('div', { style: { display: 'none', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 16px', borderTop: '1px solid var(--line)' } });
  const card = el('section', { class: 'bz-card adm-list-card' }, head, rows, pager);
  const detail = showDetail ? el('div', { class: 'bz-card adm-detail' }) : null;
  const view = { ctx, head, rows, pager, card, detail };
  dir.view = view;
  paintList(view);
  if (detail) paintDetail(view);
  const v = currentVenue();

  return el('div', {},
    showList ? levels : null,
    showList ? el('div', { class: 'bz-row', style: { gap: '8px', marginTop: '12px' } }, search, partnerFilter) : null,
    el('div', { class: 'adm-split', style: { marginTop: '12px' } },
      showList ? card : null,
      showDetail && narrow ? (ctx.phone && v
        ? ctx.paneHead('Toutes les boutiques', v.name || '—', [v.city, v.department].filter(Boolean).join(' · '), null)
        : ctx.backButton('Toutes les boutiques')) : null,
      detail
    )
  );
}
