// La page du lien de parrainage : boostz.fr/parrainage?code=CODE (26/10/2026).
// Le pourquoi est en tête de parrainage.html.
//
// Le code est lu dans l'adresse et affiché, rien de plus : ni stocké, ni
// envoyé. Un code mal formé laisse la page « lien incomplet ».
//
// « J'ai déjà BoostZ » ouvre l'application par son schéma
// `app.boostz.mobile://parrainage?code=` (mobile, lib/referralShare.js) :
//   - ANDROID par un lien `intent://`, qui se rabat sur la page d'installation
//     quand l'application n'est pas là, sans message d'erreur. Les vc3 à vc5
//     ne déclarent pas le schéma : chez elles, ce bouton mène aussi là.
//   - IPHONE par le schéma tel quel : Safari affiche « adresse non valide »
//     si l'application n'est pas installée, d'où le libellé du bouton.
// Jamais d'ouverture automatique au chargement : Chrome refuse d'ouvrir une
// application sans geste de la personne, et Safari afficherait son erreur à
// tous ceux qui découvrent BoostZ.

const SCHEMA = 'app.boostz.mobile';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Même règle que l'application et l'API : casse, espaces et tirets pardonnés.
function normaliser(brut) {
  if (typeof brut !== 'string') return null;
  const code = brut.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== 6 || [...code].some((c) => !ALPHABET.includes(c))) return null;
  return code;
}

const ua = navigator.userAgent || '';
const android = /Android/i.test(ua);
// iPadOS se présente en Mac : le toucher le trahit.
const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

function lienApp(code) {
  const chemin = `parrainage?code=${encodeURIComponent(code)}`;
  if (!android) return `${SCHEMA}://${chemin}`;
  const repli = new URL('/beta/', location.origin).toString();
  return `intent://${chemin}#Intent;scheme=${SCHEMA};package=${SCHEMA};`
    + `S.browser_fallback_url=${encodeURIComponent(repli)};end`;
}

function afficher(code) {
  document.getElementById('sans-code').hidden = true;
  document.getElementById('avec-code').hidden = false;
  document.getElementById('etapes').hidden = false;
  document.getElementById('code').textContent = code;

  if (android || ios) {
    const ouvrir = document.getElementById('ouvrir');
    ouvrir.href = lienApp(code);
    ouvrir.hidden = false;
  }

  const copier = document.getElementById('copier');
  if (!navigator.clipboard) { copier.hidden = true; return; }
  copier.addEventListener('click', () => {
    navigator.clipboard.writeText(code)
      .then(() => { copier.textContent = 'Code copié'; })
      .catch(() => { copier.hidden = true; });
  });
}

const code = normaliser(new URLSearchParams(location.search).get('code'));
if (code) afficher(code);
