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
// boutiques. L'Annuaire arrive à la Task 16 ; en attendant, il le dit.
//
// BRANCHÉ COMME data.js : l'état vit ici. admin.js n'importe que le chargement
// (pour le badge de l'onglet), le rendu et le compteur, et passe au rendu ses
// propres outils : toast, ask, after, et le volet des écrans étroits. Tout
// texte venu de l'API passe par el() et textContent, jamais par du HTML.
import { call } from './api.js';
import { el, put, dateFr, dateTime } from './chrome.js';

// Le nom du volet ouvert sur écran étroit (state.pane dans admin.js).
const PANE = 'venue-request';

// `type` : le sous-onglet ouvert, CREATE ou CLAIM. L'API rend les compteurs des
// deux et la liste d'un seul ; `listType` dit à quel sous-onglet appartient
// `list`, pour ne jamais dessiner des créations sous « Affiliations » le temps
// d'un rechargement. `drafts` : ce que l'admin a déjà corrigé, coché ou écrit
// dans une demande, par demande - un redessin de la console (un chargement qui
// aboutit pendant qu'il tape) ne doit pas l'effacer. `busy` : la demande dont
// la décision est en route, pour qu'un double clic n'en envoie pas deux.
// `absent` : l'API ne connaît pas encore la route (404). `seq` écarte une
// réponse dépassée, comme pour les idées. `dirVenueId` : la boutique sur
// laquelle ouvrir l'Annuaire, que la Task 16 lira.
const vn = {
  level: 'pending', type: 'CREATE',
  counts: { CREATE: 0, CLAIM: 0 }, list: null, listType: null,
  selId: null, drafts: new Map(), busy: null,
  loading: false, error: null, absent: false, seq: 0,
  dirVenueId: null
};

// Le badge de l'onglet : créations et affiliations en attente, additionnées.
export const venuesPendingCount = () => (vn.counts.CREATE || 0) + (vn.counts.CLAIM || 0);

// Ne lève jamais, comme loadIdeas (admin.js) et loadData (data.js) : chargée
// avec tout le reste pour le badge, une panne ici ne doit pas coûter à la
// console son bandeau d'erreur général. Le type est lu au départ : si
// l'admin change de sous-onglet entre-temps, `seq` jette cette réponse.
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

// Ouvrir l'Annuaire, sur une boutique si on en vient. Sur écran étroit, le volet
// de la demande se referme : l'Annuaire a le sien.
function openDirectory(ctx, venueId) {
  vn.level = 'directory';
  vn.dirVenueId = venueId || null;
  if (ctx.narrow && ctx.pane) ctx.closePane();
  else ctx.rerender();
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
// s'affiche pas au doigt).
function decisionButtons(ctx, r, approveLabel, why = null) {
  const busy = vn.busy === r.id;
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
export function renderVenues(ctx) {
  const narrow = ctx.narrow;
  const phone = ctx.phone;
  const refresh = () => loadVenues().then(ctx.rerender);
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
    tabBtn(vn.level === 'directory', 'Annuaire', null, () => { if (vn.level === 'directory') return; vn.level = 'directory'; vn.dirVenueId = null; ctx.rerender(); }));

  if (vn.level === 'directory') {
    return el('div', {}, levels,
      el('section', { class: 'bz-card', style: { marginTop: '12px' } },
        el('p', { class: 'bz-small bz-muted', style: { margin: '0' }, text: 'L’annuaire arrive.' })));
  }

  const types = el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Type de demande', style: { marginTop: '10px' } },
    ['CREATE', 'CLAIM'].map((t) => tabBtn(vn.type === t, t === 'CREATE' ? 'Créations' : 'Affiliations', vn.counts[t] || 0, () => {
      if (vn.type === t) return;
      vn.type = t;
      vn.selId = null;
      vn.error = null;
      ctx.rerender();
    })));

  const list = vn.listType === vn.type ? vn.list : null;
  const retry = el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Réessayer', onclick: () => { vn.error = null; ctx.rerender(); } });

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
