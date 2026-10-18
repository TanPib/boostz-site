// La mesure d'audience de boostz.fr (18/10/2026) : un signal par page vue,
// lu par l'onglet « Audience » de la console.
//
// Rien qui désigne une personne : ni cookie, ni stockage dans le navigateur,
// ni identifiant. Le signal porte la page, la page d'où l'on vient (pour la
// provenance : Instagram, Google, accès direct…) et le paramètre utm_source du
// lien s'il y en a un ; le serveur n'en garde que des compteurs par jour
// (server/src/lib/siteAudience.js, dans le dépôt de l'application). Un
// navigateur qui demande à ne pas être suivi (Global Privacy Control, Do Not
// Track) n'envoie rien.
//
// En text/plain : le seul type qui évite au navigateur une requête préalable,
// et keepalive pour que le signal parte même si l'on quitte aussitôt la page.
const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const API = LOCAL ? 'http://localhost:3001' : 'https://boostz-api.onrender.com';

const refuse = navigator.globalPrivacyControl === true
  || navigator.doNotTrack === '1' || window.doNotTrack === '1';

if (!refuse) {
  const params = new URLSearchParams(location.search);
  const body = JSON.stringify({
    page: location.pathname,
    referrer: document.referrer || '',
    tag: params.get('utm_source') || params.get('src') || ''
  });
  try {
    fetch(API + '/site/hit', {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain' },
      body
    }).catch(() => {});
  } catch {
    // Un navigateur trop ancien pour fetch : la page n'est pas comptée, rien d'autre.
  }
}
