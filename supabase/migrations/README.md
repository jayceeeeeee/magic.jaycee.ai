# Futures migrations

Une migration décrit **un changement** de la base : ajouter une colonne, modifier
une fonction ou une permission. Garder les fichiers appliqués pour suivre l'ordre
des changements ; ne pas les supprimer simplement parce qu'ils ont déjà servi.

Avec la CLI Supabase installée, créer un fichier daté :

```sh
supabase migration new describe_change
```

La commande génère `supabase/migrations/<timestamp>_describe_change.sql`.
Mettre uniquement le changement nécessaire dans ce fichier, mettre à jour
`../schema.sql` pour conserver la référence actuelle, puis tester avant déploiement.
La création du fichier ne modifie pas la base distante.

Le projet existant a déjà un historique distant antérieur à cette consolidation.
`schema.sql` est un instantané, pas une migration à ajouter artificiellement à cet
historique. Avant une première utilisation de `supabase db push`, récupérer et
réconcilier l'historique avec la CLI. Ne pas réinitialiser la base ni marquer des
migrations comme appliquées pour contourner une différence d'historique.

Pour une petite modification, le fichier de migration peut aussi être exécuté
explicitement dans le SQL Editor du projet choisi. Garder le même fichier dans
Git et ne jamais appliquer automatiquement l'ensemble des SQL du dépôt.

Le déploiement sur la base connectée nécessite une demande explicite. Les tests
et la préparation du code ne valent pas demande de déploiement.
