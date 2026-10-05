import { session, refreshMe, login, call, clearSession } from './api.js';
import { el, clear, put, renderTop, say } from './chrome.js';

const top = document.getElementById('top');
const box = document.getElementById('action');
const WORD = 'SUPPRIMER';

const title = (text) => el('h2', { class: 'bz-h3', style: { color: 'var(--text-danger)', fontSize: '16px' }, text });

function showLoggedOut() {
  renderTop(top, { label: 'SUPPRESSION', next: 'suppression' });
  put(clear(box),
    title('Supprimer depuis ce site'),
    el('p', { class: 'bz-small bz-muted', style: { margin: '8px 0 0', lineHeight: '1.65' },
      text: 'La suppression ne peut être demandée que depuis le compte concerné, une fois connecté. C’est ce qui garantit que personne ne supprime le vôtre à votre place.' }),
    el('a', { class: 'bz-btn is-red', style: { marginTop: '14px' }, href: 'connexion.html?next=suppression', text: 'Se connecter pour supprimer' })
  );
}

function stepPassword(user) {
  const password = el('input', { id: 'pwd', class: 'bz-input', type: 'password', autocomplete: 'current-password', required: true, placeholder: '••••••••' });
  const msg = el('div');
  const go = el('button', { class: 'bz-btn is-red', type: 'submit', text: 'Continuer' });
  const form = el('form', { class: 'bz-stack', style: { gap: '12px', marginTop: '14px' }, novalidate: true },
    el('div', { class: 'bz-field' }, el('label', { class: 'bz-label', for: 'pwd', text: 'Confirme ton mot de passe' }), password),
    msg,
    el('div', { class: 'bz-row bz-actions' }, go)
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!password.value) return say(msg, 'Mot de passe requis pour confirmer.', 'err');
    go.disabled = true;
    say(msg, '');
    try {
      // Revérifier le mot de passe par une nouvelle connexion : un onglet resté
      // ouvert sur un poste partagé ne doit pas suffire à effacer un compte.
      await login(user.email, password.value);
      stepConfirm(user);
    } catch (err) {
      say(msg, err.status === 401 ? 'Mot de passe incorrect.' : err.message, 'err');
      go.disabled = false;
      if (err.status === 401 && !session()) {
        // login() efface la session sur un 401 : on la considère perdue.
        showLoggedOut();
      }
    }
  });

  put(clear(box),
    title('Demande de suppression'),
    el('p', { class: 'bz-small bz-muted', style: { margin: '8px 0 0' } },
      'Compte concerné : ', el('b', { style: { color: 'var(--text)' }, text: user.pseudo || 'Membre' }), ' (', el('span', { text: user.email }), ').'),
    el('p', { class: 'bz-small bz-muted', style: { margin: '6px 0 0' }, text: 'La suppression est immédiate et définitive.' }),
    form
  );
  password.focus();
}

function stepConfirm(user) {
  const word = el('input', { id: 'word', class: 'bz-input confirm-word', autocomplete: 'off', spellcheck: 'false', placeholder: WORD, 'aria-describedby': 'word-help' });
  const confirm = el('button', { class: 'bz-btn is-cta', type: 'button', disabled: true, text: 'Supprimer définitivement' });
  const cancel = el('button', { class: 'bz-btn', type: 'button', text: 'Annuler', onclick: () => stepPassword(user) });
  const msg = el('div', { style: { marginTop: '10px' } });
  // « Effacer aussi mes messages publics », décochée par défaut, comme dans
  // l'application (revue juridique du 04/10/2026, lot 6 ; CGU article 9.3).
  const erase = el('input', { type: 'checkbox', id: 'erase-public' });
  const eraseRow = el('label', { class: 'bz-check', for: 'erase-public', style: { margin: '12px -10px 0', alignItems: 'flex-start' } },
    erase,
    el('span', {},
      el('span', { style: { display: 'block' }, text: 'Effacer aussi mes messages publics' }),
      el('span', { class: 'bz-small bz-muted', style: { display: 'block', fontWeight: '500', marginTop: '3px', lineHeight: '1.55' },
        text: 'Tes sujets et messages de forum, tes avis sur les lieux et tes commentaires d’actualité. Un sujet que tu as ouvert disparaît avec ses réponses. Sans la case, ils restent, signés « Dresseur supprimé ».' })));
  // Le rappel du Pass, comme dans l'application : un Pass simulé par un
  // administrateur n'est facturé par personne.
  const pass = user.has_pass && user.pass_override !== 'active'
    ? el('div', { class: 'bz-msg is-err', style: { marginTop: '12px' },
      text: 'Ton Boostz Pass est actif. Si c’est un abonnement, supprimer ton compte ne l’arrête pas : Google Play ou l’App Store continuerait de le facturer. Résilie-le d’abord depuis ton magasin d’applications.' })
    : null;

  word.addEventListener('input', () => { confirm.disabled = word.value.trim().toUpperCase() !== WORD; });
  confirm.addEventListener('click', async () => {
    if (word.value.trim().toUpperCase() !== WORD) return;
    confirm.disabled = true;
    cancel.disabled = true;
    erase.disabled = true;
    say(msg, 'Suppression en cours…', 'note');
    try {
      await call('/auth/delete-account', { method: 'POST', body: erase.checked ? { erase_public: true } : undefined });
      clearSession();
      stepDone(user);
    } catch (err) {
      say(msg, err.message, 'err');
      cancel.disabled = false;
      erase.disabled = false;
      confirm.disabled = word.value.trim().toUpperCase() !== WORD;
    }
  });

  put(clear(box),
    title('Dernière confirmation'),
    el('p', { id: 'word-help', class: 'bz-small bz-muted', style: { margin: '8px 0 0' } },
      'Saisis ', el('b', { style: { color: 'var(--text)' }, text: WORD }), ' pour supprimer le compte ', el('b', { style: { color: 'var(--text)' }, text: user.pseudo || user.email }), '.'),
    pass,
    eraseRow,
    el('div', { class: 'bz-row bz-actions', style: { marginTop: '14px' } }, word, confirm, cancel),
    msg
  );
  word.focus();
}

function stepDone(user) {
  renderTop(top, { label: 'SUPPRESSION', next: 'suppression' });
  put(clear(box),
    title('Compte supprimé'),
    el('p', { class: 'bz-small bz-muted', style: { margin: '8px 0 0', lineHeight: '1.65' },
      text: 'Le compte ' + (user.pseudo || user.email) + ' est supprimé. La suppression est immédiate et définitive, et cette session est fermée.' }),
    el('a', { class: 'bz-btn', style: { marginTop: '12px' }, href: 'index.html', text: 'Retour au site' })
  );
}

async function start() {
  if (!session()) return showLoggedOut();
  try {
    const user = await refreshMe();
    renderTop(top, { label: 'SUPPRESSION', next: 'suppression', onLogout: showLoggedOut });
    stepPassword(user);
  } catch (err) {
    if (err.status === 401) return showLoggedOut();
    renderTop(top, { label: 'SUPPRESSION', next: 'suppression' });
    clear(box).append(el('div', { class: 'bz-msg is-err', role: 'alert', text: err.message }));
  }
}

start();
