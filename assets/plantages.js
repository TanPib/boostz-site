// La vue « Plantages » de la console (19/10/2026) : les erreurs que
// l'application a rencontrées chez les membres, regroupées par erreur.
//
// Tout vient de GET /admin/crashes?days (server/src/routes/appCrashes.js),
// alimenté par le rapport que l'application envoie quand un écran plante
// (mobile/src/lib/crashReporter.js). Un rapport ne désigne personne : ni
// compte, ni adresse IP, et les courriels, numéros et jetons sont effacés du
// message avant d'être écrits.
//
// Une route absente (404) = serveur plus ancien que la console : la vue le dit.
// Tout texte venu de l'API passe par textContent (el()).
import { call } from './api.js';
import { el, dateTime } from './chrome.js';

const RANGES = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '3 mois' }
];

// Les trois genres de rapport, du plus grave au moins grave.
const KINDS = {
  fatal: ['Appli fermée', 'bz-pill is-red'],
  render: ['Écran planté', 'bz-pill is-amber'],
  error: ['Erreur', 'bz-pill is-grey']
};
const PLATFORMS = { android: 'Android', ios: 'iPhone', web: 'Web' };

const st = { days: 30, status: 'idle', data: null, error: null, seq: 0, open: new Set() };
const int = (n) => new Intl.NumberFormat('fr-FR').format(n);

async function load(rerender) {
  const seq = ++st.seq;
  st.status = st.data ? 'refreshing' : 'loading';
  rerender();
  try {
    const data = await call(`/admin/crashes?days=${st.days}`);
    if (seq !== st.seq) return;
    st.data = data;
    st.status = 'ready';
    st.error = null;
  } catch (e) {
    if (seq !== st.seq) return;
    st.status = e.status === 404 ? 'absent' : 'error';
    st.error = e.message;
  }
  rerender();
}

function filters(rerender) {
  const tab = (active, label, onclick) => el('button', { class: 'bz-tab', type: 'button', role: 'tab', 'aria-selected': String(active), onclick }, label);
  return el('div', { class: 'rv-filters' },
    el('div', { class: 'bz-tabs', role: 'tablist', 'aria-label': 'Période' },
      RANGES.map((r) => tab(st.days === r.days, r.label, () => { st.days = r.days; load(rerender); }))),
    el('button', { class: 'bz-btn is-sm', type: 'button', text: 'Actualiser', onclick: () => load(rerender) }));
}

function kpi(label, value, note) {
  return el('div', { class: 'bz-card is-tight adm-kpi' },
    el('span', { class: 'bz-eyebrow', text: label }),
    el('div', { class: 'adm-kpi-value', text: value }),
    note ? el('span', { class: 'bz-tiny', text: note }) : null);
}

// Une version : 1.0.29, sa note (2026-10-19-2) et le nombre de rapports. « dev »
// = un essai en local, « rt:… » = un binaire sans mise à jour OTA.
function buildLabel(b) {
  const name = b.app_version || (b.build === 'dev' ? 'développement' : b.build.startsWith('rt:') ? 'binaire ' + b.build.slice(3, 11) : 'mise à jour ' + b.build.slice(0, 8));
  return name + (b.release_id ? ' (' + b.release_id + ')' : '') + ' · ' + int(b.count);
}

function crashCard(c, rerender) {
  const [kindLabel, kindClass] = KINDS[c.kind] || KINDS.error;
  const open = st.open.has(c.fingerprint);
  const times = c.count > 1 ? int(c.count) + ' fois' : 'une fois';
  const days = c.days > 1 ? ', sur ' + c.days + ' jours' : '';
  const platforms = (c.platforms || []).map((p) => PLATFORMS[p.platform] || p.platform).join(', ');
  return el('section', { class: 'bz-card crash-card' },
    el('div', { class: 'crash-head' },
      el('span', { class: kindClass, text: kindLabel }),
      el('span', { class: 'bz-tiny', text: times + days + ' · dernier le ' + dateTime(c.last_at) })),
    el('p', { class: 'crash-message', text: c.message }),
    el('dl', { class: 'crash-meta' },
      c.screens && c.screens.length ? [el('dt', { text: 'Écran' + (c.screens.length > 1 ? 's' : '') }), el('dd', { text: c.screens.join(', ') })] : null,
      el('dt', { text: 'Versions' }), el('dd', {}, el('span', { class: 'crash-builds' }, (c.builds || []).map((b) => el('span', { class: 'bz-pill is-grey', text: buildLabel(b) })))),
      el('dt', { text: 'Sur' }), el('dd', { text: platforms + (c.os_version ? ' (système ' + c.os_version + ')' : '') }),
      el('dt', { text: 'Depuis' }), el('dd', { text: dateTime(c.first_at) })),
    c.stack || c.component_stack
      ? el('div', {},
        el('button', { class: 'bz-btn is-sm', type: 'button', 'aria-expanded': String(open), text: open ? 'Masquer la pile' : 'Voir la pile',
          onclick: () => { if (open) st.open.delete(c.fingerprint); else st.open.add(c.fingerprint); rerender(); } }),
        open ? el('pre', { class: 'crash-stack', text: [c.stack, c.component_stack ? 'Composants :' + c.component_stack : null].filter(Boolean).join('\n\n') }) : null)
      : null);
}

export function renderCrashes({ phone, rerender }) {
  if (st.status === 'idle') {
    // Chargée à la première ouverture de l'onglet, comme l'audience.
    queueMicrotask(() => load(rerender));
  }
  const wrap = el('div', { style: { marginTop: phone ? '4px' : '18px' } });
  wrap.append(filters(rerender));
  if (st.status === 'idle' || st.status === 'loading') {
    wrap.append(el('p', { class: 'bz-tiny', style: { marginTop: '16px' }, text: 'Chargement des plantages…' }));
    return wrap;
  }
  if (st.status === 'absent') {
    wrap.append(el('div', { class: 'bz-msg is-info', style: { marginTop: '16px' }, text: 'Les rapports de plantage arrivent avec la prochaine mise à jour du serveur.' }));
    return wrap;
  }
  if (st.status === 'error' && !st.data) {
    wrap.append(el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '16px' }, text: st.error || 'Impossible de charger les plantages.' }));
    return wrap;
  }
  const d = st.data;
  const t = d.totals || { reports: 0, groups: 0, today: 0 };
  const list = d.crashes || [];
  wrap.append(el('div', { class: 'rv-body' + (st.status === 'refreshing' ? ' is-refreshing' : '') },
    el('div', { class: 'bz-grid adm-kpis au-kpis', style: { marginTop: '14px' } },
      kpi('Plantages', int(t.reports)),
      kpi('Erreurs différentes', int(t.groups)),
      kpi('Aujourd’hui', int(t.today))),
    list.length
      ? el('div', { class: 'crash-list' }, list.map((c) => crashCard(c, rerender)))
      : el('div', { class: 'bz-msg is-note', style: { marginTop: '12px' }, text: 'Aucun plantage signalé sur cette période.' }),
    el('p', { class: 'bz-tiny', style: { marginTop: '10px' }, text: 'Un rapport part du téléphone quand un écran plante. Anonyme : ni compte, ni adresse IP ; les courriels, numéros et jetons sont effacés du message. Une même erreur n’envoie qu’un rapport par lancement de l’appli. Gardés 3 mois.' })));
  if (st.status === 'error') wrap.append(el('div', { class: 'bz-msg is-err', role: 'alert', style: { marginTop: '12px' }, text: st.error }));
  return wrap;
}
