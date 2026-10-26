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
