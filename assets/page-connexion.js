import { login, forgotPassword, resetPassword, session, isAdmin, ApiError } from './api.js';
import { logo, say } from './chrome.js';

document.getElementById('logo').append(logo());

// Les seules destinations acceptées après connexion. Toute autre valeur de
// ?next= est ignorée : une page de connexion qui redirige où on lui dit est un
// relais d'hameçonnage tout trouvé.
const DESTINATIONS = {
  compte: 'compte.html',
  support: 'support.html',
  suppression: 'suppression-compte.html',
  admin: 'admin.html'
};
const CONTEXT = {
  suppression: 'Connexion requise : la suppression se fait depuis ton propre compte, une fois connecté. Personne ne peut supprimer le tien à ta place.',
  support: 'Connexion requise : le support a besoin de ton compte pour ouvrir une demande et te répondre.',
  admin: 'La console est réservée aux comptes administrateurs. Le serveur le vérifie à chaque action.'
};

const next = new URLSearchParams(location.search).get('next');
const destinationFor = (user) => DESTINATIONS[next] || (isAdmin(user) ? 'admin.html' : 'compte.html');

if (CONTEXT[next]) {
  const box = document.getElementById('context');
  box.textContent = CONTEXT[next];
  box.hidden = false;
}

// Déjà connecté : la copie locale de la session n'est pas une preuve de rôle, donc
// pas de détour par la console sur sa seule foi. Mon compte relit le compte et
// n'y propose la console qu'à un admin confirmé.
const existing = session();
if (existing) location.replace(DESTINATIONS[next] || 'compte.html');

const form = document.getElementById('form');
const email = document.getElementById('email');
const password = document.getElementById('password');
const submit = document.getElementById('submit');
const message = document.getElementById('message');
const toggle = document.getElementById('toggle');

submit.disabled = false;

toggle.addEventListener('click', () => {
  const shown = password.type === 'text';
  password.type = shown ? 'password' : 'text';
  toggle.setAttribute('aria-pressed', String(!shown));
  toggle.setAttribute('aria-label', shown ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const address = email.value.trim();
  if (!address || !password.value) {
    say(message, 'Indique ton adresse e-mail et ton mot de passe.', 'err');
    return;
  }
  submit.disabled = true;
  say(message, '');
  // L'API dort après quinze minutes sans requête. Le dire au bout de deux
  // secondes plutôt que laisser croire que le bouton ne marche pas.
  const slow = setTimeout(() => say(message, 'Connexion… le serveur peut mettre une trentaine de secondes à se réveiller.', 'note'), 2000);
  try {
    const { user } = await login(address, password.value);
    clearTimeout(slow);
    location.href = destinationFor(user);
  } catch (err) {
    clearTimeout(slow);
    const text = err instanceof ApiError && err.status === 401
      ? 'Adresse ou mot de passe incorrect.'
      : err.message;
    say(message, text, 'err');
    submit.disabled = false;
    password.focus();
  }
});

// Mot de passe oublié. Le serveur répond pareil que l'adresse ait un compte ou
// non, et borne lui-même les envois (une minute entre deux codes, trois par
// heure) : la page n'a qu'à relayer ses messages.
const loginPanel = document.getElementById('login-panel');
const forgotPanel = document.getElementById('forgot-panel');
const forgotForm = document.getElementById('forgot-form');
const forgotEmail = document.getElementById('forgot-email');
const forgotSubmit = document.getElementById('forgot-submit');
const forgotMessage = document.getElementById('forgot-message');
const resetForm = document.getElementById('reset-form');
const resetCode = document.getElementById('reset-code');
const resetPasswordInput = document.getElementById('reset-password');
const resetSubmit = document.getElementById('reset-submit');
const resetMessage = document.getElementById('reset-message');
const resend = document.getElementById('resend');
let resetAddress = '';

forgotSubmit.disabled = false;
resetSubmit.disabled = false;

function showForgot(open) {
  loginPanel.hidden = open;
  forgotPanel.hidden = !open;
  if (open) {
    if (!forgotEmail.value) forgotEmail.value = email.value.trim();
    (resetForm.hidden ? forgotEmail : resetCode).focus();
  } else {
    email.focus();
  }
}

document.getElementById('forgot-open').addEventListener('click', () => showForgot(true));
document.getElementById('forgot-close').addEventListener('click', () => showForgot(false));

async function sendCode(host) {
  const address = forgotEmail.value.trim();
  if (!address) {
    say(forgotMessage, 'Indique ton adresse e-mail.', 'err');
    return;
  }
  forgotSubmit.disabled = true;
  resend.disabled = true;
  say(host, '');
  const slow = setTimeout(() => say(host, 'Envoi… le serveur peut mettre une trentaine de secondes à se réveiller.', 'note'), 2000);
  try {
    const res = await forgotPassword(address);
    clearTimeout(slow);
    resetAddress = address;
    document.getElementById('forgot-intro').textContent = 'Tape le code reçu à ' + address + ' et choisis ton nouveau mot de passe. L’e-mail parle de l’application : le code marche aussi ici.';
    forgotForm.hidden = true;
    resetForm.hidden = false;
    say(resetMessage, (res && res.message) || 'Si un compte existe avec cette adresse, un code vient de partir.', 'info');
    resetCode.focus();
  } catch (err) {
    clearTimeout(slow);
    say(host, err.message, 'err');
  } finally {
    forgotSubmit.disabled = false;
    resend.disabled = false;
  }
}

forgotForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendCode(forgotMessage);
});

resend.addEventListener('click', () => sendCode(resetMessage));

resetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = resetCode.value.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) {
    say(resetMessage, 'Le code fait six chiffres.', 'err');
    return;
  }
  if (resetPasswordInput.value.length < 8) {
    say(resetMessage, 'Le mot de passe doit faire au moins 8 caractères.', 'err');
    return;
  }
  resetSubmit.disabled = true;
  say(resetMessage, '');
  try {
    const { user } = await resetPassword(resetAddress, code, resetPasswordInput.value);
    location.href = destinationFor(user);
  } catch (err) {
    say(resetMessage, err.message, 'err');
    resetSubmit.disabled = false;
    resetCode.focus();
  }
});
