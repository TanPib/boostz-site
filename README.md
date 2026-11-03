# boostz.fr

Le site public de Boostz. Statique, sans dépendance, sans étape de construction :
ce que contient ce dépôt est exactement ce qui est servi.

## Pourquoi il est séparé du dépôt de l'application

GitHub Pages ne publie un site depuis un dépôt privé qu'avec un abonnement payant.
`boostz-mobile` est privé et doit le rester ; ce contenu-ci est public par nature.
Les séparer coûte un dépôt et évite d'exposer le code de l'application.

## Déploiement

Un `git push` sur `main` publie. GitHub Pages sert la racine du dépôt, et le
fichier `CNAME` lui indique le domaine.

## Les pages juridiques

`cgu.html`, `cgv.html`, `confidentialite.html`, `mentions-legales.html`,
`traceurs.html` et `conditions-boutiques.html` ne se modifient pas ici : elles
sont générées à partir de `legal/*.md` du dépôt de l'application, les mêmes
textes que l'application, par `npx vite-node scripts/export-legal-site.mjs
<dossier du site>` lancé depuis `mobile/`. Les blocs `[À COMPLÉTER]` d'origine
sont tous remplis depuis le 03/11/2026 (le médiateur de la consommation était
le dernier) ; les textes restent des projets jusqu'à la validation de l'avocat,
et le bandeau en tête de chaque page le dit.
