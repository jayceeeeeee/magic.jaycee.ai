# magic.jaycee.ai

Site statique HTML/CSS/JavaScript, avec Supabase pour les comptes, les données et
les règles de progression. Aucun build ni serveur JavaScript supplémentaire.
Servir la racine du dépôt en HTTP pour ouvrir les pages et leurs modules.

Pour proposer une prière depuis un skill dans un nouvel onglet, utiliser
`/prayer.html?close=1`. Après l’enregistrement, la page tente de fermer son onglet.
Si le navigateur refuse, un message invite à le fermer pour revenir au jeu déjà
ouvert. Sans ce paramètre, la redirection habituelle est conservée.

La configuration publique des connexions est dans `src/js/config/app-config.js` :
`magic.jaycee.ai` utilise la production ; localhost et les previews utilisent
`magic-dev`. Voir [les environnements](supabase/environments.md) et
[le serveur MCP et le lancement local](mcp/README.md).

## Où chercher

| Emplacement | Rôle |
| --- | --- |
| `*.html` | Pages publiques ; `account.html` redirige vers le panneau du jeu |
| `supabase/functions/game-mcp/game-rules.ts` | Règles officielles ; version navigateur générée dans `src/js/config/game-rules.js` |
| `src/js/config/data.js` | Lectures/écritures et appels aux fonctions Supabase |
| `src/js/auth/` | Connexion, inscription, définition du mot de passe après invitation Supabase et contrôle d'accès au compte |
| `src/js/referral.js` | Liens d'invitation et transport du paramètre `ref` jusqu'au signup |
| `src/js/jaycee/profile-runtime.js` | Interface du jeu, notifications et pratique |
| `src/js/jaycee/account.js`, `game-editor.js` | Panneau du compte et édition des skills |
| `src/css/`, `src/assets/` | Styles et ressources du jeu |
| `src/js/ui-sounds.js`, `src/js/jaycee/sounds.js` | Sons partagés des boutons/liens et effets du jeu |
| [supabase/](supabase/README.md) | Code backend SQL, catalogue des notifications et tests DB |
| [tests/](tests/README.md) | Tests du navigateur avec données simulées |

La page appelle Supabase via `data.js`. La base valide et enregistre les résultats,
puis le JavaScript actualise l'affichage. Modifier un fichier SQL ne déploie rien :
le déploiement de la base est une étape distincte, à demander explicitement.

## Vérifier les changements

La langue de l’interface est gérée par `src/js/i18n.js`, avec l’anglais par
défaut et le choix mémorisé dans le navigateur (`jaycee:language`). Les messages
français sont centralisés dans `src/js/locales/fr.js` : le texte anglais sert de
clé, et les paramètres `{name}` doivent être conservés dans la traduction.
Utiliser `setText` / `setAttributeText` pour les messages dynamiques et
`data-i18n` / `data-i18n-attrs` pour le HTML. Les notifications sont traduites
avant l’insertion des noms et autres valeurs, sans modifier leurs reçus en base.
Tout nouveau texte du catalogue de notifications doit aussi être ajouté au
dictionnaire. Les contenus écrits par les joueurs restent dans leur langue.

Depuis la racine, avec Chrome installé sous Windows :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/browser.ps1
.tools/deno.exe run --allow-read scripts/check-frontend.ts
```

Cette commande utilise des mocks et ne modifie aucune base connectée.
Le contrôle frontend vérifie les références locales, les imports atteignables depuis
les pages et les variables CSS, sans accès réseau.
Les tests SQL sont séparés et se lancent uniquement dans une base de test choisie.
