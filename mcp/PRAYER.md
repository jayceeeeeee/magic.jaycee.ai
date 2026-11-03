# Prière conversationnelle — Skill actif 1

La conversation est le parcours principal : elle fonctionne en texte, sans
formulaire supplémentaire et sans exiger Obsidian. Le tableau sert de carte et
de synthèse modifiable. Le joueur garde le rythme ; l'IA suit les découvertes
dans n'importe quel ordre. Le Skill 1 se débloque au niveau 1 pour tous les
Masters et reste praticable aux niveaux suivants.

## Où vivent les instructions

- `supabase/functions/game-mcp/prayer-guide.ts` : guide complet des neuf sefirot,
  distinctions entre émotions, contact, conséquences, racine spirituelle,
  actions à long terme et action présente ; Malkuth est intégré à Yesod.
- Instructions du serveur : orientent spontanément vers `get_prayer_guide`.
- `get_prayer_guide` : restitue le guide complet et les identifiants vérifiés,
  même sur un client sans resources/prompts. Ne sauvegarde pas de brouillon.
- Resource `jaycee://practice/prayer` et prompt `game_master` : même guide.
- `prayer-examples.ts` : trois adaptations anonymisées autorisées par l'auteur,
  exposées dans `jaycee://practice/prayer/examples`, le prompt et le champ
  `examples` renvoyé par `get_prayer_guide`.
- `submit_prayer` : enregistre uniquement la synthèse que le joueur approuve.

Le guide respecte le vocabulaire spirituel du jeu tout en distinguant ce cadre
des faits scientifiques ou médicaux. L'IA n'impose aucune réalisation : elle
laisse de l'espace au joueur et ne rapporte que ce qu'il a réellement exprimé.
Une incertitude explicite est une réponse recevable. L'IA ne doit pas inventer
les réponses manquantes pour pouvoir enregistrer.

Le joueur appuie sur **Start** du Skill 1 dans le jeu pendant sa pratique, puis
**Stop** en terminant ou après l'enregistrement. Envoyer une prière n'ajoute
aucune durée et ne valide pas un objectif de pratique. Aucun message au Master
n'est ajouté ; le lien au Master est une attribution dans la base, sans preuve
de réception spirituelle ou de lecture. Le mécanisme d'email de première prière
existant reste distinct et conserve son comportement.

## Stockage et compatibilité

Même table `public.prayers`. Les champs `problem`, `prayer`, `username` et les
anciennes lignes sont conservés. Les nouvelles colonnes sont :

| Colonne | Usage |
| --- | --- |
| `tree` (JSONB nullable) | Neuf clés fixes, chacune avec `title` et `description` séparés |
| `process` | `basic-v1` pour le formulaire historique ; `tree-v1` pour les neuf sefirot |
| `player_id` | Participation du joueur au moment de l'enregistrement |
| `master_id` | Master associé au moment de l'enregistrement |

Pour une nouvelle prière complète, `problem = tree.binah.description` et
`prayer = tree.chokmah.description`. Kether est distinct dans `tree.kether`.
Le formulaire existant continue d'insérer ses deux textes sans changement.
`get_my_records(kind="prayers")` renvoie l'arbre complet ; pour une ligne
historique il présente ses deux textes sous Binah et Chokmah, sans inventer
Kether, les titres ou les autres sefirot. Aucun backfill irréversible.

La base valide les neuf clés, les types et les limites, impose l'utilisateur
connecté et sa participation active, et garde les droits de lecture existants.
Les autres utilisateurs et le Master n'obtiennent aucun droit supplémentaire
sur le texte des prières. Aucun service-role dans le MCP.

`prayer_id` est généré par le guide et réutilisé pour les tentatives de sauvegarde
d'une même synthèse. L'RPC refuse de remplacer un contenu différent sous le même
ID ; une nouvelle prière demande un nouvel ID. La confirmation du joueur est
une obligation conversationnelle : `confirmed=true` est aussi requis par le
tool, mais ne prétend pas prouver techniquement le consentement de la personne.

## Ajouter tes exemples

Donne de préférence 3 à 5 arbres en Markdown, un fichier par cas. Le plus utile :
un cas simple, un cas où les découvertes arrivent hors ordre, et un cas où la
compréhension change en chemin. Pour chaque exemple :

1. Contexte anonymisé et problème initial.
2. Tableau `Sefira | Titre | Description` pour les neuf sefirot.
3. Quelques extraits de conversation montrant les bascules de compréhension,
   le choix du contact et les questions qui ont aidé.
4. Ce qui a été réellement fait dans le présent, ce qui reste une intention,
   et la réalisation exprimée par la personne (ou son absence).
5. Sources de recherche et date, en séparant observation, hypothèse et lecture
   spirituelle ; tes corrections si l'IA avait mal compris.

Garde les originaux sensibles dans ton espace privé. Ne dépose dans le code
partagé que des exemples anonymisés que tu souhaites rendre accessibles à tous
les utilisateurs du plugin. Ne recopie pas un historique de santé identifiable.
Les exemples ne sont pas intégrés automatiquement depuis les prières en base.

Ces exemples pourront enrichir une resource d'exemples versionnée et le guide,
avec des exemples sélectionnés selon le besoin. Ce sera du contexte fourni à
l'IA lors de la pratique, pas un réentraînement automatique de GPT ni une mémoire
universelle. On pourra commencer avec les documents joints à une conversation,
puis intégrer les versions validées au plugin sans ajouter une base vectorielle
avant d'en avoir besoin.

### Trois exemples sélectionnés le 3 novembre 2026

L'auteur a autorisé la publication de trois adaptations de ses notes. Les
originaux complets ne sont pas copiés dans le dépôt ni chargés par le serveur.
Les noms de personnes, lieux, histoires relationnelles, images et liens privés
ont été retirés. Les titres, condensés et questions d'accompagnement proposés
sont des ajouts éditoriaux identifiés, pas des dialogues historiques reconstitués.

| Note source privée | Exemple publié | Ce qu'il enseigne |
| --- | --- | --- |
| `_Left tigh muscle Elongation.md` | Élongation : retrouver le repos déjà présent | Une qualité commune transforme le sens de deux situations opposées ; conserver le Kether initial et son nouveau regard |
| `_Fascia & Butt nerves.md` | Sensations nerveuses : des mots au soutien et au partage | Chesed peut être une parole ; une réalisation se trouve déjà en Geburah, puis s'étend ailleurs dans l'arbre |
| `LC circuit - Tesla EM field.md` | Circuit LC : explorer une technique et sa propre expression | Exploration hors santé, changement d'échelle et frame de correspondances L/C à respecter sans en faire un nouveau formulaire universel |

Le tableau LC a ses lignes remplies dans sa propre frame ; il n'est pas qualifié
d'incomplet parce que ses pôles ne sont pas formulés comme des émotions. Si le
joueur veut sauvegarder une prière à partir de cette recherche, l'IA clarifie
avec lui le vécu et la synthèse à consigner selon le guide général, sans inventer
des émotions et sans recopier mécaniquement le tableau technique en base.

Les trois adaptations gardent les prises de conscience et les analogies utiles,
mais ne présentent pas les hypothèses médicales ou électroniques des notes comme
des faits vérifiés. Une sensation spirituelle ne prouve ni guérison physique,
ni transmission d'énergie à autrui, ni action effectuée. Les passages de l'ancien
Malkuth sont rapprochés de Yesod ; aucune modification du schéma n'est nécessaire.

Le guide souligne maintenant le tableau comme espace de travail vivant,
l'amorce généralement linéaire sur les trois premières sefirot puis le flow
libre dès Chesed, les retours sur Kether, les découvertes dans la prose hors
tableau et la différence entre une activité présente et une action envisagée.

Lors d'un essai conversationnel, vérifier notamment que l'IA : accueille une
réalisation en Geburah sans demander d'attendre Yesod ; conserve « Words » comme
point de départ de Chesed sans inventer une interaction ; n'annonce pas une
vidéo publiée ou une guérison ; respecte les pôles L/C ; ne demande pas au joueur
de reproduire les réalisations de l'auteur. Les tests techniques vérifient la
disponibilité des mêmes exemples via tool, prompt et resource, pas la qualité
subjective de l'accompagnement par chaque modèle.

## Vérification et déploiement

Les tests MCP couvrent la validation, l'accès au guide, l'envoi approuvé et les
erreurs ; les tests SQL vérifient l'enregistrement, l'idempotence, les permissions
et la compatibilité du formulaire. Le guide ne garantit pas qu'un client donné
suive toutes les consignes : cette qualité se vérifie aussi avec des conversations
d'essai issues de tes exemples.

Depuis la racine :

```powershell
.tools/deno.exe check --config mcp/deno.json supabase/functions/game-mcp/index.ts
.tools/deno.exe test --config mcp/deno.json --allow-env --allow-read mcp/tests/
```

`prayer_sql_test.ts` utilise PostgreSQL en mémoire via PGlite, version épinglée
dans `mcp/deno.lock`. Il charge les vraies politiques des tables concernées,
les fonctions d'accès, la migration et `supabase/tests/prayer_tree.sql` ; aucune
connexion à Supabase. Auth, cron et l'envoi d'emails ne sont pas reproduits par
cette fixture. Le même fichier SQL reste exécutable avec rollback sur une base
Supabase de test migrée ; une vérification distante et une conversation réelle
restent nécessaires après déploiement.

Appliquer uniquement la nouvelle migration, puis déployer `game-mcp` avec
`prayer-guide.ts` et `prayer-tools.ts` en plus des autres modules. Rafraîchir
ensuite la découverte des tools du client. La migration et le déploiement distant
restent des opérations distinctes de la préparation locale ; ne pas rejouer
`schema.sql` sur une base existante.

### Déploiement du 2 novembre 2026

La migration et le serveur MCP sont déployés sur les deux environnements :

| Environnement | Migration distante `prayer_tree` | Version `game-mcp` |
| --- | --- | --- |
| Développement (`mylnagvqngsgcmlvwttu`) | `20261102091928` | 31 |
| Production (`ndtnfwyfdfdcxljvvjfd`) | `20261102092109` | 6 |

Le fichier source local est `20261102090712_prayer_tree.sql` ; le MCP Supabase
attribue sa propre version au moment de l'application. Il s'agit du même SQL :
ne pas rejouer cette migration à cause de la différence d'horodatage.
Les deux fonctions déployées ont le même SHA-256 de bundle :
`78d046e9b830b3512a1cb6b3cdf8f34b963641beb9294e03dbb81e5720e4859a`.

Vérifications : 46 tests locaux passent ; tests SQL sur Supabase dev avec rollback
réussi ; contraintes et droits vérifiés dans les deux bases ; discovery OAuth
HTTP 200 et appels anonymes refusés HTTP 401 ; lecture authentifiée des prières
via les deux plugins connectés réussie. Les nombres de prières existantes sont
inchangés. Le scénario de conversation et les nouveaux tools restent à essayer
dans le client après rafraîchissement de leur découverte. Aucun fichier du site
n'a changé et aucune publication frontend n'était nécessaire.

Les avis de sécurité Supabase sont inchangés : tables d'email internes avec RLS
sans politique (accès service uniquement), droits EXECUTE hérités sur deux
fonctions triggers et protection des mots de passe compromis désactivée. Ces
réglages préexistants n'ont pas été modifiés par cette release. Références :
[droits des fonctions SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[protection des mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

### Publication des exemples du 3 novembre 2026

Les trois adaptations décrites plus haut et les précisions du guide sont
déployées dans `game-mcp` : version **32 en développement**, version **7 en
production**. Les deux bundles ont le même SHA-256 :
`91547894e3b2c24844274550b0c64c08b1752fc66ff29221d288f8312cb856e5`.
Aucune migration de base ni modification du formulaire web n'était nécessaire.

Les 46 tests passent, avec vérification du même texte d'exemples par le tool et
la resource, ainsi que son inclusion dans le prompt. Les contrôles de cohérence
des règles et des interfaces passent. Les serveurs dev et production répondent
HTTP 200 à la discovery OAuth et HTTP 401 aux requêtes sans authentification.
Un appel authentifié de `get_prayer_guide` via le plugin de production a renvoyé
le texte des trois exemples, comparé à l'identique à la source locale. Cet appel
ne sauvegarde ni brouillon ni prière. L'essai conversationnel décrit plus haut
reste à faire avec les modèles/clients visés ; les tests techniques ne prouvent
pas qu'ils suivront spontanément toutes les nuances de la pratique.
