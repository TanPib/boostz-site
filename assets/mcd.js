// LE MODÈLE CONCEPTUEL DE DONNÉES, dessiné : d'où vient une donnée, qui va la
// chercher, dans quelle table elle atterrit, et qui la lit.
//
// POURQUOI C'EST ÉCRIT À LA MAIN. Aucune route ne rend le schéma Prisma, et en
// rendre une reviendrait à publier la structure de la base sur une page
// statique. Ce fichier est donc une CARTE, tenue à la main, et une carte
// vieillit : la règle est qu'elle ne dise que des choses stables - les couches,
// les tables principales et leurs liens - et jamais un chiffre qui bouge.
//
// CE QUI EST VIVANT, EN REVANCHE, vient du rapport de GET /admin/data : chaque
// source extérieure, chaque cron et chaque passe porte ici la pastille de
// couleur que l'onglet Data lui donne ailleurs. C'est tout l'intérêt d'un
// schéma dans une console plutôt que dans un document : on y voit le chemin ET
// son état.
//
// Relevé sur server/prisma/schema.prisma le 23/09/2026 (63 modèles) et sur
// server/src/lib/upstreamHealth.js pour les sources et les crons. Complété le
// 05/10/2026 (81 modèles) avec ce qu'apporte la mise en ligne d'octobre :
// CardTrader, récompenses de collection, boutiques, juridique, modération.

// Les couches, de la source extérieure jusqu'à l'écran. `pick` dit quelles
// pastilles vivantes une case porte : les identifiants sont ceux du rapport
// (provider.id, cron.id, ou un préfixe de clé de passe).
export const LAYERS = [
  {
    id: 'sources',
    title: 'Les sources extérieures',
    note: 'Personne ne saisit un catalogue à la main : tout vient d’API publiques, une par jeu ou presque.',
    nodes: [
      { label: 'Catalogues des 9 jeux', detail: 'TCGdex, Scryfall, YGOPRODeck, OPTCG API, LorcanaJSON, starwarsunlimited.com, dbs-cardgame.com, warcraft.wiki.gg', providers: ['tcgdex', 'scryfall', 'ygoprodeck', 'optcgapi', 'lorcanajson', 'swu', 'dbs', 'wowwiki'] },
      { label: 'Cotes et scellés', detail: 'tcgcsv (Lorcana, Dragon Ball, SWU, Warcraft et tous les scellés), PriceCharting (Animal Crossing), Frankfurter (USD → EUR)', providers: ['tcgcsv', 'tcgplayer', 'pricecharting', 'frankfurter'] },
      { label: 'Marché', detail: 'eBay Browse : les annonces d’où sortent les cotes marché ; CardTrader : le prix d’entrée par langue et par état', providers: ['ebay', 'cardtrader'] },
      { label: 'IA et traduction', detail: 'Gemini puis Anthropic en secours ; MyMemory pour les actus ; Claude écrit les récompenses des nouvelles extensions', providers: ['gemini', 'anthropic', 'mymemory'] },
      { label: 'Services', detail: 'Supabase Storage (photos), OpenStreetMap, data.gouv.fr, SIRENE, Resend', providers: ['supabase', 'osm', 'datagouv', 'sirene', 'resend'] }
    ]
  },
  {
    id: 'batch',
    title: 'Ce qui va les chercher',
    note: 'Rien n’est appelé pendant qu’un membre attend : trois crons GitHub réveillent le serveur, qui tient ses propres passes dans UpstreamSync.',
    nodes: [
      { label: 'Cron · Cotes', detail: 'toutes les 30 min — relance les passes de cote en retard, puis relève 60 cotes CardTrader', crons: ['price-tick'] },
      { label: 'Cron · Actus', detail: 'toutes les 3 h — flux, traduction, résumé', crons: ['news-tick'] },
      { label: 'Cron · Scellés', detail: 'chaque jour à 05:40 UTC — parcours tcgcsv', crons: ['sealed-tick'] },
      { label: 'Passes quotidiennes', detail: 'une par jeu et par nature (catalogue, cotes, scellés) ; Pokémon Japon toutes les semaines. UpstreamSync garde leur dernière réussite.', syncs: true },
      { label: 'Passes du serveur lui-même', detail: 'récompenses par l’IA (toutes les 6 h), séries d’événements des boutiques (toutes les 6 h), photos orphelines et conservation des comptes (une fois par jour, sur Render seulement)', tables: false },
      { label: 'Cotes marché, à la demande', detail: 'eBay n’est appelé qu’à l’ouverture d’une fiche, et pré-chauffé seulement au-dessus de 1 500 appels restants', providers: ['ebay'] }
    ]
  },
  {
    id: 'catalogue',
    title: 'Le catalogue partagé',
    note: 'Une seule copie pour tout le monde. C’est là que vit la langue : une ligne de catalogue EST française, anglaise ou japonaise.',
    nodes: [
      { label: 'CatalogSetGroup → CatalogSet → CatalogCard', detail: 'Les séries, les extensions, les cartes. CatalogCard porte `language` et son extension via catalogSetId.', tables: true },
      { label: 'CardPrice', detail: 'La cote d’une carte, par tirage et par source. Exactement une des deux clés : catalogCardId (8 jeux) ou tcgdexId (Pokémon).', tables: true },
      { label: 'SealedProduct', detail: 'Les scellés, et leur langue. Une édition française est une ligne jumelle « -fr » qui pointe l’anglaise par baseProductId.', tables: true },
      { label: 'MarketplaceListing · MarketplaceSale', detail: 'Les annonces eBay retenues, et les ventes conclues. Une seule des trois clés est posée : carte de catalogue, exemplaire, ou scellé.', tables: true },
      { label: 'CatalogPriceHistory · SealedPriceHistory · CardmarketSnapshot', detail: 'L’historique, d’où sortent les courbes et les variations. Une série par tirage ET par langue.', tables: true },
      { label: 'CardtraderExpansion · CardtraderBlueprint · CardtraderLink', detail: 'La correspondance avec CardTrader, et le relevé de ses annonces par langue et par état.', tables: true },
      { label: 'SetReward', detail: 'Le titre et le sceau de chaque extension : un stock écrit à l’avance, complété par l’IA pour les sorties suivantes.', tables: true }
    ]
  },
  {
    id: 'membre',
    title: 'La collection du membre',
    note: 'Un exemplaire n’est jamais une copie de la carte : il pointe la ligne de catalogue, et garde ce qui lui est propre — état, tirage, langue, photos.',
    nodes: [
      { label: 'User → UserSettings', detail: 'Le compte, ses réglages, ses jeux et langues actifs, son Boostz Pass (passActiveUntil, passPlan).', tables: true },
      { label: 'Card', detail: 'Un exemplaire possédé. catalogCardId vers le catalogue, et `language` figée à l’ajout.', tables: true },
      { label: 'UserSealedItem', detail: 'Un scellé possédé. Pas de colonne de langue : c’est le produit qui la porte.', tables: true },
      { label: 'Alert · WantListItem · TrackedCard · TrackedSealedProduct', detail: 'Ce qu’un membre surveille — et ce qui décide quelles cotes méritent d’être rafraîchies.', tables: true },
      { label: 'Exchange → ExchangeItem', detail: 'Les échanges, et leur contenu : une carte de catalogue, un exemplaire ou un scellé. Le RDV peut se tenir dans une boutique partenaire.', tables: true },
      { label: 'SetCompletion', detail: 'Une extension complétée dans une langue : la prime versée, le titre et le sceau remis.', tables: true },
      { label: 'TcgVenue → VenueProfile · VenueManager · VenueEvent · VenueReviewReply · VenueRequest', detail: 'Les boutiques : la fiche tenue par leur gérant, leurs événements, leurs réponses aux avis, et les demandes des membres.', tables: true },
      { label: 'LegalAcceptance · ModerationDecision', detail: 'Chaque acceptation des CGU avec sa version, et chaque décision de modération motivée.', tables: true },
      { label: 'BonusCodeRedemption · PhotoUploadDaily', detail: 'Un code bonus utilisé une fois par compte ; le quota de photos du jour.', tables: true },
      { label: 'BoostieTransaction · AnalysisCreditTransaction', detail: 'Deux registres séparés par choix : les Boosties (cosmétiques) et les crédits d’analyse (appels réels).', tables: true }
    ]
  },
  {
    id: 'lecture',
    title: 'Ce qui les lit',
    note: 'Deux clients, une seule API Express — et tout passe par le même snake_case.',
    nodes: [
      { label: 'Application mobile', detail: 'Collection, Progression, fiches, échanges, boutique. Le seul client des membres.', tables: false },
      { label: 'Console boostz.fr', detail: 'Cette page : comptes, signalements, support, idées, revenus, Data. Toutes les routes sont derrière requireAdmin.', tables: false },
      { label: 'Notifications et e-mails', detail: 'Notification en base, Resend pour l’e-mail, selon NotificationPreference.', providers: ['resend'] }
    ]
  }
];

// Les passes de fond, telles que le serveur les nomme. Le rythme et la source
// sont stables ; l'état, lui, vient du rapport.
export const BATCHES = [
  { key: 'catalogue:*', label: 'Catalogue, par jeu', rhythm: 'chaque jour', source: 'L’API du jeu', writes: 'CatalogSet, CatalogCard' },
  { key: 'cards:*', label: 'Cotes, par jeu', rhythm: 'chaque jour', source: 'L’API du jeu, ou tcgcsv', writes: 'CardPrice, CatalogPriceHistory' },
  { key: 'tcgcsv:*', label: 'tcgcsv, par jeu', rhythm: 'chaque jour', source: 'tcgcsv.com', writes: 'CardPrice, SealedProduct' },
  { key: 'tcgcsv:pokemon-japan', label: 'tcgcsv · Pokémon Japon', rhythm: 'chaque semaine', source: 'tcgcsv.com, catégorie 85', writes: 'SealedProduct (ja)' },
  { key: 'sealed:*', label: 'Scellés, par jeu', rhythm: 'chaque jour, 05:40 UTC', source: 'tcgcsv.com', writes: 'SealedProduct, SealedPriceHistory' },
  { key: 'news', label: 'Actus', rhythm: 'toutes les 3 h', source: 'Flux des éditeurs, MyMemory, Gemini', writes: 'NewsSource, NewsArticle' },
  { key: 'market', label: 'Cotes marché', rhythm: 'à l’ouverture d’une fiche, puis en cache', source: 'eBay Browse', writes: 'MarketplaceListing, MarketplaceSale' },
  { key: 'cardtrader', label: 'CardTrader', rhythm: 'toutes les 30 min, avec le cron des cotes', source: 'api.cardtrader.com, une lecture par seconde', writes: 'CardtraderLink, CardPrice' },
  { key: 'places', label: 'Lieux d’échange', rhythm: 'à la demande, mis en cache', source: 'Overpass, Nominatim, data.gouv.fr, SIRENE', writes: 'TcgVenue, BrocanteEvent' }
];

// Les règles de lecture qui ne se devinent pas sur un schéma, et qu'on redit à
// chaque fois qu'un écran se trompe.
export const RULES = [
  'Une donnée de catalogue est PARTAGÉE : l’écrire pour un membre l’écrit pour tous.',
  'La langue vient du catalogue, jamais d’un choix — et elle est figée à l’ajout de l’exemplaire.',
  'Pokémon n’a pas de table de cartes : son catalogue vit chez TCGdex, en cache, et ses cotes se lient par tcgdexId.',
  'Plusieurs clés nullables dont EXACTEMENT une est posée : Exchange, ExchangeItem, MarketplaceListing, MarketplaceSale, Alert, CardPrice. La règle tient dans le code, pas dans le schéma.',
  'Le fil est en snake_case, Prisma en camelCase : chaque route déclare ses mappeurs toApi* en tête de fichier.'
];
