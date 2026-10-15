# Tests du navigateur

Depuis la racine, avec Chrome à son emplacement Windows habituel :

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/browser.ps1
```

La suite utilise Chrome headless, des mocks et un dossier temporaire, supprimé
après succès et conservé en cas d'erreur pour le diagnostic. Elle ne se
connecte pas à Supabase et n'a pas besoin de Node ni d'un serveur HTTP.

| Fichier | Couverture |
| --- | --- |
| `browser.ps1` | Syntaxe des modules JS, rendu du canvas, notifications, placeholders, carrousel et locks, compte à rebours, acceptation, panneau du compte et sauvegarde des skills |
| `notifications.test.mjs` | Reçus, stockage local, reconnexion, isolation des comptes et reprises après erreur |
| `level-two-quest.test.mjs`, `level-three-quest.test.mjs`, `level-four.test.mjs` | Éligibilité des notifications aux différents niveaux |
| `manna.test.mjs` | Calculs par skill et cumul annuel |
| `quest-lock-auth.test.mjs` | Connexion, déconnexion et échéances d'accès |
| `menu-sounds.test.mjs` | Destination de Play selon la session, attente de fin du son pour Play/Continue/liens, audio refusé ou bloqué et contrôles désactivés |

Les fichiers `.mjs` sont chargés par la suite navigateur. Les tests backend sont
dans [../supabase/tests/](../supabase/tests/) et se lancent séparément dans une base
de test : les mocks ne valident pas l'exécution réelle des fonctions SQL.
