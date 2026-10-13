# Correctifs de sécurité – Saint-Nicolas

## Contenu
- `mollie-webhook` : exige la correspondance stricte entre l’identifiant de paiement reçu de Mollie et celui déjà enregistré sur la réservation. Si le lien n’est pas encore enregistré, renvoie HTTP 503 pour demander une nouvelle notification. Empêche qu’un statut non payé écrase un statut payé.
- `create-checkout` : vérifie que l’identifiant Mollie a bien été enregistré avant de transmettre l’URL de paiement.
- `assets/app.js` / `style.css` : statuts en français et en couleur ; protection de base contre l’interprétation de formules dans les exports CSV.

## Installation (dans cet ordre)
1. **Rester en mode test Mollie** et garder les réservations publiques fermées pendant l’installation.
2. Dans Supabase Edge Functions, ouvrir `mollie-webhook` > Code, remplacer `index.ts` par `supabase/functions/mollie-webhook/index.ts`, puis déployer.
3. Dans Supabase Edge Functions, ouvrir `create-checkout` > Code, remplacer `index.ts` par `supabase/functions/create-checkout/index.ts`, puis déployer.
4. Conserver la désactivation de la vérification JWT pour ces fonctions publiques et les secrets `MOLLIE_API_KEY`, `WEBHOOK_SECRET`, `SITE_ORIGIN`, `SITE_URL`. Ne jamais exposer les secrets dans GitHub.
5. Remplacer sur GitHub `assets/app.js` et `assets/style.css` par ceux de cette archive ; attendre le déploiement GitHub Pages.
6. Faire un paiement de test, vérifier la réservation payée dans l’administration, puis tester une annulation. Vérifier les logs Supabase et les paiements Mollie.

## Points à terminer avant l’ouverture au public
- **Protection anti-abus** : ajouter un contrôle serveur de débit / CAPTCHA validé côté serveur. La vérification de l’en-tête Origin ne protège pas contre les scripts automatisés.
- **Idempotence des créations** : un second clic, une nouvelle tentative ou une coupure réseau peuvent encore créer deux réservations et deux paiements. Ajouter une clé d’idempotence persistante côté serveur et une procédure de rapprochement des paiements orphelins.
- **Réconciliation** : prévoir une vérification périodique des réservations en attente auprès de Mollie, car les notifications ne sont pas une garantie absolue de synchronisation.
- **Confirmation client** : vérifier l’état côté serveur au retour de Mollie, et afficher la référence ; ne jamais déclarer un paiement réussi sur la seule base du retour navigateur.
- **Exploitation** : tester remboursements, support, confidentialité/RGPD et procédures de traitement des réservations.

Cette archive est une correction ciblée, **pas une certification de sécurité ni une autorisation de passer en production**.
