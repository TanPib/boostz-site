// Le sticker du comptoir d'une boutique partenaire (31/10/2026, le passage
// récompensé) : ce que « Télécharger le sticker » de la console (venues.js)
// dessine, et l'aperçu de la fiche.
//
// LE CHEMIN PRINCIPAL : LE DESIGN EN SVG, assets/sticker/comptoir.svg, fourni
// par TanPib et copié tel quel (il embarque DM Sans 700 en base64). Une page
// de 88 × 122 mm (viewBox en mm) avec 3 mm de fond perdu, et quatre calques
// qui comptent ici :
//   - `qr` : un carré blanc de 56 mm, marge de 4 modules comprise, et les
//     modules d'un QR de démonstration. La console REMPLACE son contenu par
//     le QR de la boutique, dans le même style (stickerQrShapes), et met son
//     adresse dans data-url. Taille, marge et correction se lisent sur le
//     groupe (data-taille-mm, data-marge-modules, data-correction : H, parce
//     que le Z du centre couvre des modules) ;
//   - `logo-qr` : le Z violet posé sur le centre du QR, gardé tel quel ; les
//     modules qu'il couvre ne sont pas dessinés, comme sur la démonstration ;
//   - `ref` : le texte où la console écrit la référence (« B-042 »). S'il
//     manque, la référence est écrite en petit sous le QR, dans la police et
//     la couleur du sticker ;
//   - `decoupe` : la découpe, masquée, gardée telle quelle pour l'imprimeur.
// Le fichier exporté est ce SVG complet (88 × 122 mm), et un PNG d'au moins
// 600 dpi rendu depuis lui.
//
// LE REPLI : LE QR SEUL, si le design ne se charge pas. C'était le seul
// export quand le design n'existait qu'en PNG (« sticker boutique -
// boostz.png », 900 × 1240 px, hors du dépôt) : le QR aux dimensions exactes
// de la zone QR de ce PNG, avec sa référence dessous. Mesures en px du
// design : carte arrondie blanche x 40 → 860 (820 de large), en-tête sombre
// jusqu'à y 319, zone des modules 438 × 438 à partir de (231, 400), ligne
// « Scanne, gagne 50 Boosties » vers y 898. Le fichier couvre la zone, plus
// une bande de 56 qui porte la référence : 438 × 494. Les modules remplissent
// toute la largeur : la marge blanche qu'exige un QR (4 modules) vient du
// blanc du design autour de la zone (191 px à gauche et à droite, 81 au-dessus
// jusqu'à l'en-tête, pour un module de 13,3). La référence reste à 2,5 modules
// au moins sous les modules.
//
// TROIS ÉTAGES, pour que la géométrie se teste sans navigateur :
//   - qrMatrix : le texte → la grille du QR (bibliothèque qrcode-generator) ;
//   - stickerQrShapes et stickerGeometry : la grille → une liste de formes
//     (rectangles arrondis, cadres, anneaux, polygone, texte), sans DOM ;
//   - svgShape/stickerSvg et drawSticker : deux rendus de la même liste, en
//     texte SVG et sur un <canvas>.
//
// LA BIBLIOTHÈQUE (qrcode-generator 2.0.4, Kazuhiko Arase, licence MIT) est
// copiée telle quelle dans assets/vendor/ : la CSP de la console n'admet que
// les fichiers du site. C'est un script classique, qui pose la variable
// globale `qrcode` ; il n'est chargé qu'à la première fiche qui en a besoin.
// Mode octet, version choisie par la bibliothèque : l'adresse d'une boutique
// (37 octets) tient en version 5 en correction H (37 × 37), en version 4 en Q.

export const DESIGN = Object.freeze({
  zone: 438, // le côté de la zone des modules (repli)
  band: 56, // la bande de la référence, sous les modules (repli)
  logo: 90, // le carré violet du centre (repli)
  cardWidth: 820, // la carte arrondie du sticker PNG (repli)
  printCardMm: 80 // la largeur d'impression prévue de cette carte (repli)
});

export const COLORS = Object.freeze({
  paper: '#FFFFFF',
  ink: '#17131F', // les modules, comme le design
  logo: '#7C3AED',
  z: '#FFFFFF',
  ref: '#5E5774' // le gris des petites lignes du bas du sticker
});

// La référence : DM Sans 700, la police que le design lui donne (son élément
// `ref`). Le SVG du repli n'en dépend pas : Arial ensuite. Le PNG charge la
// police web de la console.
const SYSTEM_FONT = 'Arial, Helvetica, \'Liberation Sans\', sans-serif';
const REF_FONT = '\'DM Sans\', ' + SYSTEM_FONT;
const REF_WEIGHT = 700;
const REF_SIZE = 20;
// La hauteur des capitales, en fraction du corps, mesurée dans Chrome : 0,70
// pour DM Sans gras, 0,72 pour Arial gras. La plus grande place la référence
// sous la marge de 2,5 modules quelle que soit la police qui l'écrit.
const CAP = 0.72;
const REF_QUIET = 2.5;
// Le PNG du repli fait au moins 2048 px de large, un module y mesurant un
// nombre entier de pixels. Celui du design complet est rendu à 600 dpi.
const MIN_PNG = 2048;
const DPI = 600;

// Le Z du favicon (assets/favicon.svg, boîte de 64), comme points.
const Z_POINTS = [[19, 17], [45, 17], [45, 24], [30, 40], [45, 40], [45, 47], [19, 47], [19, 40], [34, 24], [19, 24]];
// Incliné comme le Z du design, en italique : 9 degrés.
const Z_SLANT = Math.tan(9 * Math.PI / 180);

const SVG_NS = 'http://www.w3.org/2000/svg';
const LEVELS = ['L', 'M', 'Q', 'H'];

// ---------- La grille ----------

// `lib` : la fonction `qrcode` de la bibliothèque. Rend { count, isDark(r, c) }.
export function qrMatrix(lib, text, level = 'Q') {
  const qr = lib(0, LEVELS.includes(level) ? level : 'Q');
  qr.addData(text, 'Byte');
  qr.make();
  return { count: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
}

// ---------- Les formes ----------
//   { kind: 'rect', x, y, w, h, r, fill } - un rectangle à coins arrondis ;
//   { kind: 'frame', x, y, w, h, r, stroke, width } - le même, tracé et non
//     rempli, le trait centré sur son bord (les repères du design SVG) ;
//   { kind: 'ring', x, y, w, h, r, inset, ri, fill } - un rectangle arrondi
//     évidé d'un autre, retrait `inset` et rayon `ri` (les repères du repli) ;
//   { kind: 'polygon', points: [[x, y], …], fill } - le Z du repli ;
//   { kind: 'text', x, y, text, size, weight, fill, family } - la référence,
//     centrée sur x, `y` étant sa ligne de base.

const finderOrigins = (n) => [[0, 0], [0, n - 7], [n - 7, 0]];
const inFinder = (n, r, c) => finderOrigins(n).some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);

// Le QR du design SVG, en unités du groupe `qr` (des mm) : le carré blanc de
// `size`, marge comprise, puis les modules, puis les repères. Les proportions
// sont celles de la démonstration du design (pas 1,5135 mm : module 1,332,
// rayon 0,363 ; anneau à 0,5 pas du bord du repère, 6 pas de côté, trait d'un
// pas, rayon 1,968 ; centre de 3 pas, rayon 1,059), rapportées au pas.
// `clear` : la boîte du logo dans ces unités, ou null ; un module dont la case
// la touche n'est pas dessiné.
export function stickerQrShapes(matrix, { size, margin = 4, clear = null }) {
  const n = matrix.count;
  const p = size / (n + 2 * margin);
  const at = (i) => (margin + i) * p;
  const hidden = (r, c) => !!clear
    && at(c + 1) > clear.x && at(c) < clear.x + clear.w
    && at(r + 1) > clear.y && at(r) < clear.y + clear.h;
  const shapes = [{ kind: 'rect', x: 0, y: 0, w: size, h: size, r: 0, fill: COLORS.paper }];
  const mod = 0.88 * p;
  const off = (p - mod) / 2;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix.isDark(r, c) || inFinder(n, r, c) || hidden(r, c)) continue;
      shapes.push({ kind: 'rect', x: at(c) + off, y: at(r) + off, w: mod, h: mod, r: 0.24 * p, fill: COLORS.ink });
    }
  }
  for (const [fr, fc] of finderOrigins(n)) {
    shapes.push({ kind: 'frame', x: at(fc) + p / 2, y: at(fr) + p / 2, w: 6 * p, h: 6 * p, r: 1.3 * p, stroke: COLORS.ink, width: p });
    shapes.push({ kind: 'rect', x: at(fc + 2), y: at(fr + 2), w: 3 * p, h: 3 * p, r: 0.7 * p, fill: COLORS.ink });
  }
  return shapes;
}

// Le QR seul du repli, en px du design PNG. La première forme est le fond
// blanc, zone et bande ; la dernière, la référence.
// Rend { width, height, count, module, shapes }.
export function stickerGeometry(matrix, ref) {
  const n = matrix.count;
  const m = DESIGN.zone / n;
  const width = DESIGN.zone;
  const height = DESIGN.zone + DESIGN.band;
  const shapes = [{ kind: 'rect', x: 0, y: 0, w: width, h: height, r: 0, fill: COLORS.paper }];

  // Les trois repères : des anneaux arrondis et leur œil, comme le design.
  for (const [fr, fc] of finderOrigins(n)) {
    shapes.push({ kind: 'ring', x: fc * m, y: fr * m, w: 7 * m, h: 7 * m, r: 1.6 * m, inset: m, ri: 0.7 * m, fill: COLORS.ink });
    shapes.push({ kind: 'rect', x: (fc + 2) * m, y: (fr + 2) * m, w: 3 * m, h: 3 * m, r: 0.7 * m, fill: COLORS.ink });
  }

  // Le logo au centre. Les modules qu'il toucherait à un demi-module près sont
  // retirés, comme sur le design PNG : un blanc d'un module environ l'entoure.
  const logoAt = (DESIGN.zone - DESIGN.logo) / 2;
  const clearFrom = logoAt - m / 2;
  const clearTo = logoAt + DESIGN.logo + m / 2;
  const cleared = (i) => i * m < clearTo && (i + 1) * m > clearFrom;

  // Les modules : des carrés arrondis (rayon 20 % du module), un peu en retrait
  // les uns des autres, comme ceux du design (13 px pour un pas de 15).
  const inset = 0.07 * m;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!matrix.isDark(r, c) || inFinder(n, r, c) || (cleared(r) && cleared(c))) continue;
      shapes.push({ kind: 'rect', x: c * m + inset, y: r * m + inset, w: m - 2 * inset, h: m - 2 * inset, r: 0.2 * m, fill: COLORS.ink });
    }
  }

  shapes.push({ kind: 'rect', x: logoAt, y: logoAt, w: DESIGN.logo, h: DESIGN.logo, r: 0.24 * DESIGN.logo, fill: COLORS.logo });
  const s = (DESIGN.logo / 2) / 30; // le Z fait la moitié du carré en hauteur
  const mid = DESIGN.zone / 2;
  shapes.push({
    kind: 'polygon',
    points: Z_POINTS.map(([x, y]) => [mid + (x - 32) * s + Z_SLANT * (32 - y) * s, mid + (y - 32) * s]),
    fill: COLORS.z
  });

  // La référence, centrée, ses capitales à 2,5 modules au moins sous les
  // modules. Si une version plus petite rendait les modules plus gros, le
  // corps rapetisse plutôt que de sortir de la bande.
  const quiet = REF_QUIET * m;
  const size = Math.min(REF_SIZE, (DESIGN.band - quiet - 2) / CAP);
  const capTop = Math.max(quiet, (DESIGN.band - size * CAP) / 2);
  shapes.push({ kind: 'text', x: mid, y: DESIGN.zone + capTop + size * CAP, text: String(ref || ''), size, weight: REF_WEIGHT, fill: COLORS.ref, family: REF_FONT });

  return { width, height, count: n, module: m, shapes };
}

// ---------- Rendu SVG ----------

const num = (v) => String(Math.round(v * 1000) / 1000);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function roundRectD(x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  if (!k) return `M${num(x)} ${num(y)}H${num(x + w)}V${num(y + h)}H${num(x)}Z`;
  const a = `A${num(k)} ${num(k)} 0 0 1 `;
  return `M${num(x + k)} ${num(y)}H${num(x + w - k)}${a}${num(x + w)} ${num(y + k)}V${num(y + h - k)}`
    + `${a}${num(x + w - k)} ${num(y + h)}H${num(x + k)}${a}${num(x)} ${num(y + h - k)}V${num(y + k)}${a}${num(x + k)} ${num(y)}Z`;
}

export function svgShape(s) {
  switch (s.kind) {
    case 'rect':
      return `<rect x="${num(s.x)}" y="${num(s.y)}" width="${num(s.w)}" height="${num(s.h)}"${s.r ? ` rx="${num(s.r)}"` : ''} fill="${s.fill}"/>`;
    case 'frame':
      return `<rect x="${num(s.x)}" y="${num(s.y)}" width="${num(s.w)}" height="${num(s.h)}" rx="${num(s.r)}" fill="none" stroke="${s.stroke}" stroke-width="${num(s.width)}"/>`;
    case 'ring':
      return `<path fill-rule="evenodd" fill="${s.fill}" d="${roundRectD(s.x, s.y, s.w, s.h, s.r)}${roundRectD(s.x + s.inset, s.y + s.inset, s.w - 2 * s.inset, s.h - 2 * s.inset, s.ri)}"/>`;
    case 'polygon':
      return `<polygon points="${s.points.map(([x, y]) => num(x) + ',' + num(y)).join(' ')}" fill="${s.fill}"/>`;
    case 'text':
      return `<text x="${num(s.x)}" y="${num(s.y)}" text-anchor="middle" font-family="${esc(s.family || REF_FONT)}" font-size="${num(s.size)}" font-weight="${s.weight}" fill="${s.fill}">${esc(s.text)}</text>`;
    default:
      return '';
  }
}

// Le repli : une carte de sticker imprimée à 80 mm de large, 1 px du design
// valant 80/820 mm (la zone fait 42,7 mm). La viewBox reste en px du design.
export function stickerSvg(geo, { title = '' } = {}) {
  const mm = (px) => num(px * DESIGN.printCardMm / DESIGN.cardWidth) + 'mm';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="${SVG_NS}" width="${mm(geo.width)}" height="${mm(geo.height)}" viewBox="0 0 ${num(geo.width)} ${num(geo.height)}">`,
    title ? `<title>${esc(title)}</title>` : null,
    ...geo.shapes.map(svgShape),
    '</svg>',
    ''
  ].filter((x) => x !== null).join('\n');
}

// ---------- Rendu canvas ----------

function roundRectPath(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

// Peint des formes sur un contexte 2D, `scale` pixels par unité.
export function drawSticker(ctx, geo, scale, fontFamily = null) {
  ctx.save();
  ctx.scale(scale, scale);
  for (const s of geo.shapes) {
    ctx.beginPath();
    if (s.kind === 'rect') {
      ctx.fillStyle = s.fill;
      roundRectPath(ctx, s.x, s.y, s.w, s.h, s.r);
      ctx.fill();
    } else if (s.kind === 'frame') {
      ctx.strokeStyle = s.stroke;
      ctx.lineWidth = s.width;
      roundRectPath(ctx, s.x, s.y, s.w, s.h, s.r);
      ctx.stroke();
    } else if (s.kind === 'ring') {
      ctx.fillStyle = s.fill;
      roundRectPath(ctx, s.x, s.y, s.w, s.h, s.r);
      roundRectPath(ctx, s.x + s.inset, s.y + s.inset, s.w - 2 * s.inset, s.h - 2 * s.inset, s.ri);
      ctx.fill('evenodd');
    } else if (s.kind === 'polygon') {
      ctx.fillStyle = s.fill;
      s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
    } else if (s.kind === 'text') {
      ctx.fillStyle = s.fill;
      ctx.font = `${s.weight} ${s.size}px ${fontFamily || s.family || REF_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(s.text, s.x, s.y);
    }
  }
  ctx.restore();
}

// La taille du PNG du repli : au moins 2048 px de large, un nombre entier de
// pixels par module.
export function pngSize(geo) {
  const perModule = Math.ceil(MIN_PNG / geo.count);
  const width = perModule * geo.count;
  const scale = width / geo.width;
  return { width, height: Math.round(geo.height * scale), scale };
}

// DM Sans, déclarée par site.css, chargée si elle ne l'est pas déjà ; la pile
// système si elle ne vient pas (réseau, page sans site.css).
async function refFontFamily() {
  try {
    await document.fonts.load(`${REF_WEIGHT} ${REF_SIZE}px 'DM Sans'`);
    if ([...document.fonts].some((f) => f.family.replace(/['"]/g, '') === 'DM Sans' && f.status === 'loaded')) return REF_FONT;
  } catch {
    // FontFaceSet absent ou refusé : la pile système.
  }
  return SYSTEM_FONT;
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Le navigateur n’a pas pu produire le PNG.'))), 'image/png');
  });
}

export async function stickerPng(geo) {
  const { width, height, scale } = pngSize(geo);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawSticker(canvas.getContext('2d'), geo, scale, await refFontFamily());
  return canvasBlob(canvas);
}

// ---------- Le design SVG ----------

const TEMPLATE_URL = new URL('./sticker/comptoir.svg', import.meta.url).href;

// Le texte du design, lu une fois par chargement de la console. Une lecture
// ratée (réseau, 404) rend { error } : l'export passe au repli, en le disant,
// et la lecture sera retentée au prochain export.
let template = null;
function loadTemplate() {
  if (!template) {
    template = fetch(TEMPLATE_URL, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.text().then((text) => ({ text })) : { error: 'erreur ' + res.status }))
      .catch(() => ({ error: 'le réseau ne répond pas' }));
    template.then((t) => { if (t.error) template = null; });
  }
  return template;
}

const fmtMm = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

// Une boîte (getBBox) d'un élément, ramenée dans le repère d'un autre.
function boxIn(target, el) {
  const b = el.getBBox();
  const from = el.getCTM();
  const to = target.getCTM();
  if (!from || !to) return null;
  const m = to.inverse().multiply(from);
  const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
    .map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

// Le design avec le QR et la référence de la boutique. getBBox et getCTM
// demandent un SVG dans la page : le temps des mesures, il est posé hors de
// l'écran. Rend { root, width, height, widthMm, heightMm, print } : le <svg>
// composé, détaché ; sa taille en unités de la viewBox et, s'il la donne en
// mm, sa taille physique ; et la phrase d'impression (« 88 × 122 mm, fond
// perdu de 3 mm compris »).
function composeTemplate(text, lib, url, ref) {
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') {
    throw new Error('assets/sticker/comptoir.svg n’est pas un SVG lisible');
  }
  const root = document.importNode(parsed.documentElement, true);
  // Ses <style> restent dehors pendant les mesures : posés dans la page, ils
  // s'y appliqueraient, et la CSP de la console refuse la police en data:
  // qu'ils déclarent. Ils reviennent à leur place avant l'export.
  const styles = [...root.querySelectorAll('style')].map((s) => [s, s.parentNode, s.nextSibling]);
  for (const [s] of styles) s.remove();
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;visibility:hidden;pointer-events:none';
  holder.append(root);
  document.body.append(holder);
  try {
    const qr = root.querySelector('[id="qr"]');
    if (!qr) throw new Error('le design n’a pas d’élément id="qr"');
    const size = Number.parseFloat(qr.getAttribute('data-taille-mm')) || Math.min(qr.getBBox().width, qr.getBBox().height);
    if (!(size > 0)) throw new Error('le groupe id="qr" du design n’a pas de taille');
    const margin = Number.parseInt(qr.getAttribute('data-marge-modules'), 10);
    const level = (qr.getAttribute('data-correction') || 'H').toUpperCase();
    const matrix = qrMatrix(lib, url, level);
    const logo = root.querySelector('[id="logo-qr"]');
    const shapes = stickerQrShapes(matrix, { size, margin: margin >= 0 ? margin : 4, clear: logo ? boxIn(qr, logo) : null });

    // Le contenu du groupe est remplacé ; le groupe, sa place, sa
    // transformation et ses attributs restent.
    const fresh = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${shapes.map(svgShape).join('')}</svg>`, 'image/svg+xml').documentElement;
    while (qr.firstChild) qr.removeChild(qr.firstChild);
    for (const node of [...fresh.childNodes]) qr.append(document.importNode(node, true));
    qr.setAttribute('data-url', url);

    const refEl = root.querySelector('[id="ref"]');
    if (refEl) writeRef(refEl, ref);
    else {
      // Pas de place prévue : en petit sous le QR, police et couleur du sticker.
      const k = size / 56;
      const t = document.createElementNS(SVG_NS, 'text');
      const attrs = {
        x: num(size / 2), y: num(size + 3.2 * k), 'text-anchor': 'middle', 'font-family': REF_FONT,
        'font-weight': String(REF_WEIGHT), 'font-size': num(2.4 * k), 'letter-spacing': num(0.3 * k), fill: COLORS.ref
      };
      for (const [key, value] of Object.entries(attrs)) t.setAttribute(key, value);
      t.textContent = ref;
      qr.append(t);
    }

    const vb = root.viewBox && root.viewBox.baseVal;
    const width = vb && vb.width ? vb.width : root.width.baseVal.value;
    const height = vb && vb.height ? vb.height : root.height.baseVal.value;
    if (!(width > 0 && height > 0)) throw new Error('le design n’a ni viewBox ni taille');
    if (!vb || !vb.width) root.setAttribute('viewBox', `0 0 ${num(width)} ${num(height)}`);
    const mm = (attr) => (/^\s*[\d.]+\s*mm\s*$/.test(root.getAttribute(attr) || '') ? Number.parseFloat(root.getAttribute(attr)) : null);
    const widthMm = mm('width');
    const heightMm = mm('height');
    // Le fond perdu : l'écart entre la page et la découpe, qu'on mesure sur
    // une copie visible du calque masqué.
    let bleed = 0;
    const cut = root.querySelector('[id="decoupe"]');
    if (cut) {
      const probe = cut.cloneNode(true);
      probe.removeAttribute('id');
      probe.removeAttribute('style');
      cut.parentNode.append(probe);
      const b = probe.getBBox();
      probe.remove();
      bleed = Math.min(b.x, b.y) * (widthMm ? widthMm / width : 1);
    }
    const print = widthMm && heightMm
      ? `${fmtMm(widthMm)} × ${fmtMm(heightMm)} mm` + (bleed > 0 ? `, fond perdu de ${fmtMm(bleed)} mm compris` : '')
      : null;
    return { root, width, height, widthMm, heightMm, print };
  } finally {
    holder.remove();
    for (const [s, parent, next] of styles) parent.insertBefore(s, next);
  }
}

// `ref` est un texte : la référence remplace le sien, dans son premier
// <tspan> s'il en a (les logiciels de dessin y mettent la position).
function writeRef(refEl, ref) {
  const spans = refEl.querySelectorAll('tspan');
  if (!spans.length) {
    refEl.textContent = ref;
    return;
  }
  spans.forEach((span, i) => { span.textContent = i ? '' : ref; });
}

// Un SVG en image n'a accès qu'à ce qu'il contient : DM Sans y est déjà, en
// data:. Si un jour le design nomme une autre police du site sans l'embarquer,
// elle est glissée dans l'image, pour le PNG et l'aperçu seulement ; le
// fichier SVG exporté reste tel que le design l'écrit.
const SITE_FONTS = [
  ['Exo', '400 600', 'exo-var.woff2'],
  ['DM Sans', '500 700', 'dmsans-var.woff2'],
  ['Outfit', '800', 'outfit-800.woff2'],
  ['Poppins', '700', 'poppins-700.woff2'],
  ['Poppins', '800', 'poppins-800.woff2']
];
const familiesOf = (list) => list.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);

async function missingFontFaces(root) {
  const declared = new Set();
  const used = new Set();
  for (const style of root.querySelectorAll('style')) {
    const css = style.textContent;
    for (const face of css.match(/@font-face\s*\{[^}]*\}/g) || []) {
      const m = /font-family\s*:\s*([^;}]+)/.exec(face);
      if (m) familiesOf(m[1]).forEach((f) => declared.add(f));
    }
    for (const m of css.replace(/@font-face\s*\{[^}]*\}/g, '').matchAll(/font-family\s*:\s*([^;}]+)/g)) familiesOf(m[1]).forEach((f) => used.add(f));
  }
  for (const node of root.querySelectorAll('[font-family]')) familiesOf(node.getAttribute('font-family')).forEach((f) => used.add(f));
  const wanted = SITE_FONTS.filter(([family]) => used.has(family) && !declared.has(family));
  const rules = await Promise.all(wanted.map(async ([family, weight, file]) => {
    const res = await fetch(new URL('./fonts/' + file, import.meta.url).href);
    if (!res.ok) return '';
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2')}`;
  }));
  return rules.join('');
}

// Le design composé, à la taille demandée en pixels, en texte SVG prêt à
// devenir une image.
async function templateImageXml(root, widthPx, heightPx) {
  const copy = root.cloneNode(true);
  copy.setAttribute('width', num(widthPx));
  copy.setAttribute('height', num(heightPx));
  const css = await missingFontFaces(root);
  if (css) {
    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = css;
    copy.insertBefore(style, copy.firstChild);
  }
  return new XMLSerializer().serializeToString(copy);
}

// Le PNG du design complet : 600 dpi si le design donne sa taille en mm
// (88 mm → 2079 px), sinon 2048 px de large au moins. L'image est décodée
// (polices embarquées comprises) avant d'être peinte.
async function templatePng(composed) {
  const width = composed.widthMm ? Math.ceil(composed.widthMm / 25.4 * DPI) : Math.max(MIN_PNG, Math.ceil(composed.width));
  const height = composed.heightMm ? Math.ceil(composed.heightMm / 25.4 * DPI) : Math.round(width * composed.height / composed.width);
  const href = URL.createObjectURL(new Blob([await templateImageXml(composed.root, width, height)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = href;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    return await canvasBlob(canvas);
  } finally {
    URL.revokeObjectURL(href);
  }
}

// ---------- La bibliothèque, l'aperçu et les fichiers ----------

let library = null;

export function loadQrLibrary() {
  if (typeof globalThis.qrcode === 'function') return Promise.resolve(globalThis.qrcode);
  if (!library) {
    library = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./vendor/qrcode-generator.js?v=2.0.4', import.meta.url).href;
      script.onload = () => (typeof globalThis.qrcode === 'function'
        ? resolve(globalThis.qrcode)
        : reject(new Error('La bibliothèque du QR code est introuvable.')));
      script.onerror = () => {
        library = null;
        script.remove();
        reject(new Error('La bibliothèque du QR code n’a pas pu être chargée.'));
      };
      document.head.append(script);
    });
  }
  return library;
}

// Seuls lettres, chiffres et tirets entrent dans un nom de fichier.
const fileRef = (ref) => String(ref || 'sans-ref').replace(/[^A-Za-z0-9-]/g, '');

// Le design composé, ou le repli et sa raison.
async function prepare(url, ref) {
  const [lib, t] = await Promise.all([loadQrLibrary(), loadTemplate()]);
  if (!t.error) {
    try {
      return { lib, composed: composeTemplate(t.text, lib, url, ref) };
    } catch (e) {
      return { lib, fallback: e.message };
    }
  }
  return { lib, fallback: 'le design ne se charge pas (' + t.error + ')' };
}

// L'aperçu de la fiche : ce que contiendra le fichier, en image data: (la CSP
// de la console l'admet). Rend { src, full, print, fallback }. Gardé par
// adresse et référence : la fiche se repeint souvent.
const previews = new Map();
export function stickerPreviewSrc(url, ref) {
  const key = url + '\n' + ref;
  if (!previews.has(key)) {
    const p = prepare(url, ref).then(async ({ lib, composed, fallback }) => {
      if (composed) {
        const xml = await templateImageXml(composed.root, composed.width * 5, composed.height * 5);
        return { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml), full: true, print: composed.print };
      }
      const svg = stickerSvg(stickerGeometry(qrMatrix(lib, url), ref));
      return { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), full: false, fallback };
    });
    p.catch(() => previews.delete(key));
    previews.set(key, p);
  }
  return previews.get(key);
}

// Les deux fichiers du sticker : { full, fallback, files: [{ name, blob }] },
// SVG puis PNG. `full` : le sticker complet ; sinon le QR seul, et `fallback`
// dit pourquoi.
export async function stickerFiles(url, ref) {
  const { lib, composed, fallback } = await prepare(url, ref);
  if (composed) {
    const base = 'boostz-sticker-comptoir-' + fileRef(ref);
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(composed.root) + '\n';
    return {
      full: true,
      files: [
        { name: base + '.svg', blob: new Blob([xml], { type: 'image/svg+xml' }) },
        { name: base + '.png', blob: await templatePng(composed) }
      ]
    };
  }
  const geo = stickerGeometry(qrMatrix(lib, url), ref);
  const base = 'boostz-comptoir-' + fileRef(ref);
  return {
    full: false,
    fallback,
    files: [
      { name: base + '.svg', blob: new Blob([stickerSvg(geo, { title: 'BoostZ · QR code du comptoir ' + ref })], { type: 'image/svg+xml' }) },
      { name: base + '.png', blob: await stickerPng(geo) }
    ]
  };
}
