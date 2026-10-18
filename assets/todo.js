// La vue « Todo » de la console (13/10/2026) : la todolist officielle de
// Boostz. TanPib y coche, ajoute, corrige et supprime ; les sessions Claude la
// tiennent à jour de leur côté (server/scripts/todo.mjs, /todo-sync). Tout
// vient de GET /admin/todo (server/src/routes/todo.js).
//
// Les actions sont groupées par thème. Le filtre « Ouvertes » est celui
// d'ouverture : ce qui reste à faire. « Pour moi » ne garde que ce que TanPib
// porte, « Faites » ce qui est coché, « Tout » le reste compris.
import { call } from './api.js';
import { el, dateShort } from './chrome.js';

const td = {
  status: 'idle', items: [], statuses: {}, owners: {}, error: null, seq: 0,
  filter: 'ouvertes', editing: null, busy: new Set(), closed: new Set()
};

export async function loadTodo() {
  const seq = ++td.seq;
  try {
    const data = await call('/admin/todo');
    if (seq !== td.seq) return;
    td.items = data.items || [];
    td.statuses = data.statuses || {};
    td.owners = data.owners || {};
    td.status = 'ready';
    td.error = null;
  } catch (e) {
    if (seq !== td.seq) return;
    if (e.status === 404) td.status = 'absent';
    else { td.status = td.items.length ? 'ready' : 'error'; td.error = e.message; }
  }
}

// Le badge de l'onglet : ce que TanPib porte et qui reste ouvert.
export function todoMineCount() {
  return td.items.filter((t) => !t.done && t.owner === 'tanpib').length;
}

// L'accueil de la console : les prochaines actions de TanPib, celles qui ont
// une échéance d'abord, la plus proche en tête. `late` : l'échéance est passée.
export function todoMineNext(n = 5) {
  const now = new Date().toISOString().slice(0, 10);
  const mine = td.items.filter((t) => !t.done && t.owner === 'tanpib');
  const sorted = [...mine].sort((a, b) => (a.due_day ? 0 : 1) - (b.due_day ? 0 : 1) || String(a.due_day || '').localeCompare(String(b.due_day || '')));
  return {
    late: mine.filter((t) => t.due_day && t.due_day < now).length,
    items: sorted.slice(0, n).map((t) => ({ title: t.title, due_day: t.due_day || null, late: !!(t.due_day && t.due_day < now), status: t.status }))
  };
}

const TONES = { a_faire: 'is-grey', en_cours: 'is-violet', bloque: 'is-red', attente: 'is-amber' };
const FILTERS = [
  ['ouvertes', 'Ouvertes', (t) => !t.done],
  ['moi', 'Pour moi', (t) => !t.done && t.owner === 'tanpib'],
  ['faites', 'Faites', (t) => t.done],
  ['tout', 'Tout', () => true]
];

const today = () => new Date().toISOString().slice(0, 10);
const dayFr = (d) => (d ? dateShort(d + 'T12:00:00') : '');

async function save(id, body, ctx, message) {
  td.busy.add(id || 'new');
  ctx.rerender();
  try {
    if (id) await call('/admin/todo/' + encodeURIComponent(id), { method: 'PATCH', body });
    else await call('/admin/todo', { method: 'POST', body });
    td.editing = null;
    await loadTodo();
    if (message) ctx.toast(message);
  } catch (e) {
    ctx.toast(e.message, 'err');
  } finally {
    td.busy.delete(id || 'new');
    ctx.rerender();
  }
}

async function remove(t, ctx) {
  const ok = await ctx.ask({ title: 'Supprimer cette action ?', text: t.title, confirmLabel: 'Supprimer', tone: 'red' });
  if (!ok) return;
  try {
    await call('/admin/todo/' + encodeURIComponent(t.id), { method: 'DELETE' });
    await loadTodo();
    ctx.toast('Action supprimée.');
  } catch (e) {
    ctx.toast(e.message, 'err');
  }
  ctx.rerender();
}

// Le prompt d'une action, à envoyer tel quel à une session Claude.
async function copyPrompt(t, ctx) {
  try {
    await navigator.clipboard.writeText(t.prompt);
    ctx.toast('Prompt copié : colle-le dans une conversation avec Claude.');
  } catch {
    ctx.toast('Copie impossible : ouvre « Modifier » et copie le prompt à la main.', 'note');
  }
}

// Le formulaire, pour ajouter (t absent) ou modifier.
function form(t, ctx) {
  const themes = [...new Set(td.items.map((x) => x.theme))].sort((a, b) => a.localeCompare(b, 'fr'));
  const listId = 'td-themes';
  const field = (label, input) => el('label', { class: 'bz-stack', style: { gap: '4px' } }, el('span', { class: 'bz-small bz-muted', text: label }), input);
  const title = el('input', { class: 'bz-input', value: t ? t.title : '', maxlength: '200', required: true, autocomplete: 'off' });
  const theme = el('input', { class: 'bz-input', value: t ? t.theme : '', maxlength: '60', list: listId, required: true, autocomplete: 'off' });
  const details = el('textarea', { class: 'bz-input', rows: '3', maxlength: '2000' });
  details.value = t && t.details ? t.details : '';
  const prompt = el('textarea', { class: 'bz-input', rows: '4', maxlength: '4000', placeholder: 'Ce qu’il faut demander à Claude pour faire cette action' });
  prompt.value = t && t.prompt ? t.prompt : '';
  const status = el('select', { class: 'bz-input' }, Object.entries(td.statuses).map(([v, label]) => el('option', { value: v, text: label, selected: t ? t.status === v : v === 'a_faire' })));
  const owner = el('select', { class: 'bz-input' }, Object.entries(td.owners).map(([v, label]) => el('option', { value: v, text: label, selected: t ? t.owner === v : v === 'tanpib' })));
  const due = el('input', { class: 'bz-input', type: 'date', value: t && t.due_day ? t.due_day : '' });
  const busy = td.busy.has(t ? t.id : 'new');
  return el('form', {
    class: 'bz-card is-tight bz-stack', style: { gap: '10px', marginTop: '10px' },
    onsubmit: (e) => {
      e.preventDefault();
      save(t ? t.id : null, { title: title.value, theme: theme.value, details: details.value, prompt: prompt.value, status: status.value, owner: owner.value, due_day: due.value },
        ctx, t ? 'Action modifiée.' : 'Action ajoutée.');
    }
  },
  el('datalist', { id: listId }, themes.map((x) => el('option', { value: x }))),
  field('Titre', title),
  el('div', { class: 'bz-grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' } },
    field('Thème', theme), field('Statut', status), field('Qui la porte', owner), field('Échéance', due)),
  field('Détails', details),
  field('Prompt pour Claude', prompt),
  el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
    el('button', { class: 'bz-btn', type: 'button', text: 'Annuler', onclick: () => { td.editing = null; ctx.rerender(); } }),
    el('button', { class: 'bz-btn is-violet', type: 'submit', disabled: busy, text: busy ? 'Enregistrement…' : 'Enregistrer' })
  ));
}

function row(t, ctx) {
  if (td.editing === t.id) return form(t, ctx);
  const late = !t.done && t.due_day && t.due_day < today();
  const box = el('input', {
    type: 'checkbox', checked: t.done, disabled: td.busy.has(t.id),
    'aria-label': (t.done ? 'Décocher : ' : 'Cocher : ') + t.title,
    style: { width: '18px', height: '18px', marginTop: '2px', flex: 'none', accentColor: '#7C3AED', cursor: 'pointer' },
    onchange: () => save(t.id, { done: !t.done }, ctx, t.done ? 'Action rouverte.' : 'Action faite.')
  });
  return el('div', { class: 'td-row', style: { display: 'flex', gap: '12px', padding: '12px 16px', borderTop: '1px solid var(--surface-border, rgba(255,255,255,.08))' } },
    box,
    el('div', { style: { flex: '1', minWidth: '0' } },
      el('div', { style: { fontFamily: 'var(--font-ui)', fontWeight: '700', textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? '.6' : '1' }, text: t.title }),
      t.details ? el('div', { class: 'bz-small bz-muted', style: { whiteSpace: 'pre-wrap', marginTop: '4px' }, text: t.details }) : null,
      el('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '8px' } },
        t.done ? el('span', { class: 'bz-pill is-green', text: 'Fait' + (t.done_at ? ' le ' + dateShort(t.done_at) : '') })
          : el('span', { class: 'bz-pill ' + (TONES[t.status] || 'is-grey'), text: td.statuses[t.status] || t.status }),
        el('span', { class: 'bz-pill is-grey', text: t.owner === 'tanpib' ? 'Toi' : (td.owners[t.owner] || t.owner) }),
        t.due_day ? el('span', { class: 'bz-pill ' + (late ? 'is-red' : 'is-grey'), text: (late ? 'En retard · ' : 'Pour le ') + dayFr(t.due_day) }) : null,
        t.source ? el('span', { class: 'bz-tiny bz-muted', style: { overflowWrap: 'anywhere' }, text: t.source }) : null
      )
    ),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', flex: 'none' } },
      t.prompt && !t.done ? el('button', { class: 'bz-btn is-violet is-sm', type: 'button', text: 'Copier le prompt', onclick: () => copyPrompt(t, ctx) }) : null,
      el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Modifier', onclick: () => { td.editing = t.id; ctx.rerender(); } }),
      el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Supprimer', onclick: () => remove(t, ctx) })
    ));
}

export function renderTodo(ctx) {
  if (td.status === 'idle') {
    td.status = 'loading';
    loadTodo().then(ctx.rerender);
  }
  if (td.status === 'loading' && !td.items.length) {
    return el('div', {}, el('div', { class: 'bz-skeleton', style: { height: '44px', marginTop: '16px' } }), el('div', { class: 'bz-skeleton', style: { height: '320px', marginTop: '12px' } }));
  }
  if (td.status === 'absent') {
    return el('section', { class: 'bz-card', style: { marginTop: '16px' } },
      el('b', { text: 'Todo : pas encore branchée côté serveur' }),
      el('p', { class: 'bz-small bz-muted', text: 'Ce serveur ne connaît pas encore /admin/todo. La liste apparaîtra ici dès qu’il sera en ligne.' }));
  }
  if (td.status === 'error') {
    return el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '16px' } },
      el('span', { text: 'Todo indisponible : ' + td.error + ' ' }),
      el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Réessayer', onclick: () => { td.status = 'loading'; ctx.rerender(); loadTodo().then(ctx.rerender); } }));
  }

  const keep = (FILTERS.find(([id]) => id === td.filter) || FILTERS[0])[2];
  const shown = td.items.filter(keep);
  // Les thèmes dans l'ordre de leur première action (position, puis date).
  const themes = [];
  for (const t of td.items) if (!themes.includes(t.theme)) themes.push(t.theme);

  const tabs = el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Filtrer les actions', style: { marginTop: '16px' } },
    FILTERS.map(([id, label, test]) => el('button', {
      class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(td.filter === id),
      onclick: () => { td.filter = id; ctx.rerender(); }
    }, label, el('span', { class: 'bz-count', text: String(td.items.filter(test).length) }))));

  const groups = themes.map((theme) => {
    const items = shown.filter((t) => t.theme === theme);
    if (!items.length) return null;
    const all = td.items.filter((t) => t.theme === theme);
    const open = all.filter((t) => !t.done).length;
    const folded = td.closed.has(theme);
    return el('section', { class: 'bz-card', style: { padding: '0', overflow: 'hidden', marginTop: '12px' } },
      el('button', {
        class: 'adm-list-head', type: 'button', 'aria-expanded': String(!folded),
        style: { display: 'flex', width: '100%', alignItems: 'center', gap: '10px', border: '0', background: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left' },
        onclick: () => { if (folded) td.closed.delete(theme); else td.closed.add(theme); ctx.rerender(); }
      },
      el('span', { style: { flex: '1' }, text: theme }),
      el('span', { class: 'bz-tiny bz-muted', text: open + ' ouverte' + (open > 1 ? 's' : '') + ' · ' + (all.length - open) + ' faite' + (all.length - open > 1 ? 's' : '') }),
      el('span', { 'aria-hidden': 'true', text: folded ? '▸' : '▾' })),
      folded ? null : items.map((t) => row(t, ctx)));
  }).filter(Boolean);

  return el('div', {},
    td.error ? el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '16px' }, text: 'Dernière mise à jour impossible : ' + td.error }) : null,
    el('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' } },
      el('div', { style: { flex: '1' } }, tabs),
      el('button', { class: 'bz-btn is-violet is-sm', type: 'button', style: { marginTop: '16px' }, text: 'Ajouter une action', onclick: () => { td.editing = 'new'; ctx.rerender(); } }),
      el('button', { class: 'bz-btn is-sm', type: 'button', style: { marginTop: '16px' }, text: 'Actualiser', onclick: () => { loadTodo().then(ctx.rerender); } })
    ),
    td.editing === 'new' ? form(null, ctx) : null,
    groups.length ? groups : el('p', { class: 'bz-small bz-muted', style: { padding: '24px 0', textAlign: 'center' }, text: td.filter === 'faites' ? 'Rien de coché pour l’instant.' : 'Rien ici : tout est fait, ou la liste est encore vide.' }),
    el('p', { class: 'bz-tiny bz-muted', style: { marginTop: '14px' }, text: 'La todolist officielle : tu coches et corriges ici, les sessions Claude la tiennent à jour de leur côté. Une case cochée par toi le reste. « Copier le prompt » donne de quoi demander l’action à Claude.' })
  );
}
