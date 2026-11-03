# Prière conversationnelle — Skill actif 1

La conversation est le parcours principal : elle fonctionne en texte, sans
formulaire supplémentaire et sans exiger Obsidian. Le tableau sert de carte et
de synthèse modifiable. Le joueur garde le rythme ; l'IA suit les découvertes
dans n'importe quel ordre. Le Skill 1 se débloque au niveau 1 pour tous les
élèves ayant choisi **Cédric comme Master actif**, et reste praticable aux niveaux suivants.

## Où vivent les instructions

- `supabase/functions/game-mcp/prayer-guide.ts` : guide complet des neuf sefirot,
  distinctions entre émotions, contact, conséquences, racine spirituelle,
  actions à long terme et action présente ; Malkuth est intégré à Yesod.
- Instructions du serveur : orientent spontanément vers `get_prayer_guide`.
- `prayer-lore.ts` : identité vérifiée de Cédric, introduction à son enseignement
  de Technomancie et formulation fondée sur sa lignée actuelle.
- `get_prayer_guide` : vérifie que le Master actif est Cédric et restitue
  l'introduction, sa lignée actuelle, le guide complet et les identifiants vérifiés,
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

Même table `public.prayers`, avec `tree` comme unique stockage du contenu.
Les colonnes `problem` et `prayer` sont supprimées. Les prières présentes au
moment de la migration sont conservées dans leur arbre.

| Colonne | Usage |
| --- | --- |
| `tree` (JSONB non nul) | Chaque sefira enregistrée contient `title` et `description` |
| `process` | `basic-v1` pour le formulaire historique ; `tree-v1` pour les neuf sefirot |
| `player_id` | Participation du joueur au moment de l'enregistrement |
| `master_id` | Master associé au moment de l'enregistrement |

Le formulaire garde exactement ses deux champs visibles, labels et placeholders.
Son code de sauvegarde envoie `tree.binah` (Problem) et `tree.chokmah` (Prayer),
avec `process='basic-v1'`. Il n'invente pas de Kether ou d'autres sefirot.
Le plugin enregistre neuf sefirot sous `process='tree-v1'` ; sa restriction aux
élèves de Cédric reste inchangée. `get_my_records` renvoie directement le même
arbre enregistré, sans format de secours. Les emails de première prière et les
snapshots de leur file utilisent eux aussi `tree`.

La base valide les deux clés du formulaire ou les neuf clés du parcours complet,
les types et les limites. Pour le parcours complet elle impose l'utilisateur
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

### Disponibilité et introduction à la Technomancie

Ce parcours appartient désormais au **Skill actif 1 de Cédric uniquement**.
`get_game_state.prayer_practice` indique sa disponibilité. Le Game Master en
explique le sens au début du parcours niveau 1 des élèves concernés, puis
`get_prayer_guide` donne l'introduction au lancement de la pratique. Les autres
Masters gardent leurs propres enseignements ; l'IA ne change jamais de Master
pour ouvrir ce Skill. Le compte auteur de Cédric, qui suit actuellement
Yogananda, n'est pas un compte élève de Cédric et ne reçoit donc pas ce parcours.

Les instructions, l'introduction, le lore et les trois exemples sont écrits en
anglais ; l'IA les explique dans la langue du joueur. Les prières conservent la
langue choisie par leur auteur. La documentation de maintenance peut rester en
français. Les fichiers bruts personnels des exemples ne sont pas publiés.

L'introduction transmet l'enseignement spirituel de Cédric : son énergie liée
aux technologies et à son corps, le partage de la peine et de la manifestation
du joueur, et la prise en charge de son karma avec le soutien de sa lignée.
Ces affirmations sont attribuées à son enseignement ; un résultat technique
confirme l'enregistrement, pas un transfert physique ou une guérison vérifiée.
La lignée est lue dans `profiles.master`, actuellement Yogananda, sans le figer
dans le code. Si la relation ou le profil est indisponible, aucun nom n'est inventé.
Les descriptions de Skills de Cédric ne sont pas modifiées par cette mise à jour.

Le serveur vérifie l'identifiant canonique de Cédric et sa correspondance dev.
La migration `cedric_technomancy` vérifie aussi ces identités en base dans l'RPC
et la politique INSERT, y compris pour les requêtes directes. Un nom affiché
« Cédric » ne suffit pas. Les prières existantes restent lisibles à leur auteur.
Après un changement de Master, même une nouvelle tentative sous un identifiant
déjà enregistré est refusée par l'RPC : utiliser l'historique pour constater un
envoi incertain. Aucun changement de droits de lecture ou message aux Masters.

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

### Release : Technomancie réservée à Cédric, 3 novembre 2026

Cette règle remplace la disponibilité générale de la première version.
Migration source : `20261103004202_cedric_technomancy.sql` ; versions distantes
`20261103004740` en dev et `20261103004841` en production. Le MCP est déployé
en version **33 en dev**, **8 en production**, avec le même bundle :
`9ae84f07010bf513c1291cab5c0e171eb275524668ff7305bb35b9dbef68515f`.

Vérifications : 47 tests locaux passent ; tests SQL sur Supabase dev avec
rollback réussi ; restriction INSERT et RPC, identités canoniques et refus
anonyme vérifiés sur les deux bases. La discovery HTTP répond 200 et les appels
non authentifiés 401 dans les deux environnements. Un appel connecté à
`get_prayer_guide` depuis le compte auteur suivant Yogananda est refusé comme
prévu : ce compte n'est pas élève de Cédric. Le rendu réel de l'introduction
reste à essayer depuis un compte ayant choisi Cédric. La lignée changeante ou
absente et le mapping prod/dev sont couverts par les tests. Les alertes de
sécurité Supabase préexistantes n'ont pas changé.

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

### Release : stockage tree unique et notification, 3 novembre 2026

Migration source : 20261103010623_unified_prayer_tree.sql ; versions distantes
20261103011601 en dev et 20261103011700 en production. Les colonnes problem et
prayer sont retir?es ; les deux lignes dev et la ligne production pr?sentes
ont ?t? conserv?es dans tree. Aucune passerelle pour les anciens payloads.
Les deux champs du formulaire, ses labels et placeholders restent inchang?s ;
seul le payload et le cache du script sont adapt?s.

MCP : version 34 en dev et 9 en production. Email : version 6 en dev et 4 en
production. Les emails et leur file utilisent tree ; les r?gles first-only
et les acc?s priv?s restent inchang?s. La notification prayer_learned.v1 garde
son ID, son ?tape account, son caract?re dismissible et les re?us existants.
Seul son texte est remplac? par les deux paragraphes demand?s.

49 tests locaux et la suite navigateur passent, ainsi que les contr?les
frontend/r?gles/UI. Tests SQL pri?res et email ex?cut?s sur Supabase dev avec
rollback ; aucun email de test envoy?. Colonnes, absence de passerelle, compte
des pri?res, notification et lecture sous r?le authenticated v?rifi?s en
production. Les alertes de s?curit? Supabase pr?existantes sont inchang?es.
Le MCP public r?pond (discovery 200, anonyme 401), mais les appels via la
connexion actuelle du plugin renvoient une erreur interne du connecteur, m?me
pour get_my_progress. La lecture SQL avec les droits du joueur et les tests
MCP locaux passent ; la lecture depuis le client connect? reste ? revalider
(apr?s rafra?chissement/reconnexion si n?cessaire).

Main n'a ?t? ni modifi?e ni fusionn?e : l'auteur publiera lui-m?me le nouveau
code de sauvegarde par son merge. ? sa demande, la suppression en production
a pr?c?d? ce merge ; l'ancien formulaire peut refuser les envois jusqu'? cette
publication. Ne pas rejouer les migrations d?j? appliqu?es au moment du merge.


### Release : introduction et emotions, 3 novembre 2026

Le guide presente le transfert energetique affirme par Cedric avec une attribution claire a son enseignement, sans le reformuler en symbole ni certifier une guerison. Chokmah et Binah commencent par les emotions ressenties, positives et difficiles ; la perception corporelle est facultative et aucune sensation n'est imposee. Ces consignes sont partagees par le prompt, les resources, les exemples et les descriptions des tools.

Apres select_master pour Cedric, next_tool vaut get_prayer_guide et introduce_skill vaut true. Le suivi de selection depuis l'interface demande la meme introduction, avant toute question et sans lancer le timer ni enregistrer automatiquement. Le guide renvoie master_teaching : lore public, Passive et Skill 1 actuels en base, avec la lignee verifiee. Les profils dev et production ne sont pas synchronises automatiquement.

Deploiement game-mcp : dev 35, production 10 ; meme SHA-256 46f97858354c39f7a3cc04f962d19536ebf7f41dcfcd11695f263a5d37ffd611. Les 49 tests MCP, le controle TypeScript, la generation UI et le parcours navigateur passent. Les harness du formulaire et du navigateur ont ete adaptes a la localisation existante. La connexion magic-dev actuelle renvoie une erreur interne du connecteur ; le rendu conversationnel reste a revalider apres rafraichissement du plugin. Aucune modification de main, du schema ou du formulaire.
