# magic.jaycee.ai

Site statique HTML/CSS/JavaScript, avec Supabase pour les comptes, les données et
les règles de progression. Aucun build ni serveur JavaScript supplémentaire.
Servir la racine du dépôt en HTTP pour ouvrir les pages et leurs modules.

## Où chercher

| Emplacement | Rôle |
| --- | --- |
| `*.html` | Pages publiques ; `account.html` redirige vers le panneau du jeu |
| `src/js/config/game-config.js` | Durées des cycles et configuration du jeu |
| `src/js/config/data.js` | Lectures/écritures et appels aux fonctions Supabase |
| `src/js/auth/` | Connexion, inscription et contrôle d'accès au compte |
| `src/js/jaycee/profile-runtime.js` | Interface du jeu, notifications et pratique |
| `src/js/jaycee/profile-core.js` | Dessin du canvas, sans démarrage automatique |
| `src/js/jaycee/account.js`, `game-editor.js` | Panneau du compte et édition des skills |
| `src/js/shell/`, `src/css/`, `src/assets/` | Habillage partagé, styles et ressources |
| [supabase/](supabase/README.md) | Code backend SQL, catalogue des notifications et tests DB |
| [tests/](tests/README.md) | Tests du navigateur avec données simulées |

La page appelle Supabase via `data.js`. La base valide et enregistre les résultats,
puis le JavaScript actualise l'affichage. Modifier un fichier SQL ne déploie rien :
le déploiement de la base est une étape distincte, à demander explicitement.

## Vérifier les changements

Depuis la racine, avec Chrome installé sous Windows :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/browser.ps1
```

Cette commande utilise des mocks et ne modifie aucune base connectée.
Les tests SQL sont séparés et se lancent uniquement dans une base de test choisie.
