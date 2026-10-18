# Backend Supabase

Ce dossier contient le code qui définit la partie base de données de l'application.
Les fichiers SQL ne sont pas chargés par le navigateur. Enregistrer ou publier le
site ne les applique pas à Supabase.

## Les fichiers utiles

| Fichier/dossier | Usage |
| --- | --- |
| [schema.sql](schema.sql) | Référence complète du schéma applicatif actuel : tables, fonctions, permissions, triggers, bucket et tâche automatique |
| [seed.sql](seed.sql) | Catalogue partagé des notifications, sans comptes ni reçus utilisateur |
| [gameplay.md](gameplay.md) | Règles du jeu, notifications et variables disponibles |
| [migrations/](migrations/README.md) | Prochaines modifications datées de la base |
| [tests/](tests/) | Tests SQL réutilisables, avec annulation des changements |

`profiles.lore` contient l'histoire publique du personnage (Markdown, 20 000
caractères maximum). Elle se modifie dans Account > Skills et se sauvegarde avec
le bouton Save du compte. Les cartes des Masters la chargent avec les skills ;
seul le passif y est consultable. `tests/profile_lore.sql` vérifie la sauvegarde,
la limite de taille et les permissions avec des comptes temporaires, puis annule
ses changements.

La référence initiale `schema.sql` et `seed.sql` a été capturée en lecture seule
le **15 octobre 2026**. `schema.sql` suit ensuite les changements préparés dans le
dépôt ; il peut donc inclure une migration pas encore déployée.
Les anciens scripts de mises à jour ont été consolidés puis supprimés : plusieurs
redéfinissaient les mêmes fonctions avec des versions différentes. Leur historique
reste dans Git. Le dossier `sql/` et le document historique `notifications.md`
ne sont plus les points d'entrée.

## Où se trouve chaque règle

Les fonctions sont regroupées et nommées dans `schema.sql` ; rechercher leur nom :

| Fonction | Responsabilité |
| --- | --- |
| `public.sync_skill_progress` | Point d'entrée de sauvegarde/synchronisation de la pratique |
| `private.sync_unlocked_skill_progress` | Compteurs, progression et renouvellement des cycles |
| `private.complete_practice_goal` | Historique et **un an de karma brûlé par objectif complet** |
| `public.accept_player_quest` | Acceptation des quêtes de niveau 2/3 |
| `public.switch_player_master` | Changement de Master et participation correspondante |
| `public.save_own_game` | Sauvegarde transactionnelle des cinq skills du compte |
| `public.check_account_access`, `private.quest_deadline` | Délai initial, échéances des quêtes et verrouillage |
| `private.lock_expired_quest_accounts` | Vérification automatique chaque minute, même page fermée |
| `public.record_notification_events` | Accusés de lecture/acceptation des notifications |
| `public.create_confirmed_profile`, `private.guard_profile_referrer` | Création du profil et attribution de l'invitation |
| `public.get_public_referrer` | Carte publique de l'invitant, avec les mêmes règles que les Masters |
| `public.is_public_master`, `public.list_public_masters` | Éligibilité et découverte des Masters |

Certaines opérations simples utilisent directement les tables depuis
`src/js/config/data.js` ou le panneau du compte. Les permissions et les politiques
RLS de la base s'appliquent également à ces requêtes.

## Consulter ce qui tourne dans Supabase

Dashboard du projet : **Database → Functions**, schéma `public` ou `private`.
Pour lire une fonction dans le SQL Editor, sans la modifier :

```sql
select pg_get_functiondef(
  'private.complete_practice_goal(uuid,integer)'::regprocedure
);
```

Le fichier local est le code source ; la définition dans Supabase est la version
déployée. Ils ne se synchronisent pas automatiquement. Lire un fichier SQL ne
donne aucun droit d'administration sur la base.

## Modifier une règle

La migration [account_referrals](migrations/20261015230039_account_referrals.sql)
est **déployée depuis le 16 octobre 2026**. Elle ajoute `profiles.referrer_id`, l'unicité des
usernames sans distinction de casse, le traitement des métadonnées à la confirmation
et la recherche publique de l'invitant. Pour une autre base, résoudre d'éventuels
usernames non vides en double ; l'index unique refusera de les rendre ambigus :

```sql
select lower(btrim(username)) as username, count(*)
from public.profiles
where nullif(btrim(username),'') is not null
group by lower(btrim(username)) having count(*) > 1;
```

Conserver ce fichier comme historique ; ne pas le supprimer ni le réexécuter sur cette base.
Le frontend tolère une base sans cette migration, mais celle-ci reste nécessaire
pour enregistrer l'invitant dans les profils. Le test SQL correspondant est
`tests/account_referrals.sql`, à exécuter dans une base de test migrée.

1. Créer une migration avec la procédure de [migrations/README.md](migrations/README.md).
2. Mettre à jour la référence `schema.sql` et le test concerné, sans réécrire les migrations déjà appliquées.
3. Vérifier dans une base de test. Les changements de durées doivent aussi rester cohérents avec `src/js/config/game-config.js`.
4. Déployer uniquement la nouvelle migration, après demande explicite de déploiement.

**Ne pas relancer `schema.sql` ou `seed.sql` sur le projet existant.** Ce sont les
références de l'état actuel et les scripts d'installation d'un nouveau projet,
pas des scripts de mise à jour. Rejouer le catalogue peut écraser des textes édités.

## Nouveau projet et limites de la référence

Sur un **nouveau projet Supabase vide**, les schémas gérés `auth`/`storage` et les
rôles Supabase doivent déjà exister. Exécuter `schema.sql`, puis `seed.sql` en tant
qu'administrateur. Le schéma inclut la configuration du bucket privé `users` et
de la tâche `pg_cron` ; il ne remplace pas l'installation Supabase elle-même.

Il n'inclut aucun utilisateur, profil, jeu personnel, prière, historique de pratique,
fichier uploadé ou secret. Les réglages Auth, SMTP, domaines autorisés et clés du
projet se configurent séparément. Le premier administrateur se désigne dans la base,
après création de son compte. L'URL et la clé publique utilisées par le site sont
dans `src/js/auth/auth.js`.

Cette consolidation a été comparée aux définitions de la base connectée, sans
écriture sur celle-ci. Une restauration complète sur un projet neuf reste à
vérifier avant de s'en servir comme procédure de reprise. Ce n'est pas une
sauvegarde des données.

## Tests

Les fichiers `tests/*.sql` couvrent les quêtes, le karma, l'historique, les droits,
la visibilité et les délais. Ils utilisent `begin`/`rollback` et nécessitent souvent
des comptes/participations de test existants ; lire leur en-tête avant exécution.
Ils ne sont jamais exécutés automatiquement contre la base connectée.

Les tests d'interface se lancent depuis la racine avec `tests/browser.ps1` et des
mocks, sans accès à Supabase. Voir [../tests/README.md](../tests/README.md).
