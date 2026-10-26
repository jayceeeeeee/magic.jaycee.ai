# Environnements

| Environnement | Projet Supabase | Reference | Site |
| --- | --- | --- | --- |
| Production | magic.jaycee.ai | `ndtnfwyfdfdcxljvvjfd` | `magic.jaycee.ai` |
| Developpement | magic-dev | `mylnagvqngsgcmlvwttu` | localhost et domaines de preview |

Le projet `magic-dev` a ete cree le 26 octobre 2026 dans l'organisation `jaycee`,
region Seoul (`ap-northeast-2`), au tarif annonce de 0 $/mois lors de sa creation.
Les tarifs et limites peuvent evoluer avec le plan et l'utilisation.

`src/js/config/app-config.js` contient uniquement les URL et cles publiques.
Seul le hostname exact `magic.jaycee.ai` selectionne la production. Tous les autres
hostnames utilisent le developpement. La branche Git ne choisit pas la base.
Chaque page charge cette configuration avant `auth.js`; sans configuration,
aucun client Supabase n'est cree.

Le developpement a ete initialise depuis `schema.sql`, puis `seed.sql` : huit
tables applicatives avec RLS, quinze notifications, bucket prive `users`, fonctions,
permissions, triggers et tache cron. Aucun joueur, compte ou fichier de production
n'a ete copie. Une comparaison en lecture seule a confirme les memes colonnes,
politiques et triggers qu'en production; les fonctions ne different que par leur
formatage. Ce controle ne remplace pas une sauvegarde de production.

La migration distante `bootstrap_game_schema` correspond a ce bootstrap complet.
Il inclut deja les migrations locales existantes, notamment `profile_lore` : ne
pas les rejouer. Les historiques distants de dev et production sont differents.
Avant une automatisation avec `supabase db push`, reconcilier chaque historique
avec la procedure de `migrations/README.md`.

Pour une nouvelle modification : creer une migration, tester en dev, mettre a jour
`schema.sql`, puis deployer la meme modification en production lors d'une release
explicitement demandee. Ne jamais remplacer les donnees de production par celles
de dev ni appliquer le bootstrap sur un projet existant.

Les profils publics de Buddha, Jesus et Yogananda ont ensuite ete importes avec
leurs jeux, quinze skills et trois avatars. Voir [seeds/README.md](seeds/README.md)
pour la correspondance des comptes, le contenu copie et les verifications.

Le compte personnel Cedric a aussi ete importe le 26 octobre 2026, avec son profil
complet, son jeu, cinq skills, sa participation niveau 4 aupres de Yogananda,
217 objectifs termines, 14 prieres, 19 recus de notifications et sept fichiers
Storage. Son ID de production `d70b5c69-daae-4a77-9955-4385439ae292` correspond a
`89cf977d-ecc0-4dbb-8f4f-fe6b9d7067c5` en dev; le carrousel utilise cette
correspondance. Ses relations et occurrences de notifications ont ete adaptees.
Les essais precedents en dev ont ete remplaces. La sauvegarde de l'ancien profil
dev a ensuite ete supprimee a la demande de l'utilisateur.
Les donnees personnelles et les prieres n'ont pas ete ajoutees au depot.
Les credentials/sessions Auth dev sont conserves. Le role dev reste `user` :
l'approbation automatique a refuse la copie du role `admin` de production sans
autorisation specifique. Les autres donnees importees ont ete comparees champ
par champ a l'instantane source, apres adaptation des identifiants; les sept
fichiers ont ete verifies par SHA-256. Le transfert Storage temporaire a ete
desactive apres execution.

Les 14 prieres de ce compte ont ensuite ete supprimees de production et de dev,
sur demande explicite, apres sauvegarde locale verifiee dans
`.tools/backups/prayers-2026-10-26-353b84c7.json`. Deux scripts de restauration
specifiques a chaque projet accompagnent cette archive. Ces fichiers prives sont
ignores par Git. Le contenu sauvegarde a ete relu et compare avant suppression;
le controle final a confirme zero priere restante pour ce compte dans les deux
bases. Cette archive des prieres est distincte de l'ancienne sauvegarde du profil
dev, qui a ete supprimee.

`magic-dev` est un projet heberge persistant, prevu pour servir d'environnement
de developpement durable. Arreter le serveur local ou changer de branche ne
supprime pas ses donnees. Elles restent presentes tant que le projet n'est pas
reinitialise ou supprime. Une eventuelle mise en pause du projet est distincte
d'une suppression. La copie de production est ponctuelle, pas une synchronisation
automatique : les modifications futures dans chaque environnement sont separees.

Les reglages Auth, SMTP et secrets sont propres a chaque projet. Les secrets ne
vont jamais dans `app-config.js`. Le serveur local et le MCP sont documentes dans
[../mcp/README.md](../mcp/README.md).

Verification initiale : tests navigateur avec mocks, tests SQL `profile_lore.sql`
et `account_referrals.sql` avec rollback, et integration OAuth/MCP reelle en dev.
Les autres tests SQL du jeu demandent leurs propres fixtures; ils n'ont pas tous
ete executes sur cette nouvelle base vide.

L'audit Supabase a aussi signale les droits EXECUTE herites sur deux fonctions
triggers SECURITY DEFINER (`create_confirmed_profile` et `handle_new_user`). Ces
droits proviennent du schema existant; aucune permission de production n'a ete
modifiee dans ce travail. Les revoir avant une release de l'integration.
