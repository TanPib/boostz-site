// Le lien de parrainage : boostz.fr/?parrain=CODE (30/09/2026).
//
// C'est le lien que l'application partage - dans le texte, sous le QR code et
// dans l'image à publier. Deux publics y arrivent :
//   - quelqu'un qui A DÉJÀ l'application : on l'ouvre sur sa page Parrainage,
//     le code pré-rempli (mobile, components/ReferralLinkGate.js) ;
//   - quelqu'un qui ne l'a pas : il reste sur le site, et un bandeau lui
//     rappelle le code à saisir une fois l'application installée.
//
// LE SCHÉMA `app.boostz.mobile://` est déclaré d'office par le build EAS de
// l'application (identifiant de l'app), donc les binaires installés le
// connaissent déjà.
//
// ANDROID essaie tout seul, dès l'arrivée : un lien `intent://` ouvre l'app si
// elle est installée, et sinon Chrome suit `browser_fallback_url` - cette même
// page, marquée `essai=1` pour ne pas réessayer en boucle. Aucun message
// d'erreur dans aucun des deux cas.
//
// IOS N'ESSAIE PAS TOUT SEUL : Safari affiche « adresse non valide » quand
// l'app n'est pas installée, c'est-à-dire à tous ceux qui découvrent boostZ.
// Le bandeau porte donc un bouton « Ouvrir dans l'app », touché par ceux qui
// l'ont. L'ouverture sans geste demande un lien universel (associatedDomains
// dans le binaire, apple-app-site-association ici) : prochain build.
//
// QUAND L'APP SERA SUR LES STORES : renseigner STORES. Android retombera alors
// sur la fiche Play Store au lieu de cette page, et le bandeau proposera le
// téléchargement du store de l'appareil.

const STORES = { ios: null, android: null };
const SCHEMA = 'app.boostz.mobile';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Même règle que l'application et l'API : casse, espaces et tirets pardonnés.
function normaliser(brut) {
  if (typeof brut !== 'string') return null;
  const code = brut.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== 6 || [...code].some((c) => !ALPHABET.includes(c))) return null;
  return code;
}

const params = new URLSearchParams(location.search);
const code = normaliser(params.get('parrain'));
const ua = navigator.userAgent || '';
const android = /Android/i.test(ua);
// iPadOS se présente en Mac : le toucher le trahit.
const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

const lienApp = (c) => `${SCHEMA}://parrainage?code=${encodeURIComponent(c)}`;

function lienIntent(c) {
  const retour = new URL(location.href);
  retour.searchParams.set('essai', '1');
  const repli = STORES.android || retour.toString();
  return `intent://parrainage?code=${encodeURIComponent(c)}#Intent;scheme=${SCHEMA};package=${SCHEMA};`
    + `S.browser_fallback_url=${encodeURIComponent(repli)};end`;
}

function ouvrirApp() {
  location.href = android ? lienIntent(code) : lienApp(code);
}

function bandeau() {
  const el = document.createElement('aside');
  el.className = 'bz-parrain';
  el.setAttribute('aria-label', 'Code de parrainage');
  const mobile = android || ios;
  const store = ios ? STORES.ios : android ? STORES.android : null;
  el.innerHTML = `
    <button type="button" class="bz-parrain-x" aria-label="Fermer">×</button>
    <p class="bz-parrain-kicker">Tu as été invité sur boostZ</p>
    <p class="bz-parrain-code">${code}</p>
    <p class="bz-parrain-txt">Saisis ce code dans l'application, <b>Profil › Parrainage</b>, dans les 7 jours qui suivent ton inscription : des Boosties t'attendent.</p>
    ${mobile ? `<div class="bz-parrain-actions">
      <button type="button" class="bz-btn is-violet" data-ouvrir>Ouvrir dans l'app</button>
      ${store ? `<a class="bz-btn is-cta" href="${store}">Télécharger boostZ</a>` : ''}
    </div>` : ''}`;
  el.querySelector('.bz-parrain-x').addEventListener('click', () => el.remove());
  el.querySelector('[data-ouvrir]')?.addEventListener('click', ouvrirApp);
  document.body.appendChild(el);
}

if (code) {
  bandeau();
  if (android && params.get('essai') !== '1') ouvrirApp();
}
