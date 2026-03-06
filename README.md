# Pointage RH — Système de gestion des présences

Système de pointage horaire avec chatbot WhatsApp et portail Web RH/DG.

## Stack technique

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **Supabase** (PostgreSQL + Auth)
- **Prisma** (ORM)
- **WhatsApp Business API** (Meta Cloud API)

## Démarrage rapide

### 1. Prérequis

- Node.js 20+
- Un projet Supabase (https://supabase.com)
- Un compte WhatsApp Business Platform (https://developers.facebook.com)

### 2. Installation

```bash
npm install
```

### 3. Configuration

Copier `.env.example` vers `.env.local` et remplir les valeurs :

```bash
cp .env.example .env.local
```

Variables requises :
- `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` : depuis Supabase Dashboard > Settings > API
- `SUPABASE_SERVICE_ROLE_KEY` : même endroit (clé secrète)
- `DATABASE_URL` : Supabase Dashboard > Settings > Database > Connection string (Transaction mode / port 6543)
- `DIRECT_URL` : Supabase Dashboard > Settings > Database > Connection string (Session mode / port 5432)
- `WHATSAPP_*` : depuis Meta Developer Dashboard

### 4. Base de données

```bash
# Appliquer le schéma à la base
npm run db:push

# Ou créer une migration
npm run db:migrate

# Peupler la base avec des données de test
npm run db:seed
```

Le seed crée :
- Admin : `admin@pointage.com` / `admin123456`
- RH : `rh@pointage.com` / `rh123456`
- Un site avec horaires par défaut (8h30-18h00)
- 3 employés de test

### 5. Lancer le serveur

```bash
npm run dev
```

Ouvrir http://localhost:3000

## Architecture

```
src/
├── app/
│   ├── (auth)/login/          # Page de connexion
│   ├── (dashboard)/           # Portail Web RH/DG
│   │   ├── page.tsx           # Dashboard
│   │   ├── employees/         # Gestion des employés
│   │   ├── attendance/        # Pointages
│   │   ├── leaves/            # Permissions
│   │   ├── missions/          # Missions
│   │   ├── settings/          # Paramètres
│   │   └── reports/           # Rapports + exports
│   ├── onboarding/            # Onboarding QR (public)
│   ├── geoloc/                # Mini check-in géoloc (public)
│   └── api/
│       ├── webhooks/whatsapp/ # Webhook WhatsApp
│       ├── cron/              # Jobs planifiés
│       ├── employees/         # API Employés
│       ├── attendance/        # API Pointages
│       ├── leaves/            # API Permissions
│       ├── missions/          # API Missions
│       ├── settings/          # API Paramètres
│       ├── reports/           # API Rapports
│       ├── dashboard/         # API Dashboard
│       ├── geoloc/            # API Géolocalisation
│       └── onboarding/        # API Onboarding
├── lib/
│   ├── supabase/              # Clients Supabase (browser/server/middleware)
│   ├── prisma.ts              # Client Prisma
│   ├── auth.ts                # Helpers authentification + RBAC
│   ├── attendance-engine.ts   # Logique métier pointage
│   ├── whatsapp.ts            # Client API WhatsApp
│   ├── geofence.ts            # Calcul Haversine + zones
│   ├── intent-parser.ts       # Parsing des commandes WhatsApp
│   ├── audit.ts               # Audit logs
│   └── utils.ts               # Utilitaires
└── components/
    ├── layout/                # Sidebar, Header
    └── dashboard/             # StatCard, Charts
```

## Webhook WhatsApp

URL à configurer dans Meta Developer Dashboard :
```
https://votre-domaine.com/api/webhooks/whatsapp
```

Token de vérification : la valeur de `WHATSAPP_VERIFY_TOKEN`

### Commandes reconnues

| Commande | Action |
|---|---|
| ARRIVÉ / ARRIVEE / CHECKIN | Pointer l'arrivée |
| DÉPART / DEPART / CHECKOUT | Pointer le départ |
| STATUT | Voir le pointage du jour |
| AIDE / MENU | Afficher les commandes |

L'employé doit aussi envoyer sa localisation pour valider le pointage.

## Cron Jobs

Configurés dans `vercel.json` pour Vercel, ou via crontab :

| Job | Heure | Description |
|---|---|---|
| auto-checkout | 22h00 (lun-ven) | Enregistre 18h00 comme heure de départ pour ceux qui ont oublié |
| mark-absent | 22h05 (lun-ven) | Marque absent les employés sans pointage ni permission/mission |

Appel manuel :
```bash
curl -X POST http://localhost:3000/api/cron/auto-checkout \
  -H "Authorization: Bearer VOTRE_CRON_SECRET"
```

## Rôles

| Rôle | Accès |
|---|---|
| ADMIN | Tout |
| HR | Gestion employés, pointages, validations, rapports |
| DG | Lecture dashboard, pointages, rapports |

## Exports

- **Excel** : via exceljs
- **PDF** : via jspdf + jspdf-autotable

Disponibles depuis la page Rapports du portail.
