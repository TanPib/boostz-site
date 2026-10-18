// L'onglet « Facturation » de la console : les partenaires que Boostz facture
// hors de l'application, et leurs factures, émises et suivies par Qonto
// (GET /admin/facturation, boostz-mobile server/src/routes/adminFacturation.js).
//
// Les boutiques partenaires sont gratuites jusqu'au 31/12/2027, puis paient
// 50 € HT par an sous convention signée ; les entreprises sont facturées à la
// main. Une facture naît en BROUILLON chez Qonto : « Finaliser » la numérote
// et la rend payable en ligne, c'est le seul geste qui engage. Tout admin lit,
// seul un super admin écrit : le serveur refuse les autres, la console grise.
import { call } from './api.js';
import { el, dateShort } from './chrome.js';
import { money, int } from './revenue.js?v=2026-10-18d';

const bl = { status: 'idle', data: null, error: null, seq: 0, editing: null, prefill: null, invoicing: null, busy: new Set(), filter: 'live' };

const STATUS = {
  draft: ['Brouillon', 'bz-pill is-grey'],
  unpaid: ['À payer', 'bz-pill is-violet'],
  paid: ['Payée', 'bz-pill is-green'],
  canceled: ['Annulée', 'bz-pill is-grey']
};
const KINDS = { boutique: 'Boutique', entreprise: 'Entreprise' };
const today = () => new Date().toISOString().slice(0, 10);
const dayFr = (d) => (d ? dateShort(d + 'T12:00:00') : '—');

async function load(rerender) {
  const seq = ++bl.seq;
  if (!bl.data) bl.status = 'loading';
  try {
    const data = await call('/admin/facturation');
    if (seq !== bl.seq) return;
    bl.data = data;
    bl.status = 'ready';
    bl.error = null;
  } catch (e) {
    if (seq !== bl.seq) return;
    bl.status = e.status === 404 ? 'absent' : bl.data ? 'ready' : 'error';
    bl.error = e.message;
  }
  rerender();
}

// Un geste : bouton occupé, appel, rechargement, message.
async function act(key, fn, ctx, message) {
  bl.busy.add(key);
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
    bl.busy.delete(key);
    ctx.rerender();
  }
}

function tile(label, value, sub, tone) {
  return el('div', { class: 'bz-card is-tight adm-kpi' },
    el('span', { class: 'bz-eyebrow', text: label }),
    el('div', { class: 'adm-kpi-value', style: tone ? { color: tone } : null, text: value }),
    sub ? el('span', { class: 'bz-tiny bz-muted', text: sub }) : null);
}

// ---------- Le formulaire d'une fiche ----------
const FIELDS = [
  ['name', 'Nom affiché'], ['legal_name', 'Raison sociale (sur la facture)'], ['siren', 'SIREN ou SIRET'], ['email', 'E-mail de facturation'],
  ['street', 'Numéro et rue'], ['postal_code', 'Code postal'], ['city', 'Ville'],
  ['convention_signed_on', 'Convention signée le', 'date'], ['annual_fee', 'Redevance annuelle (€)'], ['fee_starts_on', 'Première échéance', 'date']
];

function partnerForm(ctx, partner) {
  const p = partner || bl.prefill || {};
  const inputs = {};
  const value = (k) => {
    if (k === 'annual_fee') return p.annual_fee_cents != null ? String(p.annual_fee_cents / 100).replace('.', ',') : (p.annual_fee || '');
    return p[k] ?? '';
  };
  const kind = el('select', { class: 'bz-input', 'aria-label': 'Type de partenaire' },
    Object.entries(KINDS).map(([v, label]) => el('option', { value: v, text: label, selected: (p.kind || 'boutique') === v })));
  const note = el('textarea', { class: 'bz-input', rows: '2', maxlength: '1000', placeholder: 'Note interne, jamais sur la facture' });
  note.value = p.note || '';
  const grid = el('div', { class: 'bl-form-grid' },
    el('label', { class: 'bz-field' }, el('span', { class: 'bz-label', text: 'Type' }), kind),
    FIELDS.map(([k, label, type]) => {
      const input = el('input', { class: 'bz-input', type: type || 'text', autocomplete: 'off', value: value(k) });
      inputs[k] = input;
      return el('label', { class: 'bz-field' }, el('span', { class: 'bz-label', text: label }), input);
    }),
    el('label', { class: 'bz-field bl-wide' }, el('span', { class: 'bz-label', text: 'Note' }), note));
  const key = partner ? 'edit:' + partner.id : 'new';
  const save = () => {
    const body = { kind: kind.value, note: note.value };
    for (const [k] of FIELDS) body[k] = inputs[k].value.trim();
    if (!partner && bl.prefill && bl.prefill.venue_id) body.venue_id = bl.prefill.venue_id;
    // Une boutique sans montant saisi reçoit la redevance des conditions
    // boutiques côté serveur ; une valeur vide envoyée l'effacerait.
    if (!partner && !body.annual_fee) delete body.annual_fee;
    if (!partner && !body.fee_starts_on) delete body.fee_starts_on;
    act(key, () => (partner
      ? call('/admin/facturation/partners/' + encodeURIComponent(partner.id), { method: 'PATCH', body })
      : call('/admin/facturation/partners', { method: 'POST', body })), ctx, partner ? 'Fiche enregistrée.' : 'Partenaire ajouté.')
      .then((r) => { if (r) { bl.editing = null; bl.prefill = null; ctx.rerender(); } });
  };
  return el('div', { class: 'bl-form' },
    !partner ? el('p', { class: 'bz-tiny bz-muted', style: { margin: '0 0 8px' }, text: 'Une boutique reçoit d’office la redevance des conditions boutiques : 50 € HT par an à partir du 1er janvier 2028. Rien n’est facturé sans convention signée.' }) : null,
    grid,
    el('div', { class: 'bz-row', style: { justifyContent: 'flex-end', marginTop: '10px' } },
      el('button', { class: 'bz-btn', type: 'button', text: 'Annuler', onclick: () => { bl.editing = null; bl.prefill = null; ctx.rerender(); } }),
      el('button', { class: 'bz-btn is-violet', type: 'button', disabled: bl.busy.has(key), text: bl.busy.has(key) ? 'Enregistrement…' : 'Enregistrer', onclick: save })));
}

// ---------- Nouvelle facture ----------
function invoiceForm(ctx, partner) {
  const label = el('input', { class: 'bz-input', autocomplete: 'off', value: partner.kind === 'boutique' ? 'Redevance partenaire Boostz ' + new Date().getFullYear() : '' });
  const amount = el('input', { class: 'bz-input', autocomplete: 'off', inputmode: 'decimal', value: partner.annual_fee_cents ? String(partner.annual_fee_cents / 100).replace('.', ',') : '' });
  const issue = el('input', { class: 'bz-input', type: 'date', value: today() });
  const due = el('input', { class: 'bz-input', type: 'date', value: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) });
  const key = 'invoice:' + partner.id;
  return el('div', { class: 'bl-form' },
    el('div', { class: 'bl-form-grid' },
      el('label', { class: 'bz-field bl-wide' }, el('span', { class: 'bz-label', text: 'Libellé' }), label),
      el('label', { class: 'bz-field' }, el('span', { class: 'bz-label', text: 'Montant (€, sans TVA)' }), amount),
      el('label', { class: 'bz-field' }, el('span', { class: 'bz-label', text: 'Émise le' }), issue),
      el('label', { class: 'bz-field' }, el('span', { class: 'bz-label', text: 'À payer avant le' }), due)),
    el('p', { class: 'bz-tiny bz-muted', style: { margin: '8px 0 0' }, text: 'Créée en brouillon chez Qonto : rien ne part chez le partenaire avant « Finaliser ». BoostZ est en franchise de TVA : aucune TVA n’est ajoutée, et la ligne porte la mention « TVA non applicable, art. 293 B du CGI ».' }),
    el('div', { class: 'bz-row', style: { justifyContent: 'flex-end', marginTop: '10px' } },
      el('button', { class: 'bz-btn', type: 'button', text: 'Annuler', onclick: () => { bl.invoicing = null; ctx.rerender(); } }),
      el('button', {
        class: 'bz-btn is-violet', type: 'button', disabled: bl.busy.has(key), text: bl.busy.has(key) ? 'Création chez Qonto…' : 'Créer le brouillon',
        onclick: () => act(key, () => call('/admin/facturation/partners/' + encodeURIComponent(partner.id) + '/invoices', {
          method: 'POST', body: { label: label.value.trim(), amount: amount.value.trim(), issue_date: issue.value, due_date: due.value }
        }), ctx, 'Brouillon créé chez Qonto. Vérifie-le, puis « Finaliser ».').then((r) => { if (r) { bl.invoicing = null; ctx.rerender(); } })
      })));
}

// ---------- Une facture ----------
async function copyLink(url, toast) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Lien de paiement copié.');
  } catch {
    toast('Copie impossible depuis ce navigateur.', 'note');
  }
}

function invoiceRow(inv, partner, ctx, canWrite) {
  const [label, cls] = STATUS[inv.status] || [inv.status, 'bz-pill'];
  const late = inv.status === 'unpaid' && inv.due_date < today();
  const k = (s) => s + ':' + inv.id;
  const btn = (text, onclick, extra = {}) => el('button', { class: 'bz-btn is-sm', type: 'button', text, onclick, ...extra });
  const actions = [];
  if (inv.status === 'draft' && canWrite) {
    actions.push(btn(bl.busy.has(k('fin')) ? 'Finalisation…' : 'Finaliser', async () => {
      const ok = await ctx.ask({
        title: 'Finaliser cette facture ?',
        text: inv.label + ' · ' + money(inv.amount_cents) + ' pour ' + partner.name + '. Qonto la numérote et la rend payable en ligne. Une facture finalisée ne s’efface plus : elle ne peut qu’être annulée.',
        confirmLabel: 'Finaliser'
      });
      if (ok) act(k('fin'), () => call('/admin/facturation/invoices/' + encodeURIComponent(inv.id) + '/finalize', { method: 'POST' }), ctx, (r) => 'Facture ' + (r && r.number ? r.number + ' ' : '') + 'finalisée.');
    }, { disabled: bl.busy.has(k('fin')), class: 'bz-btn is-sm is-violet' }));
  }
  if (inv.invoice_url && inv.status === 'unpaid') actions.push(btn('Copier le lien de paiement', () => copyLink(inv.invoice_url, ctx.toast)));
  if (inv.status !== 'draft') {
    actions.push(btn(bl.busy.has(k('pdf')) ? 'PDF…' : 'PDF', () => act(k('pdf'), () => call('/admin/facturation/invoices/' + encodeURIComponent(inv.id) + '/pdf'), ctx)
      .then((r) => { if (r && r.url) window.open(r.url, '_blank', 'noopener'); }), { disabled: bl.busy.has(k('pdf')) }));
  }
  if (inv.status === 'unpaid' && canWrite) {
    actions.push(btn('Annuler', async () => {
      const v = await ctx.ask({
        title: 'Annuler la facture ' + (inv.number || '') + ' ?',
        text: 'Irréversible chez Qonto : la facture reste numérotée, marquée annulée. Pour corriger un montant, annule puis refais-en une.',
        fields: [{ name: 'reason', label: 'Motif (inscrit au journal)', required: true }],
        confirmLabel: 'Annuler la facture', tone: 'red'
      });
      if (v) act(k('cancel'), () => call('/admin/facturation/invoices/' + encodeURIComponent(inv.id) + '/cancel', { method: 'POST', body: { reason: v.reason } }), ctx, 'Facture annulée.');
    }, { class: 'bz-btn is-sm is-red' }));
  }
  return el('div', { class: 'bl-inv' + (late ? ' is-late' : '') },
    el('span', { class: 'bl-inv-main' },
      el('b', { text: inv.number || 'Brouillon' }),
      el('small', { text: inv.label })),
    el('span', { class: 'bl-inv-dates' },
      el('small', { text: 'émise ' + dayFr(inv.issue_date) }),
      el('small', { class: late ? 'bl-late' : '', text: inv.status === 'paid' && inv.paid_at ? 'payée ' + dateShort(inv.paid_at) : (late ? 'en retard · ' : 'échéance ') + dayFr(inv.due_date) })),
    el('b', { class: 'bl-inv-amount', text: money(inv.amount_cents) }),
    el('span', { class: cls, text: label }),
    el('span', { class: 'bl-inv-actions' }, actions));
}

// ---------- Une fiche ----------
function partnerCard(p, ctx, canWrite, qontoOn) {
  if (bl.editing === p.id) {
    return el('section', { class: 'bz-card bl-partner' }, el('h3', { class: 'bz-h3', text: 'Modifier · ' + p.name }), partnerForm(ctx, p));
  }
  const convention = p.convention_signed_on ? 'Convention signée le ' + dayFr(p.convention_signed_on) : (p.kind === 'boutique' ? 'Convention à faire signer' : 'Pas de convention notée');
  const fee = p.annual_fee_cents ? money(p.annual_fee_cents) + ' par an · prochaine échéance ' + dayFr(p.next_fee_on) : null;
  const canInvoice = canWrite && qontoOn && !p.missing_for_invoice.length && !p.archived;
  return el('section', { class: 'bz-card bl-partner' + (p.archived ? ' is-archived' : '') },
    el('div', { class: 'bl-partner-head' },
      el('div', { class: 'bl-partner-title' },
        el('h3', { class: 'bz-h3', text: p.name }),
        el('span', { class: 'bz-pill is-grey', text: KINDS[p.kind] || p.kind }),
        p.archived ? el('span', { class: 'bz-pill is-grey', text: 'Archivé' }) : null,
        p.qonto_linked ? el('span', { class: 'bz-pill is-green', title: 'Client créé chez Qonto', text: 'Qonto' }) : null),
      el('div', { class: 'bz-row', style: { gap: '6px' } },
        canWrite ? el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Modifier', onclick: () => { bl.editing = p.id; bl.invoicing = null; ctx.rerender(); } }) : null,
        el('button', {
          class: 'bz-btn is-sm is-violet', type: 'button', text: 'Nouvelle facture', disabled: !canInvoice,
          title: !canWrite ? 'Réservé aux super admins' : !qontoOn ? 'Qonto n’est pas branché sur le serveur' : p.missing_for_invoice.length ? 'Il manque ' + p.missing_for_invoice.join(' et ') : '',
          onclick: () => { bl.invoicing = p.id; bl.editing = null; ctx.rerender(); }
        }))),
    el('p', { class: 'bz-small bz-muted bl-partner-meta', text: [p.legal_name, p.siren ? 'SIREN ' + p.siren : null, p.email, [p.postal_code, p.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Fiche à compléter' }),
    el('p', { class: 'bz-small bl-partner-meta' },
      el('span', { class: p.convention_signed_on ? '' : 'bl-warn', text: convention }), fee ? ' · ' + fee : ''),
    p.missing_for_invoice.length ? el('p', { class: 'bz-tiny bl-warn', style: { margin: '4px 0 0' }, text: 'Avant toute facture, il manque ' + p.missing_for_invoice.join(' et ') + '.' }) : null,
    p.note ? el('p', { class: 'bz-tiny bz-muted', style: { margin: '4px 0 0' }, text: p.note }) : null,
    bl.invoicing === p.id ? invoiceForm(ctx, p) : null,
    p.invoices.length ? el('div', { class: 'bl-invs' }, p.invoices.map((i) => invoiceRow(i, p, ctx, canWrite))) : null);
}

// ---------- La vue ----------
export function renderBilling(ctx) {
  const { me } = ctx;
  if (bl.status === 'idle') { bl.status = 'loading'; load(ctx.rerender); }
  if (bl.status === 'loading') return el('div', { class: 'bl' }, el('div', { class: 'bz-skeleton', style: { height: '80px' } }), el('div', { class: 'bz-skeleton', style: { height: '260px', marginTop: '12px' } }));
  if (bl.status === 'absent') return el('section', { class: 'bz-card bl' }, el('b', { text: 'Facturation : pas encore en ligne sur le serveur' }), el('p', { class: 'bz-small bz-muted', text: 'Le serveur ne connaît pas encore /admin/facturation. Réessaie après le prochain déploiement.' }));
  if (bl.status === 'error') return el('div', { class: 'bz-msg is-err', role: 'alert' }, 'Facturation indisponible : ' + bl.error + ' ', el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Réessayer', onclick: () => { bl.status = 'loading'; ctx.rerender(); load(ctx.rerender); } }));

  const d = bl.data;
  const s = d.summary;
  const canWrite = !!(me && me.is_super_admin);
  const qontoOn = d.qonto.configured;
  const partners = d.partners.filter((p) => (bl.filter === 'archived' ? p.archived : bl.filter === 'all' ? true : !p.archived));

  const kpis = el('div', { class: 'adm-agent-kpis' },
    tile('Facturé cette année', money(s.invoiced_this_year_cents), 'factures finalisées'),
    tile('Encaissé cette année', money(s.paid_this_year_cents), null, s.paid_this_year_cents ? 'var(--text-success)' : null),
    tile('À encaisser', money(s.outstanding_cents), int(s.outstanding_count) + ' facture' + (s.outstanding_count > 1 ? 's' : '')),
    tile('En retard', money(s.overdue_cents), int(s.overdue_count) + ' facture' + (s.overdue_count > 1 ? 's' : ''), s.overdue_count ? 'var(--text-danger)' : null),
    tile('Brouillons', int(s.drafts), 'à finaliser'),
    tile('Conventions à signer', int(s.conventions_to_sign), 'boutiques, avant 2028'));

  const qonto = el('div', { class: 'bl-qonto' + (qontoOn ? '' : ' is-off') },
    el('span', { class: 'hm-dot ' + (qontoOn ? 'is-green' : 'is-red'), 'aria-hidden': 'true' }),
    el('span', { text: qontoOn
      ? 'Qonto connecté' + (d.qonto.last_sync_at ? ' · factures relues à ' + new Date(d.qonto.last_sync_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '') + (d.qonto.sync_error ? ' · ' + d.qonto.sync_error : '')
      : 'Qonto n’est pas branché sur ce serveur : les fiches se tiennent, les factures attendront.' }),
    qontoOn ? el('button', { class: 'bz-btn is-sm', type: 'button', disabled: bl.busy.has('sync'), text: bl.busy.has('sync') ? 'Lecture…' : 'Relire Qonto',
      onclick: () => act('sync', () => call('/admin/facturation/sync', { method: 'POST' }), ctx, (r) => (r ? r.synced + ' facture(s) relue(s)' + (r.failed ? ', ' + r.failed + ' en échec' : '') + '.' : '')) }) : null,
    !canWrite ? el('span', { class: 'bz-tiny bz-muted', text: 'Lecture seule : les gestes sont réservés aux super admins.' }) : null);

  const candidates = d.venue_candidates.length ? el('section', { class: 'bz-card bl-candidates' },
    el('h3', { class: 'bz-h3', text: 'Boutiques partenaires sans fiche de facturation · ' + d.venue_candidates.length }),
    el('div', { class: 'bl-cand-list' }, d.venue_candidates.map((v) => el('div', { class: 'bl-cand' },
      el('span', {}, el('b', { text: v.name }), el('small', { text: [v.city, v.partner_since ? 'partenaire depuis le ' + dateShort(v.partner_since) : null].filter(Boolean).join(' · ') })),
      canWrite ? el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Créer la fiche', onclick: () => {
        const street = v.address && v.postal_code ? v.address.split(v.postal_code)[0].replace(/[,\s]+$/, '') : '';
        bl.prefill = { kind: 'boutique', venue_id: v.venue_id, name: v.name, siren: v.siret || '', street, postal_code: v.postal_code || '', city: v.city || '' };
        bl.editing = 'new';
        ctx.rerender();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } }) : null)))) : null;

  const tabs = el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Partenaires' },
    [['live', 'Actifs'], ['archived', 'Archivés'], ['all', 'Tous']].map(([id, label]) => el('button', {
      class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(bl.filter === id), onclick: () => { bl.filter = id; ctx.rerender(); }
    }, label)));

  return el('div', { class: 'bl' },
    bl.error ? el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginBottom: '10px' }, text: 'Mise à jour impossible : ' + bl.error }) : null,
    kpis,
    qonto,
    bl.editing === 'new' ? el('section', { class: 'bz-card bl-partner' }, el('h3', { class: 'bz-h3', text: 'Nouveau partenaire' }), partnerForm(ctx, null)) : null,
    el('div', { class: 'bl-toolbar' }, tabs,
      canWrite && bl.editing !== 'new' ? el('button', { class: 'bz-btn is-violet', type: 'button', text: 'Nouveau partenaire', onclick: () => { bl.prefill = null; bl.editing = 'new'; ctx.rerender(); } }) : null),
    partners.length ? partners.map((p) => partnerCard(p, ctx, canWrite, qontoOn))
      : el('section', { class: 'bz-card' }, el('p', { class: 'bz-small bz-muted', style: { margin: '0' }, text: bl.filter === 'archived' ? 'Aucun partenaire archivé.' : 'Aucun partenaire pour l’instant. Les boutiques partenaires de l’annuaire apparaissent ci-dessous dès qu’elles le deviennent.' })),
    candidates);
}

// Pour l'accueil : les factures en retard, et les brouillons à finaliser.
export function billingAlerts() {
  const s = bl.data && bl.data.summary;
  return s ? { overdue: s.overdue_count, drafts: s.drafts } : null;
}
