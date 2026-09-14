// Ce que toutes les pages partagent : une fabrique d'éléments sûre, l'en-tête,
// le logo et quelques formats.
//
// Tout texte venu de l'API passe par `text` (textContent), jamais par du HTML :
// un pseudo ou un message de membre ne doit jamais pouvoir s'exécuter dans la
// page d'un administrateur.
import { session, clearSession, isVerifiedAdmin } from './api.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') node.textContent = String(value);
    else if (key === 'class') node.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// append() natif écrit « null » en toutes lettres pour un enfant absent : put()
// ignore null, undefined et false, comme el(), pour les blocs conditionnels.
export function put(node, ...children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function logo(href = 'index.html') {
  return el('a', { class: 'bz-logo', href, 'aria-label': 'boostZ, accueil' },
    el('span', { class: 'bz-logo-boost', text: 'boost' }),
    el('span', { class: 'bz-logo-z', 'aria-hidden': 'true' },
      el('span', { class: 'g1', text: 'Z' }),
      el('span', { class: 'g2', text: 'Z' }),
      el('span', { class: 'z', text: 'Z' })
    )
  );
}

export const initialOf = (user) => String((user && (user.pseudo || user.email)) || '?').charAt(0).toUpperCase();

export function roleLabel(user) {
  if (!user) return '';
  if (user.is_super_admin) return 'Super admin';
  return user.role === 'admin' ? 'Admin' : 'Membre';
}

export function rolePillClass(user) {
  if (user && user.is_super_admin) return 'bz-pill is-amber';
  return user && user.role === 'admin' ? 'bz-pill is-violet' : 'bz-pill is-grey';
}

// L'en-tête des pages de démarche. `next` est la page où revenir après
// connexion ; `label` l'étiquette de la page ; `adminLabel` l'habille en ambre.
export function renderTop(host, { label = '', next = '', adminLabel = false, onLogout } = {}) {
  const s = session();
  const user = s && s.user;
  const right = el('div', { class: 'bz-top-right' });

  if (user) {
    if (!adminLabel) right.append(el('a', { class: 'bz-top-link bz-hide-sm', href: 'compte.html', text: 'Mon compte' }));
    // Le bouton suit le rôle CONFIRMÉ par le serveur pendant ce chargement, jamais
    // la copie locale de la session (voir verifiedUser dans api.js).
    if (isVerifiedAdmin() && !adminLabel) {
      right.append(el('a', { class: 'bz-btn is-violet is-sm', href: 'admin.html', text: 'Admin' }));
    }
    if (adminLabel) {
      right.append(el('a', { class: 'bz-top-link bz-hide-sm', href: 'compte.html', text: 'Mon compte' }));
      right.append(el('span', { class: rolePillClass(user), text: roleLabel(user) }));
    }
    right.append(el('span', { class: 'bz-avatar', title: user.pseudo || user.email || '', text: initialOf(user) }));
    right.append(el('button', {
      class: 'bz-btn is-sm',
      type: 'button',
      text: 'Déconnexion',
      onclick: () => {
        clearSession();
        if (onLogout) onLogout();
        else location.href = 'index.html';
      }
    }));
  } else {
    const target = 'connexion.html' + (next ? '?next=' + encodeURIComponent(next) : '');
    right.append(el('a', { class: 'bz-btn is-primary is-sm', href: target, text: 'Se connecter' }));
  }

  const bar = el('header', { class: 'bz-top' },
    logo(),
    label ? el('span', { class: 'bz-top-label' + (adminLabel ? ' is-admin' : ''), text: label }) : null,
    right
  );
  clear(host).append(bar);
  return bar;
}

const DATE_FR = { day: 'numeric', month: 'long', year: 'numeric' };
const DATE_SHORT = { day: 'numeric', month: 'short' };

export function dateFr(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', DATE_FR);
}

export function dateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', DATE_SHORT);
}

export function dateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', DATE_FR) + ' · ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
}

// Même chose, mois abrégé : pour les colonnes étroites d'un tableau.
export function dateTimeShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { ...DATE_SHORT, year: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
}

// Un bandeau de message dans `host`. type : ok | err | info | note.
export function say(host, text, type = 'ok') {
  clear(host);
  if (text) host.append(el('div', { class: 'bz-msg is-' + type, role: type === 'err' ? 'alert' : 'status', text }));
}

export function lockIcon(size = 22) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M12 2a5 5 0 0 0-5 5v3H5v12h14V10h-2V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z');
  svg.append(p);
  return svg;
}

// L'écran « il faut une session » : titre, texte, bouton vers la connexion.
export function gate(host, { title, text, next, red = false, cta = 'Se connecter' }) {
  clear(host).append(el('section', { class: 'bz-gate' },
    el('span', { class: 'bz-gate-icon' + (red ? ' is-red' : '') }, lockIcon(24)),
    el('h1', { text: title }),
    el('p', { class: 'bz-lead', text }),
    el('a', {
      class: 'bz-btn is-primary',
      style: { marginTop: '22px', padding: '13px 26px', fontSize: '13px', borderRadius: '13px' },
      href: 'connexion.html?next=' + encodeURIComponent(next),
      text: cta
    })
  ));
}

// Les captures jointes à une demande de support depuis l'application. Les
// adresses sont fabriquées par l'API (jamais reprises d'un client, voir
// server/src/routes/support.js) ; on n'accepte pourtant que https, ou localhost
// en développement, pour qu'une valeur inattendue ne devienne jamais un lien
// javascript: ou data: dans la page d'un administrateur.
const SAFE_IMAGE = /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/)/i;

export function thumbs(urls) {
  const list = (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && SAFE_IMAGE.test(u));
  if (!list.length) return null;
  return el('div', { class: 'bz-thumbs' },
    list.map((u, i) => el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', title: 'Ouvrir la capture ' + (i + 1) },
      el('img', { src: u, alt: 'Capture jointe ' + (i + 1), loading: 'lazy', referrerpolicy: 'no-referrer' })
    ))
  );
}
