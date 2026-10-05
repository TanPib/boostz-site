import { login, session, isAdmin, ApiError } from './api.js';
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
