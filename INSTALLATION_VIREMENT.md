# Mise à jour : réservation par virement bancaire

Le script SQL `supabase/MISE_A_JOUR_VIREMENT.sql` et la fonction Edge `create-transfer` ont déjà été exécutés/déployés dans Supabase pendant notre configuration. Ne réexécutez pas le schéma initial `supabase/schema.sql` : il contient des créations de tables initiales.

## Mise en ligne du site

Dans GitHub, remplacez `index.html`, `assets/app.js`, `assets/style.css` par ceux de ce ZIP, en conservant leurs chemins. GitHub Pages publiera ensuite les modifications.

## Fonctionnement

- « Payer en ligne » conserve le flux Mollie existant.
- « Je paie par virement bancaire » appelle l’Edge Function `create-transfer` déjà déployée et enregistre la réservation en `transfer_pending`.
- Le site affiche le montant exact, l’IBAN BE64 0688 9493 4252 et la référence de réservation comme communication (communication libre, non structurée).
- Dans l’administration, le bouton « Confirmer le virement reçu » appelle la fonction SQL `confirm_transfer_payment`, qui vérifie le rôle administrateur.
- Vérifier la réception réelle du virement sur le compte bancaire avant confirmation.

IMPORTANT : la date du 20 novembre est indiquée à l’écran, mais l’expiration automatique des virements non payés n’est PAS encore implémentée. Les paiements en attente devront être contrôlés manuellement après cette date.

Tester d’abord une réservation de faible montant sans effectuer de vrai virement, puis contrôler que le statut initial est « Virement attendu ». Ne pas la marquer payée avant un paiement réel.
