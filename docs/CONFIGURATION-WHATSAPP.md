# Configuration du chatbot WhatsApp (pointage)

L’app utilise l’**API WhatsApp Business (Meta Cloud API)**. Voici comment la configurer.

---

## 1. Créer une app Meta et activer WhatsApp

1. Va sur [developers.facebook.com](https://developers.facebook.com) et connecte-toi.
2. **Créer une application** : « Créer une app » → type **« Business »**.
3. Dans le tableau de bord de l’app, va dans **Produits** → ajoute le produit **« WhatsApp »**.
4. Dans **WhatsApp** → **Démarrage** : tu verras :
   - **Numéro de téléphone d’essai** (pour les tests)
   - Ou la configuration d’un **numéro Business** (après validation du Business Manager).

---

## 2. Récupérer les identifiants

### Token d’accès (WHATSAPP_ACCESS_TOKEN)

- **WhatsApp** → **Démarrage** (ou **Configuration de l’API**).
- Section **« Token d’accès temporaire »** : clique sur **Générer**.
- Pour la production : crée un **token permanent** via **Paramètres du système** → **Jetons d’accès** (avec le rôle **WhatsApp Business Management**).

### ID du numéro de téléphone (WHATSAPP_PHONE_NUMBER_ID)

- Dans **WhatsApp** → **Démarrage** ou **Numéros de téléphone**.
- Clique sur ton numéro de test (ou ton numéro Business).
- L’**ID du numéro de téléphone** est affiché (ex. `123456789012345`).

### Secret de l’application (WHATSAPP_APP_SECRET)

- **Paramètres** → **Paramètres de base**.
- Section **« Secret de l’application »** → **Afficher** (mot de passe Facebook demandé).
- Copie le secret (sert à vérifier la signature du webhook).

---

## 3. Configurer le webhook (URL appelée par Meta)

Meta doit appeler ton serveur à chaque message reçu. Il te faut une **URL publique** (pas localhost en prod).

### En local (tests)

- Utilise [ngrok](https://ngrok.com) : `ngrok http 3000`.
- Tu obtiens une URL du type `https://abc123.ngrok.io`.

### URL du webhook

```
https://TON_DOMAINE/api/webhooks/whatsapp
```

Exemples :
- En local avec ngrok : `https://abc123.ngrok.io/api/webhooks/whatsapp`
- En prod : `https://ton-app.vercel.app/api/webhooks/whatsapp`

### Dans Meta

1. **WhatsApp** → **Configuration** → **Webhook**.
2. **URL de rappel** : `https://TON_DOMAINE/api/webhooks/whatsapp`
3. **Jeton de vérification** : choisis une chaîne secrète (ex. `mon-token-pointage-2024`) et **mets exactement la même valeur** dans `.env` pour `WHATSAPP_VERIFY_TOKEN`.
4. Clique sur **Vérifier et enregistrer**.  
   Meta envoie un `GET` avec `hub.mode=subscribe` et `hub.verify_token=...`. Ton app répond avec `hub.challenge` si le token correspond → la vérification réussit.

### S’abonner aux événements

Dans la même page Webhook, **s’abonner** aux champs :
- **messages** (pour recevoir les textes et localisations).

---

## 4. Variables d’environnement (.env / .env.local)

Ajoute ou complète dans `.env.local` (et en prod sur Vercel / ton hébergeur) :

```env
# WhatsApp Business API (Meta)
WHATSAPP_VERIFY_TOKEN=mon-token-pointage-2024
WHATSAPP_ACCESS_TOKEN=EAAxxxx...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_APP_SECRET=abcdef123456...

# URL publique de ton app (pour le lien géoloc dans les messages)
APP_BASE_URL=https://ton-app.vercel.app
```

| Variable | Où la trouver |
|----------|----------------|
| `WHATSAPP_VERIFY_TOKEN` | Tu la choisis ; elle doit être identique à celle saisie dans Meta (Webhook). |
| `WHATSAPP_ACCESS_TOKEN` | Meta → WhatsApp → Token d’accès (temporaire ou permanent). |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta → WhatsApp → Numéro de téléphone → ID du numéro. |
| `WHATSAPP_APP_SECRET` | Meta → Paramètres de l’app → Secret de l’application. |
| `APP_BASE_URL` | URL de ton site (ex. `https://ton-app.vercel.app`). |
| `WHATSAPP_BUSINESS_PHONE` | Numéro au format international **sans +** (ex. `237690000000`) pour le lien **wa.me** et le **QR code**. |

---

## QR code : redirection vers le chatbot

Une page dédiée génère un **QR code** qui ouvre directement le chat WhatsApp avec ton numéro Business :

- **URL de la page** : `https://TON_DOMAINE/qr-chatbot`
- **API image** : `GET /api/qr-chatbot` (retourne une image PNG).
- **Téléchargement** : `GET /api/qr-chatbot?download=1` pour forcer le téléchargement du PNG.

Configure **`WHATSAPP_BUSINESS_PHONE`** (même numéro que celui utilisé pour l’API, au format international sans +). Tu peux afficher la page sur un écran, l’imprimer ou partager le lien pour que les employés scannent et ouvrent le chat en un clic.

---

## 5. Boutons du chatbot

L’app envoie des **boutons interactifs** (sans modèle à faire approuver) :

- Quand l’employé envoie **Aide** / **Menu** ou un message non reconnu, il reçoit un message avec 3 boutons : **Arrivé**, **Départ**, **Mon statut**.
- Un clic sur un bouton déclenche la même action que la commande texte (demande de localisation pour Arrivé/Départ, affichage du statut pour Mon statut).

Pour modifier les libellés ou les identifiants des boutons, édite dans le code :
- **Envoi des boutons** : `src/lib/whatsapp.ts` → fonction `sendWhatsAppButtons()` (titles limités à 20 caractères, max 3 boutons).
- **Réaction au clic** : `src/app/api/webhooks/whatsapp/route.ts` → bloc `message.type === "interactive"` (ids `BTN_ARRIVE`, `BTN_DEPART`, `BTN_STATUT`).

Aucune configuration côté Meta n’est nécessaire pour ces boutons (hors 24 h de session).

---

## 6. Tester

1. Redémarre le serveur Next.js après modification des variables.
2. Envoie un message **au numéro WhatsApp associé à ton app** (numéro de test ou Business).
3. Commandes reconnues :
   - **Arrivé** / **ARRIVÉ** → demande de localisation puis enregistrement de l’arrivée.
   - **Départ** / **DÉPART** → idem pour le départ.
   - **Statut** → récap du pointage du jour.
   - **Aide** → liste des commandes + affichage des boutons.

Vérifie que :
- le numéro de l’employé est enregistré en base (champ `whatsappPhone`) ;
- l’employé est actif et lié à un site avec horaires (Paramètres).

---

## 7. Dépannage : « Rien ne se passe » quand j’envoie un message

Si le chatbot ne répond pas du tout :

1. **Le webhook doit être accessible par Internet**  
   En local, Meta ne peut pas appeler `http://localhost:3000`. Il faut exposer ton serveur avec **ngrok** :
   ```bash
   ngrok http 3000
   ```
   Puis dans Meta (WhatsApp → Configuration → Webhook), mets **URL de rappel** :  
   `https://TON_URL_NGROK/api/webhooks/whatsapp`  
   (ex. `https://abc123.ngrok.io/api/webhooks/whatsapp`).

2. **Vérifier que Meta envoie bien les événements**  
   Avec `pnpm dev` et ngrok actif, envoie un message au numéro du bot. Dans le terminal où tourne Next.js tu dois voir une ligne du type :  
   `[WhatsApp] Message reçu de 15551436294 type: text`  
   Si tu ne vois rien, Meta n’appelle pas ton URL (mauvaise URL, abonnement « messages » non coché, ou jeton de vérification incorrect).

3. **Vérifier le numéro de l’employé**  
   Si tu vois le log mais pas de réponse, regarde si apparaît :  
   `[WhatsApp] Numéro non lié: 15551436294`  
   Alors ce numéro n’est pas reconnu. Dans **Employés**, édite la fiche et enregistre le numéro WhatsApp au **format international** (ex. `+15551436294` ou `15551436294`). Le bot accepte les deux formats pour la reconnaissance.

4. **Numéro de test : destinataires autorisés**  
   Avec un **numéro de test** Meta, tu ne peux envoyer des messages **qu’aux numéros ajoutés** dans l’app. Va dans **WhatsApp** → **Démarrage** (ou **Configuration de l’API**) → section **« Ajouter un numéro de téléphone »** / **« To »** et ajoute le numéro qui reçoit les messages (ex. `+237695607089`). Sinon l’API renvoie une erreur et le bot ne répond pas. En prod avec un vrai numéro Business, cette limite disparaît.

5. **En production**  
   Déploie l’app (ex. Vercel) et configure le webhook avec l’URL de prod (ex. `https://ton-app.vercel.app/api/webhooks/whatsapp`). Plus besoin de ngrok.

---

## 8. Passage en production (numéro Business)

- Valide ton **Meta Business Manager** et ton **numéro Business**.
- Remplace le numéro de test par ce numéro dans la configuration WhatsApp.
- Utilise un **token d’accès permanent** (jeton système) et garde `APP_BASE_URL` vers ton domaine de prod.

---

## Résumé

1. Créer une app Meta (Business) et ajouter WhatsApp.
2. Récupérer : token, ID du numéro, secret de l’app.
3. Configurer le webhook avec l’URL `.../api/webhooks/whatsapp` et le même `WHATSAPP_VERIFY_TOKEN` que dans `.env`.
4. S’abonner à « messages ».
5. Renseigner toutes les variables dans `.env.local` / prod.
6. Tester en envoyant « Arrivé » ou « Aide » au numéro configuré.
