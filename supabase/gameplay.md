# Jeu et notifications

Référence du comportement actuel. Le code backend est dans [schema.sql](schema.sql),
le catalogue des notifications dans [seed.sql](seed.sql). Ces fichiers ne se
déploient pas automatiquement ; voir [README.md](README.md).

## Pratique et progression

Le navigateur mesure la pratique avec `src/js/jaycee/practice-timer.js` et la
sauvegarde via `src/js/config/data.js`. `public.sync_skill_progress` vérifie le
compte et appelle `private.sync_unlocked_skill_progress`.

`private.complete_practice_goal` vérifie le propriétaire et les conditions du
skill, verrouille la participation, enregistre les objectifs complets et garde
le reste de pratique. Chaque objectif complet ajoute **un an** à
`profiles.years_burned`, y compris pour un ancien skill et au niveau 4. Plusieurs
objectifs dans une sauvegarde ajoutent autant d'années. Une pratique partielle,
un renouvellement de cycle ou une sauvegarde répétée ne donne pas de récompense.

Le goal du skill courant fait également avancer d'un niveau et termine sa
notification. Les anciens skills n'avancent pas la quête courante. Seuls le
compteur et le début de cycle du skill terminé sont remis à jour ; les autres
skills gardent leurs horloges et leur pratique.

Les niveaux 2 et 3 attendent **Accept** avant de démarrer la nouvelle quête.
Le compte doit avoir un accès valide au moment de la sauvegarde : une pratique
tardive ne restaure pas un compte expiré. Le niveau 4 met fin à la progression
des quêtes et accorde `profiles.permanent_account_at`. Les trois skills actifs
restent praticables. Passive et Ultimate ont une description, sans Start/Stop.

Le compte débloque Map/Health/Manna au niveau 2, Skills au niveau 3, puis l'édition
Ultimate et la visibilité au niveau 4. Les droits déjà acquis restent accessibles
après un changement de Master. Le panneau du compte sauvegarde les skills avant
de publier le profil ; les cinq noms doivent être renseignés.

Les durées sont partagées avec `src/js/config/game-config.js` :

| Skill | Cycle passif | Objectif de pratique, en secondes |
| --- | --- | --- |
| 1 / Moon | 2551442.803 secondes | `31556926.08 / 1826.211` |
| 2 / Sun | 86400 secondes | `31556926.08 / 1826.211 / 24` |
| 3 / Earth | 3600 secondes | `31556926.08 / 1826.211 / 576` |

Au niveau 4, les cycles expirés redémarrent à l'heure serveur sans effacer la
pratique et sans créer de complétion. `practice_completions` garde une ligne par
objectif fini : `id`, `player_id`, `skill_number`, `completed_at`. Le propriétaire
et le Master viennent de `player`. Supprimer une participation supprime son historique.

## Premier Master, changements et verrouillage

Avant le tout premier lien, le compte a un cycle Moon depuis sa création Auth
pour choisir un Master. Seuls les profils sans Master, sans participation passée,
privés, nonadmin et nonpermanents sont concernés par ce délai initial.

Après le lien, `private.quest_deadline` utilise :

| Situation | Début et durée du délai |
| --- | --- |
| Niveau 1 | Début du skill 1 + cycle Moon |
| Niveau 2 en attente | Début du skill 1 + cycle Moon |
| Niveau 2 accepté | Début du skill 2 + un jour |
| Niveau 3 en attente | Début du skill 2 + un jour |
| Niveau 3 accepté | Début du skill 3 + une heure |
| Niveau 4 / compte permanent | Pas de verrouillage par expiration de quête |

Le contrôle à la connexion et la tâche `lock-expired-quest-accounts`, exécutée
chaque minute, appliquent ce verrouillage même page fermée. Il interdit la
connexion/actualisation Auth, révoque les sessions et bloque les écritures/lectures
privées protégées. Le navigateur ne peut pas modifier les champs gérés de lock.

Un administrateur peut définir `profiles.locked=false` : le trigger retire le ban
et redonne un délai sans effacer la pratique. Pour le premier choix de Master,
`master_selection_started_at` garde le nouveau départ ; sinon seule l'horloge de
la quête concernée redémarre. Le compte à rebours utilise le même départ.

`switch_player_master` est autorisé pour le premier lien et avant Accept aux
niveaux 2/3. Il conserve la progression de chaque participation. Un nouveau
Master commence au niveau 1 ; revenir vers un ancien reprend sa participation.
L'interface recharge les skills et actualise les panneaux sur place. Le niveau 4
rend le lien permanent. Un Master public doit avoir un profil visible et cinq
skills nommés. Les cartes Jesus/Cedricjbt sont temporairement désactivées côté UI.

## Manna et karma

`years_burned` alimente la barre de vie avec l'âge :
`(âge en années + years_burned) / 1000000`.

Pour chaque skill actif, Manna est calculé depuis son propre début et sa pratique :

```text
target = manna_target * passive_seconds / manna_cycle_seconds
loss   = -target * min(elapsed_seconds, passive_seconds) / passive_seconds
gain   = target * practice_seconds / quest_seconds
```

Le skill courant est en pause avant Accept. Le panneau montre le skill sélectionné ;
sans sélection, il utilise le skill pratiqué ou celui de la quête. Au niveau 4,
il conserve la dernière sélection, sinon le skill pratiqué ou le skill 3.

Passive/Ultimate montrent un bilan annuel depuis la création Auth du compte,
avec l'historique complet et la pratique partielle des participations. La perte
est plafonnée à une année ; cette horloge ne redémarre ni au changement de Master
ni à une complétion. `get_practice_completion_totals` fournit le crédit archivé.
Les cycles de cible Manna sont Year, Month, Day et Hour. Un mois calendaire utilise
le mois du début de cycle. Aucun solde Manna supplémentaire n'est stocké en base.

## Catalogue des notifications

`notifications` contient le catalogue partagé ; `user_notifications` contient les
reçus de chaque compte. `record_notification_events` écrit les événements
`read`, `dismissed`, `clicked`, `completed`, sans effacer leurs dates lors d'un retry.
Un clic ne donne pas de progression. Les quêtes disparaissent selon l'état sauvé.

Le contenu est du JSON avec du texte brut, éventuellement une liste de paragraphes,
un `component`, une `action` et un `actionLabel`. Le renderer utilise des nœuds texte,
sans exécuter du HTML ou des callbacks venant du catalogue.

Variables disponibles :

| Variable | Valeur |
| --- | --- |
| `{passiveSkillName}` | Nom du skill passif du Master |
| `{skillOneName}`, `{skillTwoName}`, `{skillThreeName}` | Noms des trois skills actifs |
| `{skillFourName}` | Nom d'Ultimate |
| `{masterName}` | Nom du Master lié |
| `{firstActivePassiveTime}` | Durée du premier cycle actif |
| `{lifeMaxYears}`, `{prayerKarmaYears}`, `{remainingKarmaYears}` | Valeurs du parcours initial |

Les noms de skills et du Master sont rendus en italique. Composants disponibles :
`masters`, `karma_master`, `master_choices`, `linked_quest`. Actions : `signup`,
`accept_quest` et l'ancien `accept_level_two`. Stages : `guest`, `account`,
`choose_master`, `linked_master`. `content.level` cible un niveau ;
`content.occurrence = "level"` crée un reçu stable par participation/niveau.

Pour modifier du texte sans rejouer une notification, garder son ID. Pour une
nouvelle annonce, utiliser un nouvel ID versionné. Désactiver une ancienne notice
avec `enabled=false`, en conservant les reçus. Les textes modifiés dans le dashboard
ne mettent pas `seed.sql` à jour automatiquement.

Les invités utilisent des reçus locaux, transférés au prochain compte connecté
sur ce navigateur. Les caches et files d'attente sont ensuite isolés par compte.
Les événements non synchronisés sont rejoués lors de la reconnexion ou du retour
sur la page ; une lecture réussie restaure les reçus de la base. Si le stockage
local est bloqué, les reçus restent en mémoire et ne survivent pas à la fermeture.

## Sauvegarde de pratique : limite actuelle

La pratique est enregistrée lors de Stop ou lorsque le goal est atteint.
Fermer/recharger la page avant la sauvegarde peut perdre la session en cours.
Il n'existe pas encore d'autosave périodique ou de reprise persistante des sessions
non sauvegardées. Changer d'onglet ne met pas la pratique en pause. Les délais de
quête continuent même hors ligne. Cette consolidation ne modifie pas ces règles.
