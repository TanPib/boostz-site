// L'ancien lien de parrainage : boostz.fr/?parrain=CODE, partagé par
// l'application du 30/09 au 26/10/2026 - dans des messages, sous des QR codes
// et dans des images publiées, qui ne disparaîtront pas.
//
// Il mène désormais à la page du lien de parrainage (parrainage.html), la
// même que le nouveau lien. Le bandeau qu'il affichait sur l'accueil n'existe
// plus : un lien de parrainage mérite sa page, pas une fenêtre sur la vitrine.
//
// Le code est passé tel quel : la page le vérifie elle-même.

const code = new URLSearchParams(location.search).get('parrain');
if (code) location.replace(`/parrainage?code=${encodeURIComponent(code)}`);
