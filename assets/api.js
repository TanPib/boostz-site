// La seule porte du site vers l'API Boostz.
//
// L'adresse est en dur parce qu'il n'y en a qu'une. Un moyen de la changer
// depuis la page (champ, paramètre d'URL) serait une invitation à envoyer un mot
// de passe au mauvais serveur. Seule exception : la page servie depuis
// localhost parle à l'API locale de développement.
const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
export const API = LOCAL ? 'http://localhost:3001' : 'https://boostz-api.onrender.com';

// sessionStorage et non localStorage : la session disparaît avec l'onglet. Le
// site sert à des démarches ponctuelles (support, suppression, modération), pas
// à rester connecté trente jours sur un poste qui n'est peut-être pas le sien.
const KEY = 'boostz.session';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function session() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return s && s.token ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token, user }));
  } catch {
    // Navigation privée stricte : la session vivra le temps de la page.
  }
}

// LE COMPTE CONFIRMÉ PAR LE SERVEUR, pendant CE chargement de page.
//
// La copie gardée en sessionStorage se modifie à la main dans le navigateur, et
// elle vieillit : un admin rétrogradé la garde jusqu'à sa prochaine relecture. Rien
// de ce qui dépend du rôle (le bouton « Admin ») ne doit donc se fier à elle, seulement
// à ce que /auth/me vient de répondre. Null tant que rien n'a été relu.
let verified = null;

export const verifiedUser = () => verified;

export function clearSession() {
  verified = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // idem
  }
}

export async function call(path, { method = 'GET', body } = {}) {
  const s = session();
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(s ? { Authorization: 'Bearer ' + s.token } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, 'Le serveur ne répond pas. Il peut mettre une trentaine de secondes à se réveiller : réessaie.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) clearSession();
    const fallback = res.status === 401
      ? 'Session expirée, reconnecte-toi.'
      : res.status === 403
        ? "Ce compte n'a pas les droits pour cette action."
        : 'Erreur ' + res.status + '.';
    throw new ApiError(res.status, (data && data.message) || fallback);
  }
  return data;
}

// Se connecter, puis relire /auth/me avec le jeton obtenu. La relecture n'est pas
// une coquetterie : un compte banni obtient bien un jeton de /auth/login, mais ce
// jeton est refusé partout ensuite. Sans cette vérification, la personne verrait
// « connecté » puis « session expirée » à l'écran suivant, sans comprendre.
export async function login(email, password) {
  const data = await call('/auth/login', { method: 'POST', body: { email, password } });
  saveSession(data.token, data.user);
  try {
    const me = await call('/auth/me');
    saveSession(data.token, me);
    verified = me;
    return { token: data.token, user: me };
  } catch (e) {
    clearSession();
    if (e.status === 401) throw new ApiError(403, 'Ce compte ne peut pas se connecter pour le moment : il a peut-être été suspendu par la modération.');
    throw e;
  }
}

// Relit le compte connecté et met la session à jour : un rôle peut avoir changé
// depuis la connexion. Rend null si personne n'est connecté.
export async function refreshMe() {
  const s = session();
  if (!s) return null;
  const me = await call('/auth/me');
  saveSession(s.token, me);
  verified = me;
  return me;
}

export const isAdmin = (user) => !!user && user.role === 'admin';

// Le seul test à utiliser pour afficher un accès d'administration.
export const isVerifiedAdmin = () => isAdmin(verified);
