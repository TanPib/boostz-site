import { login, forgotPassword, resetPassword, session, isAdmin, ApiError } from './api.js';
// Les fonctions de Google arrivent par l'espace de noms, pas par leur nom :
// GitHub Pages garde api.js dix minutes en cache, et un nom absent d'un
// api.js d'avant le 14/10 ferait échouer tout ce module, connexion par mot de
// passe comprise. Absentes, seul le bouton Google le dit.
import * as api from './api.js';
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

// Le retour de Google, s'il y en a un, se lit avant tout le reste : son jeton
// est dans le fragment de l'adresse (#id_token=…), effacé aussitôt pour qu'il
// ne reste ni dans l'historique ni dans un lien copié. Voir plus bas.
const fragment = new URLSearchParams(location.hash.slice(1));
const googleReturn = fragment.has('id_token') || fragment.has('error');
// Celui d'Apple de même (06/11/2026), sous ses propres noms (#apple_code=…),
// posés par la route de rebond du serveur : voir plus bas.
const appleReturn = fragment.has('apple_code') || fragment.has('apple_error');
if (googleReturn || appleReturn) history.replaceState(null, '', location.pathname + location.search);

// Déjà connecté : la copie locale de la session n'est pas une preuve de rôle, donc
// pas de détour par la console sur sa seule foi. Mon compte relit le compte et
// n'y propose la console qu'à un admin confirmé.
const existing = session();
if (existing && !googleReturn && !appleReturn) location.replace(DESTINATIONS[next] || 'compte.html');

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
    // Le serveur ne dit pas si l'adresse a un compte (ce serait apprendre à
    // n'importe qui quelles adresses sont inscrites) : la phrase couvre aussi
    // le membre qui ne se connecte à l'appli qu'avec Google, et n'a donc pas
    // de mot de passe à taper ici.
    const text = err instanceof ApiError && err.status === 401
      ? 'Adresse ou mot de passe incorrect. Si tu te connectes à l’appli avec Google, utilise « Continuer avec Google » plus haut.'
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

// CONTINUER AVEC GOOGLE (14/10/2026).
//
// Depuis le 06/10, un compte créé avec Google dans l'appli n'a pas de mot de
// passe utilisable, et une liaison peut avoir rendu l'ancien inutilisable :
// sans ce bouton, ces membres n'entraient sur le site que par « Mot de passe
// oublié ».
//
// Un aller-retour par la page de Google, sans charger ici le moindre script de
// Google : la CSP de cette page et la politique de confidentialité n'admettent
// que les fichiers du site. Google revient sur cette page avec un jeton
// d'identité dans le fragment de l'adresse, que la page passe à la route de
// l'appli (POST /auth/google). Son audience est le client « Web » que le
// serveur vérifie déjà.
//
// state et nonce, tirés au hasard et gardés le temps de l'aller-retour, disent
// que le jeton répond à une demande partie de cette page : un jeton glissé
// dans l'adresse par quelqu'un d'autre ne les porte pas.
//
// Côté Google Cloud, le client « Boostz serveur » doit admettre l'origine
// https://boostz.fr et la redirection https://boostz.fr/connexion.html
// (boostz-dev/CONNEXION-GOOGLE/GUIDE.md). Sans elles, Google affiche
// « redirect_uri_mismatch ».
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_FLOW = 'boostz.google';
const REDIRECT = location.origin + '/connexion.html';
const googleButton = document.getElementById('google');
const googleMessage = document.getElementById('google-message');
const googleContinue = document.getElementById('google-continue');

// La configuration est demandée dès l'ouverture : la requête réveille aussi le
// serveur, qui dort après quinze minutes. Un échec n'est pas gardé, le
// prochain appui redemande.
const STALE = 'La page vient d’être mise à jour : recharge-la pour te connecter avec Google.';
let configPromise = null;
function loadConfig() {
  if (!api.googleConfig) return Promise.reject(new Error(STALE));
  if (!configPromise) configPromise = api.googleConfig().catch((err) => { configPromise = null; throw err; });
  return configPromise;
}
loadConfig().catch(() => {});

googleButton.disabled = false;

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

googleButton.addEventListener('click', async () => {
  googleButton.disabled = true;
  say(googleMessage, '');
  const slow = setTimeout(() => say(googleMessage, 'Connexion… le serveur peut mettre une trentaine de secondes à se réveiller.', 'note'), 2000);
  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    clearTimeout(slow);
    say(googleMessage, err.message, 'err');
    googleButton.disabled = false;
    return;
  }
  clearTimeout(slow);
  if (!config || !config.enabled || !config.web_client_id) {
    say(googleMessage, 'La connexion avec Google n’est pas encore ouverte.', 'err');
    googleButton.disabled = false;
    return;
  }
  const state = randomToken();
  const nonce = randomToken();
  try {
    sessionStorage.setItem(GOOGLE_FLOW, JSON.stringify({ state, nonce, next }));
  } catch {
    say(googleMessage, 'Ton navigateur bloque le stockage de cette page : la connexion avec Google ne peut pas aboutir. Utilise ton adresse et ton mot de passe.', 'err');
    googleButton.disabled = false;
    return;
  }
  const params = new URLSearchParams({
    client_id: config.web_client_id,
    redirect_uri: REDIRECT,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    state,
    prompt: 'select_account'
  });
  location.assign(GOOGLE_AUTH + '?' + params.toString());
});

function readFlow(key = GOOGLE_FLOW) {
  try {
    const flow = JSON.parse(sessionStorage.getItem(key) || 'null');
    sessionStorage.removeItem(key);
    return flow;
  } catch {
    return null;
  }
}

// Le nonce inscrit dans le jeton, lu sans en vérifier la signature : c'est le
// serveur qui vérifie le jeton. La page ne s'assure ici que d'une chose, qu'il
// répond à sa propre demande.
function tokenNonce(idToken) {
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
    return payload.nonce || null;
  } catch {
    return null;
  }
}

async function finishGoogle() {
  const flow = readFlow();
  if (fragment.has('error')) {
    say(googleMessage, fragment.get('error') === 'access_denied'
      ? 'Connexion avec Google annulée.'
      : 'Google n’a pas pu te connecter. Réessaie.', 'err');
    return;
  }
  const idToken = fragment.get('id_token');
  if (!flow || fragment.get('state') !== flow.state || tokenNonce(idToken) !== flow.nonce) {
    say(googleMessage, 'Cette connexion avec Google n’a pas pu être vérifiée. Recommence depuis cette page.', 'err');
    return;
  }
  const destination = (user) => DESTINATIONS[flow.next] || (isAdmin(user) ? 'admin.html' : 'compte.html');
  if (!api.googleLogin) {
    say(googleMessage, STALE, 'err');
    return;
  }
  googleButton.disabled = true;
  say(googleMessage, 'Connexion avec Google…', 'note');
  const slow = setTimeout(() => say(googleMessage, 'Connexion… le serveur peut mettre une trentaine de secondes à se réveiller.', 'note'), 2000);
  try {
    const r = await api.googleLogin(idToken);
    clearTimeout(slow);
    if (r.needsRegistration) {
      say(googleMessage, (r.email
        ? 'Aucun compte boostZ n’est relié à ' + r.email + '. '
        : 'Aucun compte boostZ n’est relié à ce compte Google. ')
        + 'Ton compte se crée dans l’appli ; ensuite, tu pourras te connecter ici avec Google.', 'err');
      googleButton.disabled = false;
      return;
    }
    if (r.passwordReset) {
      say(googleMessage, 'Ton compte boostZ est maintenant relié à ce compte Google. Ton ancien mot de passe ne sert plus : connecte-toi avec Google, ici comme dans l’appli.', 'info');
      googleContinue.href = destination(r.user);
      googleContinue.hidden = false;
      googleContinue.focus();
      return;
    }
    location.href = destination(r.user);
  } catch (err) {
    clearTimeout(slow);
    say(googleMessage, err.message, 'err');
    googleButton.disabled = false;
  }
}

if (googleReturn) finishGoogle();

// CONTINUER AVEC APPLE (06/11/2026, boostz-dev/CONNEXION-APPLE/SPEC.md).
//
// Le même aller-retour que Google, sans script d'Apple sur cette page, avec un
// détour : quand on lui demande l'adresse et le nom, Apple ne répond qu'en
// POST vers l'adresse de retour, et GitHub Pages ne reçoit pas de POST.
// L'adresse de retour est donc une route du serveur (POST /auth/apple/web),
// qui renvoie aussitôt le navigateur ici avec la réponse dans le fragment
// (#apple_code=…&apple_id_token=…&apple_state=…). state et nonce font le même
// travail que pour Google ; le serveur vérifie le jeton (POST /auth/apple).
//
// Le bouton n'existe que si le serveur donne le Services ID du site et cette
// adresse de retour (GET /auth/apple/config) ; sinon le « Bientôt » reste.
// Côté Apple, le Services ID doit déclarer exactement cette adresse comme
// « Return URL » (boostz-dev/CONNEXION-APPLE/GUIDE.md), sans quoi Apple
// affiche « invalid_request ».
const APPLE_AUTH = 'https://appleid.apple.com/auth/authorize';
const APPLE_FLOW = 'boostz.apple';
const APPLE_STALE = 'La page vient d’être mise à jour : recharge-la pour te connecter avec Apple.';
const appleButton = document.getElementById('apple');
const appleSoon = document.getElementById('apple-soon');
const appleMessage = document.getElementById('apple-message');
const appleContinue = document.getElementById('apple-continue');

let appleConfigPromise = null;
function loadAppleConfig() {
  if (!api.appleConfig) return Promise.reject(new Error(APPLE_STALE));
  if (!appleConfigPromise) appleConfigPromise = api.appleConfig().catch((err) => { appleConfigPromise = null; throw err; });
  return appleConfigPromise;
}

const appleOpen = (config) => !!(config && config.web_client_id && config.web_redirect_uri);

function showAppleButton() {
  appleSoon.hidden = true;
  appleButton.hidden = false;
  appleButton.disabled = false;
}

// Un serveur d'avant la connexion avec Apple répond 404 : le « Bientôt » reste.
loadAppleConfig().then((config) => { if (appleOpen(config)) showAppleButton(); }).catch(() => {});

appleButton.addEventListener('click', async () => {
  appleButton.disabled = true;
  say(appleMessage, '');
  let config;
  try {
    config = await loadAppleConfig();
  } catch (err) {
    say(appleMessage, err.message, 'err');
    appleButton.disabled = false;
    return;
  }
  if (!appleOpen(config)) {
    say(appleMessage, 'La connexion avec Apple n’est pas encore ouverte.', 'err');
    appleButton.disabled = false;
    return;
  }
  const state = randomToken();
  const nonce = randomToken();
  try {
    sessionStorage.setItem(APPLE_FLOW, JSON.stringify({ state, nonce, next }));
  } catch {
    say(appleMessage, 'Ton navigateur bloque le stockage de cette page : la connexion avec Apple ne peut pas aboutir. Utilise ton adresse et ton mot de passe.', 'err');
    appleButton.disabled = false;
    return;
  }
  const params = new URLSearchParams({
    client_id: config.web_client_id,
    redirect_uri: config.web_redirect_uri,
    response_type: 'code id_token',
    response_mode: 'form_post',
    scope: 'name email',
    state,
    nonce
  });
  location.assign(APPLE_AUTH + '?' + params.toString());
});

async function finishApple() {
  // Le bouton s'affiche, pour que la réponse s'écrive sous lui.
  showAppleButton();
  const flow = readFlow(APPLE_FLOW);
  if (fragment.has('apple_error')) {
    say(appleMessage, fragment.get('apple_error') === 'user_cancelled_authorize'
      ? 'Connexion avec Apple annulée.'
      : 'Apple n’a pas pu te connecter. Réessaie.', 'err');
    return;
  }
  const idToken = fragment.get('apple_id_token');
  const code = fragment.get('apple_code');
  if (!flow || !idToken || fragment.get('apple_state') !== flow.state || tokenNonce(idToken) !== flow.nonce) {
    say(appleMessage, 'Cette connexion avec Apple n’a pas pu être vérifiée. Recommence depuis cette page.', 'err');
    return;
  }
  const destination = (user) => DESTINATIONS[flow.next] || (isAdmin(user) ? 'admin.html' : 'compte.html');
  if (!api.appleLogin) {
    say(appleMessage, APPLE_STALE, 'err');
    return;
  }
  appleButton.disabled = true;
  say(appleMessage, 'Connexion avec Apple…', 'note');
  const slow = setTimeout(() => say(appleMessage, 'Connexion… le serveur peut mettre une trentaine de secondes à se réveiller.', 'note'), 2000);
  try {
    const r = await api.appleLogin({ idToken, code, givenName: fragment.get('apple_given_name') });
    clearTimeout(slow);
    if (r.needsRegistration) {
      say(appleMessage, (r.email && !r.privateRelay
        ? 'Aucun compte BoostZ n’est relié à ' + r.email + '. '
        : 'Aucun compte BoostZ n’est relié à cet identifiant Apple. ')
        + 'Ton compte se crée dans l’appli ; ensuite, tu pourras te connecter ici avec Apple.', 'err');
      appleButton.disabled = false;
      return;
    }
    if (r.passwordReset) {
      say(appleMessage, 'Ton compte BoostZ est maintenant relié à ton identifiant Apple. Ton ancien mot de passe ne sert plus : connecte-toi avec Apple, ou choisis-en un nouveau par « Mot de passe oublié ».', 'info');
      appleContinue.href = destination(r.user);
      appleContinue.hidden = false;
      appleContinue.focus();
      return;
    }
    location.href = destination(r.user);
  } catch (err) {
    clearTimeout(slow);
    say(appleMessage, err.message, 'err');
    appleButton.disabled = false;
  }
}

if (appleReturn) finishApple();
