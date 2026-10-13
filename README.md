# JS Dottignies — Repas de Saint-Nicolas

Application mobile-first de réservation avec menus adultes/enfants configurables, paiement Mollie (Bancontact disponible selon l'activation du compte), administration Supabase et export CSV.

## 1. Prérequis
- Compte GitHub, projet Supabase, compte Mollie professionnel/association validé.
- Node.js et Supabase CLI pour le déploiement des fonctions.
- Un domaine HTTPS public pour l'application (GitHub Pages fonctionne).

## 2. Supabase
1. Créer un projet Supabase (région européenne de préférence).
2. Dans **SQL Editor**, exécuter `supabase/schema.sql` en entier.
3. Dans **Authentication > Users**, créer le compte administrateur avec un mot de passe fort. Désactiver l'inscription publique si elle n'est pas nécessaire.
4. Copier son UUID et exécuter dans SQL Editor : `insert into public.admin_users(user_id) values ('UUID-ADMIN');`.
5. Dans **Project Settings > API**, relever l'URL et la clé **publishable/anon** (jamais `service_role`).
6. Modifier `assets/config.js` et y renseigner ces deux valeurs PUBLIQUES. Le fichier est inclus dans le dépôt pour simplifier GitHub Pages. Ne jamais y ajouter de secret.

## 3. Mollie et fonctions Supabase
1. Activer Bancontact dans le compte Mollie, puis obtenir une clé API **test** pour les essais et **live** pour la production.
2. Installer Supabase CLI, se connecter et lier le projet :
   ```bash
   npx supabase login
   npx supabase link --project-ref VOTRE_PROJECT_REF
   ```
3. Définir les secrets (URL publique **exacte** du site, sans barre finale, ex. `https://utilisateur.github.io/depot` si déployé sous un sous-chemin : attention, voir note ci-dessous) :
   ```bash
   npx supabase secrets set MOLLIE_API_KEY='test_xxx' WEBHOOK_SECRET='UNE_LONGUE_CHAINE_ALEATOIRE' SITE_ORIGIN='https://jsdottignies.github.io' SITE_URL='https://jsdottignies.github.io/saint-nicolas-jsd'
   ```
   `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement dans l'environnement des Edge Functions hébergées Supabase.
4. Déployer :
   ```bash
   npx supabase functions deploy create-checkout --no-verify-jwt
   npx supabase functions deploy mollie-webhook --no-verify-jwt
   ```
5. Le webhook est configuré automatiquement lors de la création du paiement. Il faut que le projet Supabase soit accessible publiquement en HTTPS.

**GitHub Pages :** `SITE_ORIGIN` est le domaine (`https://jsdottignies.github.io`) tandis que `SITE_URL` est l'URL complète du dépôt (`https://jsdottignies.github.io/saint-nicolas-jsd`). Le code prend en charge cette différence. Vérifiez l'orthographe exacte du dépôt.

## 4. Déployer l'interface sur GitHub Pages
1. Créer un dépôt GitHub et y pousser tous les fichiers, sauf `assets/config.js` (ignoré par `.gitignore`).
2. Pour une mise en ligne simple, modifier `assets/config.js` déjà présent **avec uniquement les deux valeurs publiques** (URL Supabase et clé publishable/anon). Les droits sont assurés par les politiques RLS, pas par le secret de cette clé. **Ne jamais y mettre une clé secrète.**
3. Dans GitHub > Settings > Pages, sélectionner `Deploy from a branch`, branche `main`, dossier `/ (root)`.
4. Activer HTTPS, de préférence avec un domaine personnalisé. Ajuster `SITE_ORIGIN` pour qu'il corresponde à l'origine du site (schéma + hôte, sans chemin).
5. Dans l'administration, créer les menus, saisir les prix, préciser les informations du repas, puis ouvrir les réservations.

## 5. Tests indispensables
- Paiement test réussi : réservation passe de `pending` à `paid` après webhook.
- Paiement abandonné/refusé : ne devient jamais `paid`.
- Modification d'un prix dans le navigateur : le serveur utilise le prix de la base.
- Un visiteur non authentifié ne peut ni lire les réservations ni modifier les menus.
- Un utilisateur authentifié mais non administrateur ne peut pas accéder aux réservations.
- Export CSV, vérification des quantités, affichage mobile, fermeture des réservations.

## 6. Limites de cette V1
- La confirmation est affichée dans l'administration. **Pas encore d'e-mail automatique ni de QR code**.
- Le retour depuis Mollie affiche un message de vérification, pas un reçu nominatif : le webhook reste la source de vérité.
- Les paiements en attente peuvent rester `pending` en cas d'abandon ; ajouter ultérieurement une tâche de réconciliation via l'API Mollie.
- Les fonctions publiques nécessitent une protection anti-abus supplémentaire avant diffusion large (CAPTCHA et limitation de débit au niveau d'un proxy/edge).
- Le club doit fournir une notice de confidentialité, une durée de conservation, et un contact RGPD, notamment pour les allergies (données potentiellement sensibles).
- Les réservations déjà payées conservent un instantané des menus/prix ; modifier un tarif n'altère pas les commandes existantes.
- Les remboursements, modifications de commandes payées, pointage à l'entrée et justificatifs e-mail sont à ajouter dans une V2.

## Démarrage spécifique au compte GitHub JSDOTTIGNIES
1. Ouvrir https://github.com/new en étant connecté à **JSDOTTIGNIES**.
2. Nom du dépôt : **saint-nicolas-jsd** ; visibilité **Public** ; ne pas initialiser avec README.
3. Importer **le contenu du dossier `jsd-saint-nicolas`** à la racine du dépôt (pas le dossier lui-même). Dans GitHub : **Add file > Upload files** ; glisser les fichiers et dossiers, puis **Commit changes**.
4. Aller dans **Settings > Pages > Build and deployment** ; choisir **Deploy from a branch**, branche **main**, dossier **/(root)**, puis **Save**.
5. URL attendue après publication : https://jsdottignies.github.io/saint-nicolas-jsd/ (à vérifier une fois Pages activé).
6. Créer un **nouveau projet Supabase** distinct de celui des affiliés, puis suivre les sections 2 et 3.
7. Ne pas annoncer les réservations tant que les tests Mollie ne sont pas validés.

**Attention :** un simple envoi sur GitHub ne rend pas le paiement fonctionnel. Les Edge Functions, secrets, RLS et le compte Mollie sont obligatoires.
