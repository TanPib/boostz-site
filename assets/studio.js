// L'onglet « Sites web » de la console : l'activité de création de sites de
// l'EI, sans lien avec l'appli (GET /admin/studio, boostz-mobile
// server/src/routes/adminStudio.js et lib/webStudio.js).
//
// Le parcours : un devis calculé ici, créé en brouillon chez Qonto puis
// envoyé au client par Qonto ; accepté, il donne la facture d'acompte ; livré,
// celle du solde et, s'il a des services annuels, leur première année et un
// contrat refacturé chaque année. Toutes les factures naissent en brouillon :
// « Finaliser » (routes de l'onglet Facturation) reste le seul geste qui
// engage. Tout admin lit, seul un super admin agit.
import { call, API, session } from './api.js';
import { el, dateShort } from './chrome.js';
import { money, int } from './revenue.js?v=2026-10-26a';

const sw = {
  status: 'idle', data: null, error: null, seq: 0, view: 'quote', busy: new Set(),
  // Le devis en cours de composition.
  draft: { clientId: '', base: 'five', items: { admin: 1, theme: 1, contact: 1, serenite: 1 }, overrides: {}, depositPct: 30 },
  newClient: false, editingClient: null, clientKind: 'particulier', openQuote: null,
  // Le catalogue : 'new' pour une prestation à créer, sinon la clé modifiée.
  editingItem: null, newItemKind: 'option'
};

const QUOTE_STATUS = {
  draft: ['Brouillon', 'bz-pill is-grey'],
  sent: ['Envoyé', 'bz-pill is-violet'],
  accepted: ['Accepté', 'bz-pill is-amber'],
  refused: ['Refusé', 'bz-pill is-grey'],
  delivered: ['Livré', 'bz-pill is-green'],
  canceled: ['Annulé', 'bz-pill is-grey']
};
const INVOICE_STATUS = { draft: ['Brouillon', 'bz-pill is-grey'], unpaid: ['À payer', 'bz-pill is-violet'], paid: ['Payée', 'bz-pill is-green'], canceled: ['Annulée', 'bz-pill is-grey'] };
const PURPOSE = { deposit: 'Acompte', balance: 'Solde', yearly: 'Services annuels', modification: 'Modifications' };
// Ce que tout site comprend, et la règle des évolutions (lib/webStudio.js).
const INCLUDED = 'Compris dans chaque site : 2 séries de retouches avant la mise en ligne, et 3 mois de garantie sur les bugs. Une évolution (nouvelle page, nouvelle fonction, refonte) fait l’objet d’un devis.';
const includedText = (n) => (n ? n + (n > 1 ? ' pages modifiées par an incluses' : ' page modifiée par an incluse') : '');
const dayFr = (d) => (d ? dateShort(d + 'T12:00:00') : '—');
const today = () => new Date().toISOString().slice(0, 10);
const eur = (cents) => money(cents);
const plural = (n, one) => n + ' ' + one + (n > 1 ? 's' : '');

async function load(rerender) {
  const seq = ++sw.seq;
  if (!sw.data) sw.status = 'loading';
  try {
    const data = await call('/admin/studio');
    if (seq !== sw.seq) return;
    sw.data = data;
    sw.status = 'ready';
    sw.error = null;
    if (!sw.draft.clientId) {
      const first = data.clients.find((c) => !c.archived);
      if (first) sw.draft.clientId = first.id;
    }
  } catch (e) {
    if (seq !== sw.seq) return;
    sw.status = e.status === 404 ? 'absent' : sw.data ? 'ready' : 'error';
    sw.error = e.message;
  }
  rerender();
}

async function act(key, fn, ctx, message) {
  sw.busy.add(key);
  ctx.rerender();
  try {
    const r = await fn();
    await load(ctx.rerender);
    if (message) ctx.toast(typeof message === 'function' ? message(r) : message);
    return r;
  } catch (e) {
    ctx.toast(e.message, 'err');
    return null;
  } finally {
    sw.busy.delete(key);
    ctx.rerender();
  }
}

const btn = (text, onclick, opts = {}) => el('button', { class: 'bz-btn is-sm' + (opts.tone ? ' is-' + opts.tone : ''), type: 'button', text, onclick, disabled: !!opts.disabled, title: opts.title || null });
const tile = (label, value, sub, tone) => el('div', { class: 'bz-card is-tight adm-kpi' },
  el('span', { class: 'bz-eyebrow', text: label }),
  el('div', { class: 'adm-kpi-value', style: tone ? { color: tone } : null, text: value }),
  sub ? el('span', { class: 'bz-tiny bz-muted', text: sub }) : null);

// ---------- Le calcul, le même que celui du serveur (lib/webStudio.js) ----------
// Il ne sert qu'à l'affichage en direct : le serveur recalcule et fige les
// lignes au moment de créer le devis.
function compute(catalog, d) {
  const byKey = new Map(catalog.map((i) => [i.key, i]));
  const base = byKey.get(d.base);
  if (!base || !base.active) return null;
  const qty = (k) => Math.max(0, Math.min(99, Math.floor(Number(d.items[k]) || 0)));
  const sitePages = (base.base_pages || 1) + (byKey.get('pages') && byKey.get('pages').active ? qty('pages') : 0);
  const line = (item, q) => {
    const catalogCents = item.price_cents * q;
    const o = d.overrides[item.key];
    const amount = Number.isFinite(o) ? o : catalogCents;
    return { key: item.key, kind: item.kind, label: item.label, unit: item.unit, quantity: q, amount_cents: amount, catalog_cents: catalogCents, edited: amount !== catalogCents, included_pages: item.included_pages || 0 };
  };
  const lines = [line(base, 1)];
  for (const item of catalog) {
    if (item.kind === 'formule' || item.kind === 'acte' || !item.active) continue;
    let q = qty(item.key);
    if (!q) continue;
    if (!item.unit) q = 1;
    if (item.key === 'edits') q = Math.min(q, sitePages);
    lines.push(line(item, q));
  }
  const once = lines.filter((l) => l.kind !== 'annuel');
  const yearly = lines.filter((l) => l.kind === 'annuel');
  const total = once.reduce((s, l) => s + l.amount_cents, 0);
  const deposit = Math.round((total * d.depositPct) / 100);
  return { lines, once, yearly, sitePages, total, deposit, balance: total - deposit, yearTotal: yearly.reduce((s, l) => s + l.amount_cents, 0) };
}

const lineTitle = (l) => l.label + (l.unit && (l.quantity > 1 || l.kind === 'annuel') ? ' × ' + plural(l.quantity, l.unit) : '');

// ---------- Le formulaire d'un client ----------
function clientForm(ctx, client) {
  const c = client || { kind: sw.clientKind };
  const kind = client ? client.kind : sw.clientKind;
  const inputs = {};
  const field = (k, label, opts = {}) => {
    const input = el('input', { class: 'bz-input', autocomplete: 'off', type: opts.type || 'text', value: c[k] || '' });
    inputs[k] = input;
    return el('label', { class: 'bz-field' + (opts.wide ? ' bl-wide' : '') }, el('span', { class: 'bz-label', text: label }), input);
  };
  const key = client ? 'client:' + client.id : 'client:new';
  const kinds = client ? null : el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Type de client' },
    [['particulier', 'Particulier'], ['pro', 'Professionnel']].map(([id, label]) => el('button', {
      class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(kind === id), onclick: () => { sw.clientKind = id; ctx.rerender(); }
    }, label)));
  const grid = el('div', { class: 'bl-form-grid' },
    kind === 'particulier' ? [field('first_name', 'Prénom'), field('last_name', 'Nom')] : [field('name', 'Raison sociale'), field('siren', 'SIREN ou SIRET')],
    field('email', 'E-mail', { type: 'email' }), field('phone', 'Téléphone'),
    field('street', 'Numéro et rue', { wide: true }), field('postal_code', 'Code postal'), field('city', 'Ville'));
  const save = () => {
    const body = client ? {} : { kind };
    for (const [k, input] of Object.entries(inputs)) body[k] = input.value.trim();
    act(key, () => (client
      ? call('/admin/studio/clients/' + encodeURIComponent(client.id), { method: 'PATCH', body })
      : call('/admin/studio/clients', { method: 'POST', body })), ctx, client ? 'Fiche client enregistrée.' : 'Client ajouté.')
      .then((r) => {
        if (!r) return;
        if (!client) { sw.draft.clientId = r.id; sw.newClient = false; } else sw.editingClient = null;
        ctx.rerender();
      });
  };
  return el('div', { class: 'bl-form', style: { marginTop: '0', paddingTop: '0', borderTop: '0' } },
    kinds, el('div', { style: { height: kinds ? '10px' : '0' } }), grid,
    el('p', { class: 'bz-tiny bz-muted', style: { margin: '8px 0 0' }, text: 'Qonto exige l’e-mail et l’adresse complète' + (kind === 'particulier' ? ', et le prénom d’un particulier' : '') + ' avant le premier devis.' }),
    el('div', { class: 'bz-row', style: { justifyContent: 'flex-end', marginTop: '10px' } },
      btn('Annuler', () => { sw.newClient = false; sw.editingClient = null; ctx.rerender(); }),
      btn(sw.busy.has(key) ? 'Enregistrement…' : 'Enregistrer', save, { tone: 'violet', disabled: sw.busy.has(key) })));
}

// ---------- Nouveau devis ----------
function stepper(value, onChange) {
  return el('span', { class: 'st-step' },
    el('button', { type: 'button', 'aria-label': 'Moins', text: '−', onclick: () => onChange(Math.max(1, value - 1)) }),
    el('span', { text: String(value) }),
    el('button', { type: 'button', 'aria-label': 'Plus', text: '+', onclick: () => onChange(Math.min(99, value + 1)) }));
}

function quoteView(ctx, canWrite) {
  const d = sw.data;
  const dr = sw.draft;
  const catalog = d.catalog;
  const calc = compute(catalog, dr);
  const clients = d.clients.filter((c) => !c.archived);
  const client = clients.find((c) => c.id === dr.clientId) || null;

  // Client
  const select = el('select', { class: 'bz-input', 'aria-label': 'Client', onchange: (e) => { dr.clientId = e.target.value; ctx.rerender(); } },
    el('option', { value: '', text: clients.length ? 'Choisis un client' : 'Aucun client pour l’instant' }),
    clients.map((c) => el('option', { value: c.id, text: c.name + (c.kind === 'pro' ? ' · pro' : ''), selected: c.id === dr.clientId })));
  const clientCard = el('section', { class: 'bz-card st-card' },
    el('div', { class: 'st-card-head' }, el('h3', { class: 'bz-h3', text: 'Client' }),
      canWrite && !sw.newClient ? btn('Nouveau client', () => { sw.newClient = true; ctx.rerender(); }) : null),
    sw.newClient ? clientForm(ctx, null) : el('div', { class: 'st-client' }, select,
      client ? el('span', { class: 'bz-tiny ' + (client.missing_for_qonto.length ? 'bl-warn' : 'bz-muted'), text: client.missing_for_qonto.length ? 'Fiche à compléter : il manque ' + client.missing_for_qonto.join(' et ') + '.' : [client.email, [client.postal_code, client.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ') }) : null));

  // Formules
  const formulas = catalog.filter((i) => i.kind === 'formule' && i.active);
  const baseCard = el('section', { class: 'bz-card st-card' },
    el('h3', { class: 'bz-h3', text: 'Formule de base' }),
    el('div', { class: 'st-bases' }, formulas.map((f) => el('button', {
      class: 'st-base' + (dr.base === f.key ? ' is-on' : ''), type: 'button', 'aria-pressed': String(dr.base === f.key),
      onclick: () => { dr.base = f.key; ctx.rerender(); }
    }, el('span', { class: 'st-base-top' }, el('b', { text: f.label }), el('span', { class: 'st-money', text: (f.key === 'custom' ? 'dès ' : '') + eur(f.price_cents) })),
    el('small', { text: f.description || '' })))));

  const optionRow = (item) => {
    const qty = Math.floor(Number(dr.items[item.key]) || 0);
    const on = qty > 0;
    const shownQty = item.key === 'edits' && calc ? Math.min(qty || calc.sitePages, calc.sitePages) : (qty || 1);
    const toggle = () => { dr.items[item.key] = on ? 0 : (item.key === 'edits' && calc ? calc.sitePages : 1); ctx.rerender(); };
    return el('div', { class: 'st-opt' },
      el('button', { class: 'st-box' + (on ? ' is-on' : ''), type: 'button', role: 'checkbox', 'aria-checked': String(on), 'aria-label': item.label, text: on ? '✓' : '', onclick: toggle }),
      el('span', { class: 'st-opt-main' }, el('span', { text: item.label }), el('small', { text: [item.description, includedText(item.included_pages)].filter(Boolean).join(', ') })),
      on && item.unit ? stepper(shownQty, (n) => { dr.items[item.key] = item.key === 'edits' && calc ? Math.min(n, calc.sitePages) : n; ctx.rerender(); }) : null,
      el('span', { class: 'st-money st-opt-price', text: eur(item.price_cents * (on && item.unit ? shownQty : 1)) + (item.kind === 'annuel' ? ' / an' : '') + (item.unit && !on ? ' / ' + item.unit : '') }));
  };
  const options = el('section', { class: 'bz-card st-card' },
    el('h3', { class: 'bz-h3', text: 'Options à la commande' }), el('p', { class: 'bz-tiny bz-muted st-sub', text: 'Payées une fois, avec le site' }),
    catalog.filter((i) => i.kind === 'option' && i.active).map(optionRow));
  const yearly = el('section', { class: 'bz-card st-card' },
    el('h3', { class: 'bz-h3', text: 'Services annuels' }), el('p', { class: 'bz-tiny bz-muted st-sub', text: 'Dès la livraison, refacturés chaque année. Après la livraison, une modification se facture à la page modifiée, depuis la fiche du client.' }),
    catalog.filter((i) => i.kind === 'annuel' && i.active).map(optionRow));

  // Récapitulatif
  const lineRow = (l) => {
    const input = el('input', { class: 'st-price' + (l.edited ? ' is-edited' : ''), type: 'number', min: '0', step: '1', value: String(Math.round(l.amount_cents / 100)), 'aria-label': 'Prix de ' + l.label,
      onchange: (e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) { dr.overrides[l.key] = Math.round(v * 100); ctx.rerender(); } } });
    return el('div', { class: 'st-line' },
      el('span', { text: lineTitle(l) + (l.kind === 'annuel' ? ' / an' : '') }),
      l.edited ? el('button', { class: 'st-reset', type: 'button', title: 'Revenir au prix du catalogue (' + eur(l.catalog_cents) + ')', text: '↺', onclick: () => { delete dr.overrides[l.key]; ctx.rerender(); } }) : null,
      input, el('span', { class: 'bz-tiny bz-muted', text: '€' }));
  };
  const missing = !client ? ['le client'] : client.missing_for_qonto;
  const createKey = 'quote:new';
  const recap = el('section', { class: 'bz-card st-recap' },
    el('div', { class: 'st-card-head' }, el('h3', { class: 'bz-h3', text: 'Devis' }), el('span', { class: 'bz-pill is-grey', text: 'À créer' })),
    el('p', { class: 'bz-tiny bz-muted st-sub', text: 'Valable 30 jours · numéroté par Qonto' }),
    calc ? [
      el('div', { class: 'st-lines' }, calc.once.map(lineRow)),
      el('div', { class: 'st-total' }, el('b', { text: 'Total à la commande' }), el('span', { class: 'st-money st-big', text: eur(calc.total) })),
      el('div', { class: 'st-split' },
        el('div', { class: 'st-line' }, el('span', { text: 'Acompte à la signature' }),
          el('span', { class: 'st-step' },
            el('button', { type: 'button', 'aria-label': 'Moins', text: '−', onclick: () => { dr.depositPct = Math.max(0, dr.depositPct - 5); ctx.rerender(); } }),
            el('span', { text: dr.depositPct + ' %' }),
            el('button', { type: 'button', 'aria-label': 'Plus', text: '+', onclick: () => { dr.depositPct = Math.min(50, dr.depositPct + 5); ctx.rerender(); } })),
          el('b', { class: 'st-money', text: eur(calc.deposit) })),
        el('div', { class: 'st-line' }, el('span', { text: 'Solde à la livraison' }), el('b', { class: 'st-money', text: eur(calc.balance) }))),
      calc.yearly.length ? el('div', { class: 'st-yearly' },
        calc.yearly.map(lineRow),
        el('div', { class: 'st-line st-year-total' }, el('b', { text: 'Puis chaque année, dès la livraison' }), el('b', { class: 'st-money', text: eur(calc.yearTotal) + ' / an' }))) : null,
      el('p', { class: 'bz-tiny', style: { margin: '0', color: 'var(--soft-violet-text)' }, text: INCLUDED }),
      el('p', { class: 'bz-tiny bz-muted', style: { margin: '0' }, text: 'TVA non applicable, art. 293 B du CGI. Chaque prix se corrige à la main pour ce devis ; ↺ revient au catalogue.' + (client && client.kind === 'particulier' ? ' Particulier : 14 jours de rétractation après signature, sauf demande écrite de commencer avant.' : '') }),
      el('button', {
        class: 'bz-btn is-violet', type: 'button', style: { width: '100%' },
        disabled: !canWrite || !d.qonto.configured || missing.length > 0 || sw.busy.has(createKey),
        title: !canWrite ? 'Réservé aux super admins' : !d.qonto.configured ? 'Qonto n’est pas branché sur le serveur' : missing.length ? 'Il manque ' + missing.join(' et ') : '',
        text: sw.busy.has(createKey) ? 'Création chez Qonto…' : 'Créer le devis chez Qonto',
        onclick: () => act(createKey, () => call('/admin/studio/quotes', {
          method: 'POST', body: { client_id: dr.clientId, base: dr.base, items: dr.items, overrides: dr.overrides, deposit_pct: dr.depositPct }
        }), ctx, (r) => 'Devis ' + (r && r.number ? r.number + ' ' : '') + 'créé en brouillon chez Qonto.').then((r) => {
          if (!r) return;
          dr.overrides = {};
          sw.view = 'projects';
          sw.openQuote = r.id;
          ctx.rerender();
        })
      }),
      el('p', { class: 'bz-tiny bz-muted', style: { margin: '0' }, text: 'Il part en brouillon : relis-le dans « Devis et projets », puis « Envoyer au client ».' })
    ] : el('p', { class: 'bz-small bz-muted', text: 'Choisis une formule de base.' }));

  return el('div', { class: 'st-quote' },
    el('div', { class: 'st-col' }, clientCard, baseCard, el('div', { class: 'st-two' }, options, yearly)),
    recap);
}

// ---------- Factures d'un devis ou d'un contrat ----------
function invoiceRows(invoices, ctx, canWrite) {
  return invoices.map((inv) => {
    const [label, cls] = INVOICE_STATUS[inv.status] || [inv.status, 'bz-pill'];
    const late = inv.status === 'unpaid' && inv.due_date < today();
    const k = (s) => s + ':' + inv.id;
    const actions = [];
    if (inv.status === 'draft' && canWrite) {
      actions.push(btn(sw.busy.has(k('fin')) ? 'Finalisation…' : 'Finaliser', async () => {
        const ok = await ctx.ask({ title: 'Finaliser cette facture ?', text: (PURPOSE[inv.purpose] || 'Facture') + ' · ' + eur(inv.amount_cents) + '. Qonto la numérote et la rend payable en ligne. Une facture finalisée ne s’efface plus : elle ne peut qu’être annulée.', confirmLabel: 'Finaliser' });
        if (ok) act(k('fin'), () => call('/admin/facturation/invoices/' + encodeURIComponent(inv.id) + '/finalize', { method: 'POST' }), ctx, (r) => 'Facture ' + (r && r.number ? r.number + ' ' : '') + 'finalisée.');
      }, { tone: 'violet', disabled: sw.busy.has(k('fin')) }));
    }
    if (inv.invoice_url && inv.status === 'unpaid') {
      actions.push(btn('Copier le lien de paiement', async () => {
        try { await navigator.clipboard.writeText(inv.invoice_url); ctx.toast('Lien de paiement copié.'); } catch { ctx.toast('Copie impossible depuis ce navigateur.', 'note'); }
      }));
    }
    if (inv.status !== 'draft') {
      actions.push(btn('PDF', () => act(k('pdf'), () => call('/admin/facturation/invoices/' + encodeURIComponent(inv.id) + '/pdf'), ctx).then((r) => { if (r && r.url) window.open(r.url, '_blank', 'noopener'); })));
    }
    if (inv.status === 'unpaid' && canWrite) {
      actions.push(btn('Annuler', async () => {
        const v = await ctx.ask({ title: 'Annuler la facture ' + (inv.number || '') + ' ?', text: 'Irréversible chez Qonto : la facture reste numérotée, marquée annulée.', fields: [{ name: 'reason', label: 'Motif (inscrit au journal)', required: true }], confirmLabel: 'Annuler la facture', tone: 'red' });
        if (v) act(k('cancel'), () => call('/admin/facturation/invoices/' + encodeURIComponent(inv.id) + '/cancel', { method: 'POST', body: { reason: v.reason } }), ctx, 'Facture annulée.');
      }, { tone: 'red' }));
    }
    return el('div', { class: 'bl-inv' + (late ? ' is-late' : '') },
      el('span', { class: 'bl-inv-main' }, el('b', { text: (PURPOSE[inv.purpose] || 'Facture') + ' · ' + (inv.number || 'brouillon') }), el('small', { text: inv.label })),
      el('span', { class: 'bl-inv-dates' }, el('small', { text: 'émise ' + dayFr(inv.issue_date) }),
        el('small', { class: late ? 'bl-late' : '', text: inv.status === 'paid' && inv.paid_at ? 'payée ' + dateShort(inv.paid_at) : (late ? 'en retard · ' : 'échéance ') + dayFr(inv.due_date) })),
      el('b', { class: 'bl-inv-amount', text: eur(inv.amount_cents) }),
      el('span', { class: cls, text: label }),
      el('span', { class: 'bl-inv-actions' }, actions));
  });
}

// ---------- Modifications après la livraison ----------
// Une demande traitée : les pages incluses dans la Formule Sérénité du client
// sont décomptées d'abord, le reste est facturé à la page modifiée, en
// brouillon chez Qonto (POST /admin/studio/clients/:id/modifications).
async function billModifications(client, ctx) {
  const contract = sw.data.contracts.find((c) => c.client_id === client.id && !c.archived && c.included_pages > 0);
  const left = contract ? Math.max(0, contract.included_pages - contract.pages_used) : 0;
  const price = (key) => (sw.data.catalog.find((i) => i.key === key) || {}).price_cents;
  const unit = contract ? price('modif-serenite') : price('modif');
  const v = await ctx.ask({
    title: 'Modifications pour ' + client.name,
    text: (contract ? 'Formule Sérénité : ' + plural(left, 'page') + ' incluse' + (left > 1 ? 's' : '') + ' restante' + (left > 1 ? 's' : '') + ' cette année, puis ' : 'Sans Formule Sérénité : ') + (unit ? eur(unit) : '—') + ' par page modifiée, toutes les retouches de la page comprises. Ce qui reste à payer part en brouillon chez Qonto.',
    fields: [{ name: 'pages', label: 'Nombre de pages modifiées', required: true, placeholder: '1' }, { name: 'detail', label: 'Quelles pages (écrit sur la facture)', placeholder: 'Accueil, Contact' }],
    confirmLabel: 'Enregistrer'
  });
  if (!v) return;
  act('modif:' + client.id, () => call('/admin/studio/clients/' + encodeURIComponent(client.id) + '/modifications', { method: 'POST', body: { pages: v.pages, detail: v.detail } }), ctx,
    (r) => (!r ? '' : r.billed ? plural(r.billed, 'page') + ' à facturer (' + eur(r.amount_cents) + ') : brouillon créé chez Qonto' + (r.covered ? ', ' + plural(r.covered, 'page') + ' incluse' + (r.covered > 1 ? 's' : '') + ' dans la Sérénité.' : '.') : plural(r.covered, 'page') + ' incluse' + (r.covered > 1 ? 's' : '') + ' dans la Formule Sérénité : rien à facturer.'));
}

// ---------- Devis et projets ----------
function quoteCard(q, ctx, canWrite) {
  const [label, cls] = QUOTE_STATUS[q.status] || [q.status, 'bz-pill'];
  const open = sw.openQuote === q.id;
  const k = (s) => s + ':' + q.id;
  const actions = [];
  if (canWrite && (q.status === 'draft' || q.status === 'sent')) {
    actions.push(btn(sw.busy.has(k('send')) ? 'Envoi…' : q.status === 'draft' ? 'Envoyer au client' : 'Renvoyer', async () => {
      const ok = await ctx.ask({ title: 'Envoyer le devis ' + (q.number || '') + ' ?', text: 'Qonto l’envoie par e-mail à ' + q.client_name + ', avec une copie pour toi.', confirmLabel: 'Envoyer' });
      if (ok) act(k('send'), () => call('/admin/studio/quotes/' + encodeURIComponent(q.id) + '/send', { method: 'POST' }), ctx, 'Devis envoyé au client.');
    }, { tone: q.status === 'draft' ? 'violet' : null, disabled: sw.busy.has(k('send')) }));
    actions.push(btn('Accepté', async () => {
      const ok = await ctx.ask({ title: 'Le client a accepté ?', text: q.deposit_cents ? 'La facture d’acompte de ' + eur(q.deposit_cents) + ' (' + q.deposit_pct + ' %) est créée en brouillon chez Qonto.' : 'Aucun acompte prévu : rien n’est facturé avant la livraison.', confirmLabel: 'Oui, accepté', tone: 'green' });
      if (ok) act(k('acc'), () => call('/admin/studio/quotes/' + encodeURIComponent(q.id) + '/accept', { method: 'POST' }), ctx, q.deposit_cents ? 'Devis accepté : acompte créé en brouillon.' : 'Devis accepté.');
    }, { disabled: sw.busy.has(k('acc')) }));
    actions.push(btn('Refusé', async () => {
      const ok = await ctx.ask({ title: 'Le client a refusé ?', text: 'Le devis est classé refusé. Rien n’est facturé.', confirmLabel: 'Classer refusé', tone: 'red' });
      if (ok) act(k('ref'), () => call('/admin/studio/quotes/' + encodeURIComponent(q.id) + '/refuse', { method: 'POST' }), ctx, 'Devis classé refusé.');
    }));
  }
  if (canWrite && q.status === 'accepted') {
    actions.push(btn(sw.busy.has(k('del')) ? 'Création…' : 'Site livré', async () => {
      const deposit = q.invoices.find((i) => i.purpose === 'deposit' && i.status !== 'canceled');
      const ok = await ctx.ask({
        title: 'Le site est livré ?',
        text: 'Créés en brouillon chez Qonto : la facture du solde (' + eur(q.total_cents - (deposit ? deposit.amount_cents : 0)) + ')' + (q.yearly_cents ? ', et la première année des services annuels (' + eur(q.yearly_cents) + '), avec le contrat qui les refacturera chaque année.' : '.'),
        confirmLabel: 'Oui, livré', tone: 'green'
      });
      if (ok) act(k('del'), () => call('/admin/studio/quotes/' + encodeURIComponent(q.id) + '/deliver', { method: 'POST' }), ctx, 'Livraison notée : factures créées en brouillon.');
    }, { tone: 'violet', disabled: sw.busy.has(k('del')) }));
  }
  actions.push(btn('PDF', () => act(k('pdf'), () => call('/admin/studio/quotes/' + encodeURIComponent(q.id) + '/pdf'), ctx).then((r) => { if (r && r.url) window.open(r.url, '_blank', 'noopener'); })));
  const next = q.status === 'draft' ? 'À relire, puis à envoyer'
    : q.status === 'sent' ? (q.expired ? 'Expiré le ' + dayFr(q.valid_until) : 'Envoyé le ' + dateShort(q.sent_at) + ' · valable jusqu’au ' + dayFr(q.valid_until))
      : q.status === 'accepted' ? 'Accepté le ' + dateShort(q.accepted_at) + ' · à livrer'
        : q.status === 'delivered' ? 'Livré le ' + dateShort(q.delivered_at) : q.status === 'refused' ? 'Refusé le ' + dateShort(q.refused_at) : '';
  return el('section', { class: 'bz-card bl-partner' },
    el('div', { class: 'bl-partner-head' },
      el('button', { class: 'st-quote-title', type: 'button', 'aria-expanded': String(open), onclick: () => { sw.openQuote = open ? null : q.id; ctx.rerender(); } },
        el('b', { text: q.client_name || 'Client' }), el('span', { class: 'bz-tiny bz-muted', text: (q.number || 'Brouillon') + ' · ' + eur(q.total_cents) + (q.yearly_cents ? ' + ' + eur(q.yearly_cents) + ' / an' : '') }),
        el('span', { class: cls, text: label }), q.expired ? el('span', { class: 'bz-pill is-red', text: 'Expiré' }) : null),
      el('span', { class: 'bl-inv-actions' }, actions)),
    el('p', { class: 'bz-tiny bz-muted', style: { margin: '2px 0 0' }, text: next }),
    open ? el('div', { class: 'st-detail' },
      (q.lines || []).map((l) => el('div', { class: 'st-line' }, el('span', { text: lineTitle(l) + (l.kind === 'annuel' ? ' / an' : '') }), el('span', { class: 'st-money', text: eur(l.amount_cents) })))) : null,
    q.invoices.length ? el('div', { class: 'bl-invs' }, invoiceRows(q.invoices, ctx, canWrite)) : null);
}

function projectsView(ctx, canWrite) {
  const quotes = sw.data.quotes;
  if (!quotes.length) return el('section', { class: 'bz-card' }, el('p', { class: 'bz-small bz-muted', style: { margin: '0' }, text: 'Aucun devis pour l’instant : compose le premier dans « Nouveau devis ».' }));
  const order = { accepted: 0, sent: 1, draft: 2, delivered: 3, refused: 4, canceled: 5 };
  return el('div', { class: 'bl' }, [...quotes].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)).map((q) => quoteCard(q, ctx, canWrite)));
}

// ---------- Contrats annuels ----------
function contractsView(ctx, canWrite) {
  const list = sw.data.contracts;
  if (!list.length) return el('section', { class: 'bz-card' }, el('p', { class: 'bz-small bz-muted', style: { margin: '0' }, text: 'Aucun contrat : ils naissent à la livraison d’un devis qui a des services annuels.' }));
  return el('div', { class: 'bl' }, list.map((c) => {
    const soon = !c.archived && c.due_in_days <= 30;
    const k = 'renew:' + c.id;
    return el('section', { class: 'bz-card bl-partner' + (c.archived ? ' is-archived' : '') },
      el('div', { class: 'bl-partner-head' },
        el('div', { class: 'bl-partner-title' }, el('h3', { class: 'bz-h3', text: c.client_name || 'Client' }),
          el('span', { class: 'bz-tiny bz-muted', text: c.label }),
          c.archived ? el('span', { class: 'bz-pill is-grey', text: 'Arrêté' }) : el('span', { class: soon ? 'bz-pill is-amber' : 'bz-pill is-grey', text: c.due_in_days < 0 ? 'échu depuis ' + plural(-c.due_in_days, 'jour') : 'échéance ' + dayFr(c.next_due_on) })),
        el('span', { class: 'bl-inv-actions' },
          el('b', { class: 'bl-inv-amount', text: eur(c.amount_cents) + ' / an' }),
          canWrite && !c.archived ? btn('Facturer des modifications', () => billModifications({ id: c.client_id, name: c.client_name }, ctx)) : null,
          canWrite && !c.archived ? btn(sw.busy.has(k) ? 'Création…' : 'Facturer le renouvellement', async () => {
            const ok = await ctx.ask({ title: 'Facturer le renouvellement ?', text: c.label + ' · ' + eur(c.amount_cents) + ' pour ' + c.client_name + '. La facture est créée en brouillon chez Qonto, et l’échéance passe au ' + dayFr(c.next_due_on.replace(/^(\d{4})/, (y) => String(Number(y) + 1))) + '.', confirmLabel: 'Créer la facture' });
            if (ok) act(k, () => call('/admin/studio/contracts/' + encodeURIComponent(c.id) + '/renew', { method: 'POST' }), ctx, 'Renouvellement créé en brouillon.');
          }, { tone: soon ? 'violet' : null, disabled: sw.busy.has(k) }) : null,
          canWrite ? btn(c.archived ? 'Reprendre' : 'Arrêter', async () => {
            const ok = c.archived || await ctx.ask({ title: 'Arrêter ce contrat ?', text: 'Le client ne renouvelle pas : la console ne proposera plus de le facturer.', confirmLabel: 'Arrêter', tone: 'red' });
            if (ok) act('stop:' + c.id, () => call('/admin/studio/contracts/' + encodeURIComponent(c.id), { method: 'PATCH', body: { archived: !c.archived } }), ctx, c.archived ? 'Contrat repris.' : 'Contrat arrêté.');
          }) : null)),
      c.included_pages ? el('p', { class: 'bz-tiny ' + (c.pages_used >= c.included_pages ? 'bl-warn' : 'bz-muted'), style: { margin: '4px 0 0' }, text: 'Pages modifiées cette année : ' + c.pages_used + ' sur ' + c.included_pages + ' incluses' + (c.pages_used >= c.included_pages ? ' · les suivantes au tarif Sérénité' : '') }) : null,
      c.invoices.length ? el('div', { class: 'bl-invs' }, invoiceRows(c.invoices, ctx, canWrite)) : null);
  }));
}

// ---------- Clients ----------
function clientsView(ctx, canWrite) {
  const list = sw.data.clients;
  return el('div', { class: 'bl' },
    canWrite && !sw.newClient ? el('div', { class: 'bl-toolbar' }, el('span'), btn('Nouveau client', () => { sw.newClient = true; ctx.rerender(); }, { tone: 'violet' })) : null,
    sw.newClient ? el('section', { class: 'bz-card bl-partner' }, el('h3', { class: 'bz-h3', text: 'Nouveau client' }), clientForm(ctx, null)) : null,
    list.length ? list.map((c) => (sw.editingClient === c.id
      ? el('section', { class: 'bz-card bl-partner' }, el('h3', { class: 'bz-h3', text: 'Modifier · ' + c.name }), clientForm(ctx, c))
      : el('section', { class: 'bz-card bl-partner' + (c.archived ? ' is-archived' : '') },
        el('div', { class: 'bl-partner-head' },
          el('div', { class: 'bl-partner-title' }, el('h3', { class: 'bz-h3', text: c.name }),
            el('span', { class: 'bz-pill is-grey', text: c.kind === 'pro' ? 'Professionnel' : 'Particulier' }),
            c.qonto_linked ? el('span', { class: 'bz-pill is-green', text: 'Qonto' }) : null),
          el('span', { class: 'bl-inv-actions' },
            btn('Nouveau devis', () => { sw.draft.clientId = c.id; sw.view = 'quote'; ctx.rerender(); window.scrollTo({ top: 0 }); }),
            canWrite ? btn('Facturer des modifications', () => billModifications(c, ctx)) : null,
            canWrite ? btn('Modifier', () => { sw.editingClient = c.id; ctx.rerender(); }) : null)),
        el('p', { class: 'bz-small bz-muted bl-partner-meta', text: [c.email, c.phone, [c.street, c.postal_code, c.city].filter(Boolean).join(' '), c.siren ? 'SIREN ' + c.siren : null].filter(Boolean).join(' · ') || 'Fiche à compléter' }),
        c.missing_for_qonto.length ? el('p', { class: 'bz-tiny bl-warn', style: { margin: '2px 0 0' }, text: 'Avant le premier devis, il manque ' + c.missing_for_qonto.join(' et ') + '.' }) : null,
        c.qonto_linked ? el('p', { class: 'bz-tiny bz-muted', style: { margin: '2px 0 0' }, text: 'Une correction ici ne change pas la fiche déjà créée chez Qonto : corrige-la aussi dans Qonto.' }) : null)))
      : el('section', { class: 'bz-card' }, el('p', { class: 'bz-small bz-muted', style: { margin: '0' }, text: 'Aucun client pour l’instant.' })));
}

// ---------- Catalogue ----------
const KIND = { formule: ['Formule', 'bz-pill is-violet'], option: ['Option', 'bz-pill is-grey'], annuel: ['Annuel', 'bz-pill is-green'], acte: ['À l’acte', 'bz-pill is-amber'] };

// La grille tarifaire : un PDF tiré du catalogue par le serveur. Téléchargé
// avec la session (fetch), puis enregistré par le navigateur.
async function downloadGrid(lang, ctx) {
  const key = 'grid:' + lang;
  sw.busy.add(key);
  ctx.rerender();
  try {
    const s = session();
    const res = await fetch(API + '/admin/studio/pricing.pdf?lang=' + lang, { headers: s ? { Authorization: 'Bearer ' + s.token } : {} });
    if (!res.ok) throw new Error('Grille indisponible (HTTP ' + res.status + ').');
    const url = URL.createObjectURL(await res.blob());
    const a = el('a', { href: url, download: (lang === 'en' ? 'price-list-' : 'grille-tarifaire-') + today() + '.pdf' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    ctx.toast(lang === 'en' ? 'Grille tarifaire en anglais téléchargée.' : 'Grille tarifaire téléchargée.');
  } catch (e) {
    ctx.toast(e.message, 'err');
  } finally {
    sw.busy.delete(key);
    ctx.rerender();
  }
}

// Le formulaire d'une prestation : création (item absent) ou modification.
function itemForm(ctx, item) {
  const kind = item ? item.kind : sw.newItemKind;
  const inputs = {};
  const field = (k, label, value, opts = {}) => {
    const input = el('input', { class: 'bz-input', autocomplete: 'off', type: opts.type || 'text', value: value ?? '', inputmode: opts.inputmode || null });
    inputs[k] = input;
    return el('label', { class: 'bz-field' + (opts.wide ? ' bl-wide' : '') }, el('span', { class: 'bz-label', text: label }), input);
  };
  let unit = null;
  const kinds = item ? null : el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Type de prestation' },
    [['formule', 'Formule'], ['option', 'Option'], ['annuel', 'Service annuel'], ['acte', 'À l’acte']].map(([id, label]) => el('button', {
      class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(kind === id), onclick: () => { sw.newItemKind = id; ctx.rerender(); }
    }, label)));
  if (!item && kind !== 'formule') {
    unit = el('select', { class: 'bz-input', 'aria-label': 'Unité' },
      el('option', { value: '', text: 'Prix fixe' }), el('option', { value: 'page', text: 'Par page' }), el('option', { value: 'langue', text: 'Par langue' }));
  }
  const key = item ? 'item:' + item.key : 'item:new';
  const save = () => {
    const body = {};
    for (const [k, input] of Object.entries(inputs)) body[k] = input.value.trim();
    if (!item) { body.kind = kind; if (unit) body.unit = unit.value; }
    act(key, () => (item
      ? call('/admin/studio/catalog/' + encodeURIComponent(item.key), { method: 'PATCH', body })
      : call('/admin/studio/catalog', { method: 'POST', body })), ctx, item ? 'Prestation enregistrée.' : 'Prestation ajoutée au catalogue.')
      .then((r) => { if (r) { sw.editingItem = null; ctx.rerender(); } });
  };
  return el('section', { class: 'bz-card bl-partner' },
    el('h3', { class: 'bz-h3', text: item ? 'Modifier · ' + item.label : 'Nouvelle prestation' }),
    kinds,
    el('div', { class: 'bl-form-grid', style: { marginTop: '10px' } },
      field('label', 'Libellé (français)', item && item.label),
      field('label_en', 'Libellé (anglais, pour la grille)', item && item.label_en),
      field('description', 'Ce qui est inclus (français)', item && item.description, { wide: true }),
      field('description_en', 'Ce qui est inclus (anglais)', item && item.description_en, { wide: true }),
      field('price', 'Prix (€' + (kind === 'annuel' ? ' par an' : '') + ')', item ? String(item.price_cents / 100).replace('.', ',') : '', { inputmode: 'decimal' }),
      unit ? el('label', { class: 'bz-field' }, el('span', { class: 'bz-label', text: 'Unité' }), unit) : null,
      !item && kind === 'formule' ? field('base_pages', 'Pages comprises', '5', { type: 'number' }) : null,
      kind === 'annuel' ? field('included_pages', 'Pages modifiées incluses par an', item && item.included_pages ? String(item.included_pages) : '', { type: 'number' }) : null),
    el('p', { class: 'bz-tiny bz-muted', style: { margin: '8px 0 0' }, text: 'Sans libellé anglais, la grille anglaise reprend le français. ' + (item ? 'Le type et l’unité d’une prestation existante ne changent pas : un devis s’appuie dessus.' : 'Une option « par page » ou « par langue » aura un compteur dans le devis.') }),
    el('div', { class: 'bz-row', style: { justifyContent: 'flex-end', marginTop: '10px' } },
      btn('Annuler', () => { sw.editingItem = null; ctx.rerender(); }),
      btn(sw.busy.has(key) ? 'Enregistrement…' : 'Enregistrer', save, { tone: 'violet', disabled: sw.busy.has(key) })));
}

function catalogView(ctx, canWrite) {
  const editing = sw.editingItem && sw.editingItem !== 'new' ? sw.data.catalog.find((i) => i.key === sw.editingItem) : null;
  return el('div', { class: 'bl' },
    el('div', { class: 'bl-toolbar' },
      el('div', { class: 'bz-row', style: { gap: '8px', flexWrap: 'wrap' } },
        btn(sw.busy.has('grid:fr') ? 'Préparation…' : 'Grille tarifaire · français', () => downloadGrid('fr', ctx), { tone: 'violet', disabled: sw.busy.has('grid:fr') }),
        btn(sw.busy.has('grid:en') ? 'Préparation…' : 'Grille tarifaire · anglais', () => downloadGrid('en', ctx), { disabled: sw.busy.has('grid:en') })),
      canWrite && !sw.editingItem ? btn('Nouvelle prestation', () => { sw.editingItem = 'new'; ctx.rerender(); }) : null),
    sw.editingItem === 'new' ? itemForm(ctx, null) : editing ? itemForm(ctx, editing) : null,
    el('section', { class: 'bz-card', style: { padding: '0', overflow: 'hidden' } },
      el('div', { class: 'bz-table-wrap' }, el('table', { class: 'bz-table' },
        el('thead', {}, el('tr', {}, el('th', { text: 'Prestation' }), el('th', { text: 'Type' }), el('th', { text: 'Ce qui est inclus' }), el('th', { class: 'is-num', text: 'Prix' }), el('th', { text: 'Proposée' }), el('th'))),
        el('tbody', {}, sw.data.catalog.map((i) => {
          const [kl, kc] = KIND[i.kind] || [i.kind, 'bz-pill'];
          const unitText = (i.kind === 'annuel' ? '€ / an' : '€') + (i.kind === 'acte' && i.unit === 'page' ? ' par page modifiée' : i.unit ? ' par ' + i.unit : '');
          const input = el('input', { class: 'st-price', type: 'number', min: '0', step: '1', value: String(i.price_cents / 100), disabled: !canWrite, 'aria-label': 'Prix de ' + i.label,
            onchange: (e) => act('cat:' + i.key, () => call('/admin/studio/catalog/' + encodeURIComponent(i.key), { method: 'PATCH', body: { price: e.target.value } }), ctx, i.label + ' : prix enregistré.') });
          return el('tr', { class: i.active ? '' : 'st-off' },
            el('td', {}, el('b', { style: { fontFamily: 'var(--font-ui)' }, text: i.label }), el('div', { class: 'bz-tiny ' + (i.label_en ? 'bz-muted' : 'bl-warn'), text: i.label_en ? 'EN · ' + i.label_en : 'Pas de libellé anglais' })),
            el('td', {}, el('span', { class: kc, text: kl }), i.base_pages ? el('div', { class: 'bz-tiny bz-muted', text: plural(i.base_pages, 'page') }) : null),
            el('td', { class: 'bz-muted', text: [i.description, includedText(i.included_pages)].filter(Boolean).join(', ') }),
            el('td', { class: 'is-num' }, el('span', { class: 'st-price-cell' }, input, el('span', { class: 'bz-tiny bz-muted', text: unitText }))),
            el('td', {}, el('input', { type: 'checkbox', checked: i.active, disabled: !canWrite, 'aria-label': 'Proposer ' + i.label,
              onchange: (e) => act('cat:' + i.key, () => call('/admin/studio/catalog/' + encodeURIComponent(i.key), { method: 'PATCH', body: { active: e.target.checked } }), ctx, e.target.checked ? i.label + ' : de nouveau proposée.' : i.label + ' : retirée des nouveaux devis et de la grille.') })),
            el('td', { class: 'is-num' }, canWrite ? btn('Modifier', () => { sw.editingItem = i.key; ctx.rerender(); window.scrollTo({ top: 0, behavior: 'smooth' }); }) : null));
        }))))),
    el('p', { class: 'bz-tiny bz-muted', text: 'La grille tarifaire reprend les prestations proposées, à leur prix du jour. Un prix changé vaut pour les nouveaux devis : un devis déjà créé garde les siens.' }));
}

// ---------- La vue ----------
export function renderStudio(ctx) {
  if (sw.status === 'idle') { sw.status = 'loading'; load(ctx.rerender); }
  if (sw.status === 'loading') return el('div', { class: 'bl' }, el('div', { class: 'bz-skeleton', style: { height: '80px' } }), el('div', { class: 'bz-skeleton', style: { height: '360px', marginTop: '12px' } }));
  if (sw.status === 'absent') return el('section', { class: 'bz-card' }, el('b', { text: 'Sites web : pas encore en ligne sur le serveur' }), el('p', { class: 'bz-small bz-muted', text: 'Réessaie après le prochain déploiement.' }));
  if (sw.status === 'error') return el('div', { class: 'bz-msg is-err', role: 'alert' }, 'Sites web indisponible : ' + sw.error + ' ', btn('Réessayer', () => { sw.status = 'loading'; ctx.rerender(); load(ctx.rerender); }));

  const d = sw.data;
  const s = d.summary;
  const canWrite = !!(ctx.me && ctx.me.is_super_admin);
  const kpis = el('div', { class: 'adm-agent-kpis' },
    tile('Devis en cours', int(s.quotes_open), s.quotes_open_cents ? eur(s.quotes_open_cents) + ' envoyés' : 'aucun envoyé'),
    tile('Projets à livrer', int(s.projects_running), 'devis acceptés'),
    tile('Facturé cette année', eur(s.invoiced_this_year_cents), 'factures finalisées'),
    tile('À encaisser', eur(s.outstanding_cents), s.overdue_count ? plural(s.overdue_count, 'facture') + ' en retard' : 'rien en retard', s.overdue_count ? 'var(--text-danger)' : null),
    tile('Revenus annuels', eur(s.yearly_revenue_cents), 'contrats en cours'),
    tile('Renouvellements', int(s.renewals_30d), 'dans les 30 jours', s.renewals_30d ? '#F8C46A' : null));
  const qonto = el('div', { class: 'bl-qonto' + (d.qonto.configured ? '' : ' is-off') },
    el('span', { class: 'hm-dot ' + (d.qonto.configured ? 'is-green' : 'is-red'), 'aria-hidden': 'true' }),
    el('span', { text: d.qonto.configured ? 'Qonto connecté · devis et factures créés en brouillon, à finaliser ici' + (d.qonto.sync_error ? ' · ' + d.qonto.sync_error : '') : 'Qonto n’est pas branché sur ce serveur : les fiches se tiennent, les devis attendront.' }),
    !canWrite ? el('span', { class: 'bz-tiny bz-muted', text: 'Lecture seule : les gestes sont réservés aux super admins.' }) : null);
  const counts = { projects: d.quotes.filter((q) => ['draft', 'sent', 'accepted'].includes(q.status)).length, contracts: d.contracts.filter((c) => !c.archived).length, clients: d.clients.filter((c) => !c.archived).length };
  const tabs = el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Vue' },
    [['quote', 'Nouveau devis'], ['projects', 'Devis et projets', counts.projects], ['contracts', 'Contrats annuels', counts.contracts], ['clients', 'Clients', counts.clients], ['catalog', 'Catalogue']].map(([id, label, n]) => el('button', {
      class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(sw.view === id), onclick: () => { sw.view = id; sw.newClient = false; ctx.rerender(); }
    }, label, n ? el('span', { class: 'bz-count', text: String(n) }) : null)));
  const panel = sw.view === 'projects' ? projectsView(ctx, canWrite)
    : sw.view === 'contracts' ? contractsView(ctx, canWrite)
      : sw.view === 'clients' ? clientsView(ctx, canWrite)
        : sw.view === 'catalog' ? catalogView(ctx, canWrite)
          : quoteView(ctx, canWrite);
  return el('div', { class: 'bl' },
    el('p', { class: 'bz-small bz-muted', style: { margin: '0' }, text: 'Activité hors appli de l’EI : devis, acomptes et contrats annuels, émis par Qonto comme le reste.' }),
    sw.error ? el('div', { class: 'bz-msg is-err', role: 'alert', text: 'Mise à jour impossible : ' + sw.error }) : null,
    kpis, qonto, tabs, panel);
}
