// La vue « Sources » de la console (13/10/2026, mise en conformité) : couper
// une source, une par une - un catalogue, une source de cotes ou d'annonces,
// un site d'actualités -, et la rétablir. C'est l'outil de la procédure de
// retrait : une source ou un titulaire de droits écrit, on coupe ce qu'il
// vise, puis on examine sa demande. Tout vient de GET /admin/coupures
// (server/src/routes/adminCoupures.js).
//
// UNE SOURCE, PAS UN JEU : un jeu en a plusieurs (Pokémon : TCGdex, Pokémon
// TCG API, Cardmarket, TCGplayer, CardTrader, eBay), et un avertissement vient
// de l'une d'elles. Le filtre par jeu montre les sources d'un jeu, chacune
// avec son interrupteur.
//
// Une coupure agit dans la minute, sans redéployer, et ne supprime rien. Les
// photos des membres ne sont jamais touchées. Chaque geste demande un motif,
// gardé avec la coupure et inscrit au journal.
import { call } from './api.js';
import { el, dateShort, dateTime } from './chrome.js';

const sc = { status: 'idle', sources: [], actus: [], history: [], error: null, seq: 0, busy: new Set(), game: 'all' };

export async function loadSources() {
  const seq = ++sc.seq;
  try {
    const data = await call('/admin/coupures');
    if (seq !== sc.seq) return;
    sc.sources = data.sources || [];
    sc.actus = data.actus || [];
    sc.history = data.history || [];
    sc.status = 'ready';
    sc.error = null;
  } catch (e) {
    if (seq !== sc.seq) return;
    if (e.status === 404) sc.status = 'absent';
    else { sc.status = sc.sources.length ? 'ready' : 'error'; sc.error = e.message; }
  }
}

// Le nombre de coupures en cours, montré à côté du nom de l'onglet.
export function sourcesCutCount() {
  return sc.sources.filter((s) => s.cut).length + sc.actus.filter((a) => a.cut).length;
}

const GAMES = [
  ['pokemon', 'Pokémon'], ['yugioh', 'Yu-Gi-Oh!'], ['onepiece', 'One Piece'], ['lorcana', 'Lorcana'], ['magic', 'Magic'],
  ['starwarsunlimited', 'Star Wars: Unlimited'], ['dragonball', 'Dragon Ball'], ['wow', 'World of Warcraft']
];
const GAME_LABEL = Object.fromEntries(GAMES);
const gameList = (ids) => (ids.length >= GAMES.length ? 'Tous les jeux' : ids.map((g) => GAME_LABEL[g] || g).join(' · '));

async function cut(kind, item, ctx) {
  const effects = kind === 'actus' ? ['ses articles disparaissent du fil d’actualités, et il n’est plus lu'] : item.effects;
  const pending = kind === 'actus' ? [] : (item.pending || []);
  const values = await ctx.ask({
    title: 'Couper « ' + item.label + ' » ?',
    text: 'Retiré dans la minute : ' + effects.join(' ; ') + '.'
      + (pending.length ? ' Reste en ligne, faute de pouvoir le couper d’ici : ' + pending.join(' ; ') + '.' : '')
      + ' Rien n’est effacé : rétablir remet tout en place. Les photos des membres ne sont jamais touchées.',
    fields: [{ name: 'reason', label: 'Motif : la demande à laquelle tu réponds', type: 'textarea', required: true, placeholder: 'Ex. : courriel de Bandai Europe du 14/10/2026, demande de retrait des visuels' }],
    confirmLabel: 'Couper',
    tone: 'red'
  });
  if (!values) return;
  sc.busy.add(kind + ':' + item.id);
  ctx.rerender();
  try {
    await call('/admin/coupures', { method: 'POST', body: { kind, target: item.id, reason: values.reason } });
    await loadSources();
    ctx.toast('Coupé : ' + item.label + '. L’application l’applique dans la minute.');
  } catch (e) {
    ctx.toast(e.message, 'err');
  } finally {
    sc.busy.delete(kind + ':' + item.id);
    ctx.rerender();
  }
}

async function restore(kind, item, ctx) {
  const values = await ctx.ask({
    title: 'Rétablir « ' + item.label + ' » ?',
    text: 'Coupé le ' + dateShort(item.cut.created_date) + ' : ' + item.cut.reason,
    fields: [{ name: 'reason', label: 'Pourquoi rétablir', type: 'textarea', required: true, placeholder: 'Ex. : accord écrit reçu le 20/10/2026, ou demande infondée' }],
    confirmLabel: 'Rétablir',
    tone: 'violet'
  });
  if (!values) return;
  sc.busy.add(kind + ':' + item.id);
  ctx.rerender();
  try {
    await call('/admin/coupures/' + encodeURIComponent(item.cut.id) + '/lever', { method: 'POST', body: { reason: values.reason } });
    await loadSources();
    ctx.toast('Rétabli : ' + item.label + '.');
  } catch (e) {
    ctx.toast(e.message, 'err');
  } finally {
    sc.busy.delete(kind + ':' + item.id);
    ctx.rerender();
  }
}

function row(kind, item, ctx, { games, effects, pending = [], cuttable = true }) {
  const busy = sc.busy.has(kind + ':' + item.id);
  const c = item.cut;
  return el('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px 16px', borderTop: '1px solid var(--surface-border, rgba(255,255,255,.08))' } },
    el('div', { style: { flex: '1', minWidth: '0' } },
      el('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' } },
        el('b', { style: { fontFamily: 'var(--font-ui)' }, text: item.label }),
        c ? el('span', { class: 'bz-pill is-red', text: 'Coupé depuis le ' + dateShort(c.created_date) })
          : el('span', { class: 'bz-pill is-green', text: 'En ligne' })),
      el('div', { class: 'bz-tiny bz-muted', style: { marginTop: '3px' }, text: games }),
      effects.length ? el('ul', { class: 'bz-small bz-muted', style: { margin: '6px 0 0', paddingLeft: '18px', lineHeight: '1.55' } },
        effects.map((e) => el('li', { text: e }))) : null,
      // Ce que la coupure ne retire pas encore : dit en clair, pour qu'une
      // coupure faite dans l'urgence ne passe pas pour complète.
      pending.length ? el('div', { class: 'bz-small', style: { margin: '6px 0 0', color: '#F8C46A', lineHeight: '1.55' } },
        el('b', { text: cuttable ? 'Pas encore coupé d’ici : ' : 'Ne se coupe pas encore d’ici : ' }), pending.join(' ; ') + '. Voir la procédure de retrait.') : null,
      c ? el('div', { class: 'adm-quote is-red', style: { marginTop: '8px' } },
        el('span', { class: 'bz-tiny bz-muted', text: 'Par ' + (c.created_by || 'un admin') + ', le ' + dateTime(c.created_date) }),
        el('p', { text: c.reason })) : null
    ),
    el('div', { style: { flex: 'none' } },
      c ? el('button', { class: 'bz-btn is-violet is-sm', type: 'button', disabled: busy, text: busy ? '…' : 'Rétablir', onclick: () => restore(kind, item, ctx) })
        : el('button', { class: 'bz-btn is-red is-sm', type: 'button', disabled: busy || !cuttable, title: cuttable ? '' : 'Rien à couper d’ici pour l’instant', text: busy ? '…' : 'Couper', onclick: () => cut(kind, item, ctx) })));
}

function section(title, intro, rows) {
  return el('section', { class: 'bz-card', style: { padding: '0', overflow: 'hidden', marginTop: '14px' } },
    el('div', { class: 'adm-list-head', style: { display: 'block' } },
      el('div', { text: title }),
      intro ? el('div', { class: 'bz-tiny bz-muted', style: { fontWeight: '400', marginTop: '3px' }, text: intro }) : null),
    rows);
}

function historyRow(h) {
  const where = (h.kind === 'actus' ? 'Actualités · ' : '') + (h.label || h.target);
  return el('div', { style: { padding: '10px 16px', borderTop: '1px solid var(--surface-border, rgba(255,255,255,.08))' } },
    el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' } },
      el('b', { style: { fontFamily: 'var(--font-ui)', fontSize: '13px' }, text: where }),
      h.lifted_at ? el('span', { class: 'bz-pill is-grey', text: 'Rétabli le ' + dateShort(h.lifted_at) }) : el('span', { class: 'bz-pill is-red', text: 'En cours' })),
    el('div', { class: 'bz-small bz-muted', style: { marginTop: '4px', whiteSpace: 'pre-wrap' }, text: 'Coupé le ' + dateTime(h.created_date) + ' par ' + (h.created_by || 'un admin') + ' : ' + h.reason }),
    h.lifted_at ? el('div', { class: 'bz-small bz-muted', style: { marginTop: '2px', whiteSpace: 'pre-wrap' }, text: 'Rétabli le ' + dateTime(h.lifted_at) + ' par ' + (h.lifted_by || 'un admin') + ' : ' + (h.lift_reason || '') }) : null);
}

export function renderSources(ctx) {
  if (sc.status === 'idle') {
    sc.status = 'loading';
    loadSources().then(ctx.rerender);
  }
  if (sc.status === 'loading' && !sc.sources.length) {
    return el('div', {}, el('div', { class: 'bz-skeleton', style: { height: '80px', marginTop: '16px' } }), el('div', { class: 'bz-skeleton', style: { height: '320px', marginTop: '12px' } }));
  }
  if (sc.status === 'absent') {
    return el('section', { class: 'bz-card', style: { marginTop: '16px' } },
      el('b', { text: 'Sources : pas encore branché côté serveur' }),
      el('p', { class: 'bz-small bz-muted', text: 'Ce serveur ne connaît pas encore /admin/coupures. Les interrupteurs apparaîtront ici dès qu’il sera en ligne.' }));
  }
  if (sc.status === 'error') {
    return el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '16px' } },
      el('span', { text: 'Sources indisponibles : ' + sc.error + ' ' }),
      el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Réessayer', onclick: () => { sc.status = 'loading'; ctx.rerender(); loadSources().then(ctx.rerender); } }));
  }

  const actives = sourcesCutCount();
  const keep = (games) => sc.game === 'all' || games.includes(sc.game);
  const sourceRows = (group) => sc.sources.filter((s) => s.group === group && keep(s.games))
    .map((s) => row('source', s, ctx, { games: gameList(s.games), effects: s.effects, pending: s.pending || [], cuttable: s.cuttable !== false }));
  const catalogues = sourceRows('catalogues');
  const cotes = sourceRows('cotes');
  const actus = sc.actus.filter((a) => keep([a.game]))
    .map((a) => row('actus', a, ctx, {
      games: (GAME_LABEL[a.game] || a.game) + (a.active ? '' : ' · source de repli, éteinte'),
      effects: ['Ses articles et leurs images, retirés du fil']
    }));
  const empty = (text) => el('p', { class: 'bz-small bz-muted', style: { padding: '12px 16px', margin: '0' }, text });

  const filters = el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Filtrer par jeu', style: { marginTop: '14px', flexWrap: 'wrap' } },
    [['all', 'Tous les jeux'], ...GAMES].map(([id, label]) => el('button', {
      class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(sc.game === id),
      onclick: () => { sc.game = id; ctx.rerender(); }
    }, label)));

  return el('div', {},
    sc.error ? el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '16px' }, text: 'Dernière mise à jour impossible : ' + sc.error }) : null,
    el('section', { class: 'bz-card', style: { marginTop: '16px' } },
      el('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' } },
        el('b', { style: { flex: '1', fontFamily: 'var(--font-ui)' }, text: actives ? actives + ' coupure' + (actives > 1 ? 's' : '') + ' en cours' : 'Aucune coupure en cours' }),
        el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Actualiser', onclick: () => { loadSources().then(ctx.rerender); } })),
      el('p', { class: 'bz-small bz-muted', style: { margin: '8px 0 0', lineHeight: '1.6' }, text: 'Si une source ou un titulaire de droits t’écrit : coupe la source qu’il vise, puis examine sa demande. Une coupure agit dans la minute, sans redéployer, et ne supprime rien. Le catalogue d’un jeu (noms, numéros) reste : seul ce qui est listé sous chaque source disparaît. Les photos des membres ne sont jamais touchées. Le motif est gardé ici et au journal.' })),
    filters,
    section('Catalogues', 'Les sources des cartes et de leurs images.', catalogues.length ? catalogues : empty('Aucun catalogue pour ce jeu.')),
    section('Cotes et marché', 'Les sources des prix, des produits scellés et des annonces.', cotes.length ? cotes : empty('Aucune source de cotes pour ce jeu.')),
    section('Actualités', 'Un site coupé disparaît du fil et n’est plus lu.', actus.length ? actus : empty(sc.actus.length ? 'Aucun site d’actualités pour ce jeu.' : 'Aucun site d’actualités en base.')),
    section('Historique', 'Les 50 dernières coupures, levées ou non.',
      sc.history.length ? sc.history.map(historyRow) : empty('Aucune coupure jusqu’ici.'))
  );
}
