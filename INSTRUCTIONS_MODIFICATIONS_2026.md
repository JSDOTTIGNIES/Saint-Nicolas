# Mise à jour — Annulation des réservations et date limite

## 1. Base Supabase (obligatoire)

Dans le projet Supabase déjà utilisé par l'application : **SQL Editor > New query**. Copier le contenu de `supabase/MISE_A_JOUR_ANNULATIONS.sql`, puis cliquer **Run**. Ne pas réexécuter `schema.sql` : il s'agit d'une base existante.

Ce script ne supprime aucune réservation. Il ajoute un statut `admin_cancelled`, les dates d'annulation/remboursement, et deux actions accessibles uniquement à un administrateur authentifié.

## 2. GitHub

Remplacer les fichiers du dépôt par ceux du ZIP, sans changer `assets/config.js` ni les identifiants existants. Vérifier le déploiement GitHub Pages, puis rafraîchir la page (Ctrl + F5).

## 3. Fonction Mollie (obligatoire)

La fonction `supabase/functions/mollie-webhook/index.ts` a été modifiée pour qu'un webhook Mollie ne réactive jamais une réservation annulée manuellement. **Redéployer cette fonction** dans Supabase. Sans cette étape, une notification de paiement tardive pourrait réactiver une réservation annulée. Ne pas toucher aux secrets existants.

Commande si vous utilisez la CLI :

```sh
npx supabase functions deploy mollie-webhook --no-verify-jwt
```

## 4. Fonctionnement

- **Annuler** : annule la réservation dans la base et la retire des compteurs de repas payés. Aucune opération n'est envoyée à Mollie.
- **Marquer remboursé** : à cliquer uniquement après avoir effectivement remboursé le client vous-même. Cette action enregistre une date, mais ne transfère aucun argent.
- Une réservation annulée reste visible dans l'administration et l'export CSV.
- Une réservation annulée alors qu'un paiement Mollie est encore en cours peut être payée ultérieurement. Vérifier le tableau de bord Mollie et les réservations annulées avant de clôturer le suivi.
- La date de fin de réservation est affichée dynamiquement sur la page publique et dans le pied de page. Le serveur applique déjà cette même date pour refuser de nouvelles commandes.
- **Attention** : la date limite de réception des *virements* (20 novembre) est une règle distincte, laissée inchangée. Elle reste affichée comme telle.

## 5. Tests recommandés

1. Modifier la date limite depuis l'administration, enregistrer et revenir sur la page de commande. Vérifier la date et l'heure affichées.
2. Sur une réservation de test payée, cliquer Annuler. Vérifier le statut et les compteurs.
3. Effectuer le remboursement manuellement si nécessaire, puis cliquer Marquer remboursé.
4. Vérifier un paiement Bancontact réel et un virement. **Aucun paiement réel n'a été effectué lors de la préparation de ce ZIP.**
