# Première prière : notification email

Un email est envoyé dès qu'un visiteur soumet une prière **avant inscription**.
Chaque prière anonyme déclenche une notification ; aucune identité de visiteur
fiable ne permet de dédupliquer par personne. Pour un compte connecté, seule sa
première prière déclenche un email. Aucun email historique n'est envoyé.

La migration crée une file `first_prayer_emails`, inaccessible aux clients. Sa clé
primaire identifie chaque notification ; les contraintes uniques sur `user_id`
et `prayer_id` évitent les doublons de compte et de prière. Les identifiants de
compte nuls sont acceptés pour les visiteurs. Le contenu est figé dans la file. La fonction lit cette
entrée côté serveur ; un appelant ne choisit ni le destinataire ni le contenu.

## Configuration par projet

Préparer ces secrets dans **Edge Functions → Secrets**, jamais dans le frontend :

| Name | Value |
| --- | --- |
| `RESEND_API_KEY` | Clé Resend avec permission d'envoi sur le domaine validé |
| `PRAYER_NOTIFICATION_FROM` | `Magic <notifications@magic.jaycee.ai>` |
| `PRAYER_NOTIFICATION_TO` | `jaubertcedric13@gmail.com` |

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis par Supabase.
Pour le dev, utiliser un destinataire de test explicite et un expéditeur autorisé.

La migration génère automatiquement le secret interne dans **Database → Vault**.
La fonction le lit avec une RPC réservée à `service_role` ; il n'y a aucun secret
de webhook à copier dans les secrets Edge Functions. Enregistrer seulement l'URL :

| Nom | Valeur |
| --- | --- |
| `prayer_email_project_url` | URL Supabase du projet concerné |

Ne pas placer les valeurs de secrets dans une migration ou dans Git. Ne pas
confondre le secret de webhook, la clé Resend et la clé publique Supabase.

## Publication

Vérifier et publier d'abord en dev ; la production nécessite une demande de release.
Déployer `index.ts` et `handler.ts` sous le nom `first-prayer-email` avec la
vérification JWT désactivée : la fonction authentifie le webhook par son secret.
Exemple CLI, après consultation de `supabase functions deploy --help` :

```sh
supabase functions deploy first-prayer-email --project-ref PROJECT_REF --no-verify-jwt
```

Appliquer les migrations `20261028235034_first_prayer_email.sql`, puis
`20261029000308_anonymous_prayer_email.sql` au projet
visé, sans rejouer l'historique complet. Ajouter l'URL dans Vault une fois
la fonction et ses secrets prêts. Sans URL dans Vault, la file reste en attente.
Le schéma de référence `schema.sql` contient le même mécanisme pour les projets neufs.

L'envoi se fait après validation de la transaction, puis toutes les cinq minutes
en cas d'échec. Resend reçoit une clé d'idempotence stable par prière. La reprise
s'arrête après 23 heures à partir de la première tentative, avant expiration de la
fenêtre d'idempotence Resend de 24 heures. Les entrées expirées restent dans la file
pour inspection manuelle : ne pas remettre leur date à zéro sans vérifier chez
Resend si l'email a déjà été accepté. `sent_at` signifie accepté par Resend, pas
réception garantie dans la boîte Gmail. Les erreurs sont dans les logs de l'Edge
Function ; les erreurs de transport sont dans `net._http_response`.

## Vérification

```powershell
./.tools/deno.exe test mcp/tests/first_prayer_email_test.ts
./.tools/deno.exe check supabase/functions/first-prayer-email/index.ts
```

`supabase/tests/first_prayer_email.sql` teste l'enregistrement, les soumissions
anonymes avec le rôle `anon`, l'unicité des comptes et les droits avec rollback. Ses secrets Vault sont retirés
uniquement dans la transaction de test pour empêcher tout email réel.

Après activation en dev, envoyer une première puis une deuxième prière depuis un
compte de test : une seule notification doit être acceptée, et une seule entrée
doit avoir `sent_at`. Tester également le refus d'un webhook sans secret.

Références : [Webhooks Supabase](https://supabase.com/docs/guides/database/webhooks),
[Envoi Resend](https://resend.com/docs/api-reference/emails/send-email),
[Idempotence Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Déploiement vérifié

Production `ndtnfwyfdfdcxljvvjfd`, le 29 octobre 2026 (Japon) : migration appliquée,
fonction `first-prayer-email` v1 active, URL Vault configurée et cron actif.
Vérification réelle : deux prières sur un compte technique ont produit une seule
entrée et un seul envoi accepté par Resend (`sent_at`, HTTP 200). Le compte et les
deux prières de test ont ensuite été supprimés, avec contrôle du nettoyage.
Les appels sans secret renvoient HTTP 401. Les quatre tests du handler, le contrôle
TypeScript et le test SQL en dev avec rollback sont passés.
Correction le même jour : production v2 et migration `anonymous_prayer_email`
actives. Un envoi avec le rôle `anon`, sans compte, a été accepté par Resend ;
la prière et son entrée de file techniques ont été supprimées après vérification.
Les cinq tests du handler et le test SQL incluant le rôle `anon` sont passés.

Le dev `mylnagvqngsgcmlvwttu` possède maintenant les deux migrations, la fonction
v1 (même code que la v2 de production), son URL Vault et son secret interne.
Ses trois secrets Resend doivent être configurés séparément, une seule fois,
dans Edge Functions → Secrets. Aucun secret de production n'a été copié.
Le test SQL complet y est passé avec rollback après déploiement.

L'audit ne signale aucune nouvelle alerte de sécurité bloquante. L'information
« RLS Enabled No Policy » sur la file est intentionnelle : aucun accès client,
seul `service_role` lit et met à jour les reçus. Les alertes sur les deux fonctions
Auth historiques et la protection contre les mots de passe compromis préexistaient.
