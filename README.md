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

## À faire avant la première publication

Les deux pages légales contiennent des blocs `[À COMPLÉTER]` : identité de
l'éditeur, adresse de contact, date de publication. Ils sont volontairement
visibles — tant qu'ils y sont, les pages ne doivent pas être annoncées aux
stores. Aucun n'est un détail : Apple refuse une application dont la politique
de confidentialité ne désigne pas de responsable de traitement joignable.
