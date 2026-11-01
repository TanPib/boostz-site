// La page du QR code collé sur le comptoir d'une boutique partenaire
// (31/10/2026, le passage récompensé) : boostz.fr/boutique/<code>. Le
// pourquoi est en tête de 404.html.
//
// UN SCRIPT CLASSIQUE, CHARGÉ DANS LE <head> ET NON EN MODULE : il doit dire
// quelle page montrer avant le premier affichage. 404.html sert toutes les
// adresses inconnues du site ; sans lui, celui qui scanne verrait d'abord
// « Page introuvable », le temps qu'un module s'exécute. Il pose
// data-page="boutique" sur <html> pour toute adresse en /boutique/, et le CSS
// (page-boutique.css) fait le reste.
//
// Le code est lu dans l'adresse, rien de plus : ni stocké, ni envoyé, ni même
// affiché - il vaut des Boosties. Mêmes règles que l'application
// (lib/venueVisitLink.js) : 10 caractères de l'alphabet sans 0, O, 1, I ni L,
// casse, espaces et tirets pardonnés. Un code mal formé laisse la page, sans
// le bouton d'ouverture.
//
// « J'ai déjà BoostZ » ouvre l'application par son schéma,
// `app.boostz.mobile://boutique/<code>`, comme sur la page de parrainage
// (assets/page-parrainage.js) : un lien `intent://` sur Android, qui se rabat
// sur la page d'installation quand l'application n'est pas là ; le schéma tel
// quel sur iPhone. Sur ordinateur, rien à ouvrir : pas de bouton. Jamais
// d'ouverture automatique au chargement.
(() => {
  const SCHEMA = 'app.boostz.mobile';
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const LONGUEUR = 10;

  if (!/^\/boutique(?:\/|$)/.test(location.pathname)) return;
  document.documentElement.setAttribute('data-page', 'boutique');
  document.title = 'Ton passage récompensé dans une boutique partenaire BoostZ';

  function normaliser(brut) {
    if (typeof brut !== 'string') return null;
    let texte;
    try {
      texte = decodeURIComponent(brut);
    } catch {
      return null;
    }
    const code = texte.toUpperCase().replace(/[\s-]/g, '');
    if (code.length !== LONGUEUR || [...code].some((c) => !ALPHABET.includes(c))) return null;
    return code;
  }

  const ua = navigator.userAgent || '';
  const android = /Android/i.test(ua);
  // iPadOS se présente en Mac : le toucher le trahit.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

  function lienApp(code) {
    const chemin = 'boutique/' + code;
    if (!android) return SCHEMA + '://' + chemin;
    const repli = new URL('/beta/', location.origin).toString();
    return 'intent://' + chemin + '#Intent;scheme=' + SCHEMA + ';package=' + SCHEMA + ';'
      + 'S.browser_fallback_url=' + encodeURIComponent(repli) + ';end';
  }

  // /boutique/<code>, barre finale permise ; rien d'autre ne porte un code.
  const match = /^\/boutique\/([^/]+)\/?$/.exec(location.pathname);
  const code = match ? normaliser(match[1]) : null;
  if (!code || !(android || ios)) return;
  document.addEventListener('DOMContentLoaded', () => {
    const ouvrir = document.getElementById('ouvrir');
    if (!ouvrir) return;
    ouvrir.href = lienApp(code);
    ouvrir.hidden = false;
  });
})();
