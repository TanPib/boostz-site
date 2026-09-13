// Les neuf jeux, tels que le site les dessine.
//
// Les emblèmes sont des dessins originaux (aucun logo d'éditeur, brief §11.2).
// Les couleurs sont celles de l'application, mobile/src/constants/games.js,
// valeurs pour fond sombre : la teinte porte la reconnaissance d'un jeu et doit
// être la même ici que dans l'app. c2 est la même teinte, éclaircie, pour les
// dégradés ; jamais une autre teinte.

const NS = 'http://www.w3.org/2000/svg';

const EMBLEMS = {
  pkm: '<circle cx="24" cy="24" r="17"/><path d="M7 24 h10.5M30.5 24 H41"/><circle cx="24" cy="24" r="6.5"/><circle cx="24" cy="24" r="2" fill="#FFF" stroke="none"/>',
  ygo: '<path d="M24 7 42 38 H6 Z"/><path d="M24 18.5 33 33.5 H15 Z" stroke-width="1.8"/>',
  opc: '<path d="M13.5 29.5 c0-10.5 4.5-16.5 10.5-16.5 s10.5 6 10.5 16.5"/><path d="M13.5 25.5 h21" stroke-width="2"/><ellipse cx="24" cy="30.5" rx="18.5" ry="5"/>',
  lor: '<path d="M24 9 L28 19.5 39.2 20.1 30.5 27.1 33.4 37.9 24 31.8 14.6 37.9 17.5 27.1 8.8 20.1 20 19.5 Z" fill="#FFF" stroke="none"/><path d="M39.5 7.5 l1 2.7 2.7 1-2.7 1-1 2.7-1-2.7-2.7-1 2.7-1Z" fill="#FFF" stroke="none"/>',
  swu: '<path d="M6.5 6.5 17.5 15.5M41.5 6.5 30.5 15.5M6.5 41.5 17.5 32.5M41.5 41.5 30.5 32.5M24 4.5V13M24 43.5V35M4.5 24H13M43.5 24H35"/><circle cx="24" cy="24" r="3.2" fill="#FFF" stroke="none"/>',
  mtg: '<path d="M24 9 39.2 20 33.4 38.9 H14.6 L8.8 20 Z" stroke-width="1.5"/><circle cx="24" cy="9" r="3.2" fill="#FFF" stroke="none"/><circle cx="39.2" cy="20" r="3.2" fill="#FFF" stroke="none"/><circle cx="33.4" cy="38.9" r="3.2" fill="#FFF" stroke="none"/><circle cx="14.6" cy="38.9" r="3.2" fill="#FFF" stroke="none"/><circle cx="8.8" cy="20" r="3.2" fill="#FFF" stroke="none"/>',
  acr: '<path d="M38 10 C24 10 12 18 10.5 34 c8 2 17 0 22-6 4.5-5.5 5.5-12 5.5-18 Z"/><path d="M10.5 34 C16 25 24 18 33 14" stroke-width="1.6"/><path d="M10.5 34 8 40.5" stroke-width="2"/>',
  dbs: '<circle cx="24" cy="24" r="15.5"/><path d="M12.5 16.5 a13.5 13.5 0 0 1 5.5-5.5" stroke-width="1.6"/><path d="M24 17.5 l2 4.3 4.7.5-3.5 3.1 1 4.6-4.2-2.4-4.2 2.4 1-4.6-3.5-3.1 4.7-.5Z" fill="#FFF" stroke="none"/>',
  wow: '<path d="M10 8.5 30.5 29M38 8.5 17.5 29"/><path d="M10 8.5 15 9 15.5 14M38 8.5 33 9 32.5 14" stroke-width="1.8"/><path d="M27 33 35 25M13 25 21 33" stroke-width="2.6"/><path d="M31.5 30 37.5 36M16.5 30 10.5 36" stroke-width="2.6"/><circle cx="39" cy="37.5" r="2" fill="#FFF" stroke="none"/><circle cx="9" cy="37.5" r="2" fill="#FFF" stroke="none"/>'
};

export const TCG_ORDER = ['pkm', 'ygo', 'opc', 'lor', 'swu', 'mtg', 'acr', 'dbs', 'wow'];

export const TCGS = {
  pkm: { name: 'Pokémon', short: 'Pokémon', c1: '#F5C93B', c2: '#F9DC7A' },
  ygo: { name: 'Yu-Gi-Oh!', short: 'Yu-Gi-Oh!', c1: '#B189E8', c2: '#CBB0F0' },
  opc: { name: 'One Piece Card Game', short: 'One Piece', c1: '#F2706C', c2: '#F7A19E' },
  lor: { name: 'Disney Lorcana', short: 'Lorcana', c1: '#35C6BC', c2: '#7ADBD4' },
  swu: { name: 'Star Wars: Unlimited', short: 'Star Wars', c1: '#A9B2C4', c2: '#C8CEDA' },
  mtg: { name: 'Magic: The Gathering', short: 'Magic', c1: '#C0A183', c2: '#D6C0AA' },
  acr: { name: 'Animal Crossing', short: 'Animal Crossing', c1: '#9AD45C', c2: '#BDE393' },
  dbs: { name: 'Dragon Ball Super', short: 'Dragon Ball', c1: '#F58A4E', c2: '#F9B287' },
  wow: { name: 'World of Warcraft TCG', short: 'Warcraft', c1: '#58A6DD', c2: '#8CC2E8' }
};

// L'emblème d'un jeu, en SVG. `glow` en pixels, halo à la couleur du jeu.
// Le contenu inséré est une constante de ce fichier, jamais une donnée venue
// du serveur.
export function emblemSvg(id, size = 24, glow = 8) {
  const t = TCGS[id];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', '#FFF');
  svg.setAttribute('stroke-width', '2.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.flex = 'none';
  if (t && glow) svg.style.filter = `drop-shadow(0 0 ${glow}px ${t.c1})`;
  svg.innerHTML = EMBLEMS[id] || '';
  return svg;
}
