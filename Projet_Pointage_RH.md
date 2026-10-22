# Projet Pointage RH — Documentation technique

> Document de référence pour développeurs et agents IA. Dernière mise à jour du contenu : **2026-10-21**.

---

## 1. Contexte et objectifs

| Élément | Description |
|---------|-------------|
| **Nom produit** | Pointage RH — système de gestion des présences |
| **Objectif** | Permettre le pointage des employés (WhatsApp + géolocalisation), la gestion RH sur un dashboard web (Next.js), et le suivi des permissions, missions et heures supplémentaires. |
| **Utilisateurs cibles** | Employés (WhatsApp + page `/geoloc`), RH / Admin / DG (dashboard authentifié Supabase). |
| **Structures métier** | `SCPB`, `AFREXIA` (enum Prisma `Structure`). |
| **Stack** | Next.js (App Router), Prisma, PostgreSQL (Supabase), Supabase Auth, API WhatsApp Cloud (Meta), déploiement type Vercel. |

---

## 2. Modules de l’application

| Module | Route UI / API | Rôle |
|--------|----------------|------|
| **Dashboard** | `/`, `GET /api/dashboard` | KPIs, résumés, liens vers autres modules. |
| **Employés** | `/employees`, `/employees/[id]`, `GET/POST /api/employees`, `GET/PUT/DELETE /api/employees/[id]` | CRUD employés, matricule, site, WhatsApp, fiche + remarques RH. |
| **Pointages** | `/attendance`, `GET /api/attendance`, `GET /api/attendance/day`, `GET /api/attendance/history` | Consultation / filtres des enregistrements de présence. |
| **Permissions** | `/leaves`, `GET/POST /api/leaves`, `GET/PUT/DELETE /api/leaves/[id]` | Demandes d’absence courte (`LeaveRequest`) — **pas un module « congés longs » séparé** ; l’UI parle de « Permissions ». |
| **Missions** | `/missions`, `GET/POST /api/missions`, `GET/PUT/DELETE /api/missions/[id]` | Ordres de mission, structures origine/accueil, jours effectués. |
| **Heures supplémentaires** | `/overtime`, `GET /api/overtime`, `PUT /api/overtime/[id]` | Validation / refus par la RH, motif, plafonds métiers côté pointage. |
| **Rapports** | `/reports`, `GET /api/reports` | Rapport agrégé présences / stats (nécessite `dateFrom` + `dateTo`). |
| **Paramètres** | `/settings`, `GET/PATCH /api/settings` | Configuration applicative. |
| **Politique de confidentialité** | `/privacy` | Page publique (hors login). |

**Pages publiques annexes** : `/login`, `/onboarding`, `/geoloc` (soumission position après lien WhatsApp), `/qr-chatbot`.

---

## 3. Workflow complet

### 3.1 Vue d’ensemble (texte)

```
Employé ──► WhatsApp (message / boutons) ──► Meta Webhook ──► POST /api/webhooks/whatsapp
                                                              │
                                                              ├─► parseIntent (menu 1–11, mots-clés)
                                                              ├─► pendingActions (CHECK_IN / CHECK_OUT) + lien géoloc
                                                              │
Employé ──► Clic lien ──► /geoloc?phone=...&action=... ──► navigateur récupère GPS ──► POST /api/geoloc
                                                              │
                                                              ├─► processCheckIn / processCheckOut (attendance-engine)
                                                              ├─► Prisma ──► PostgreSQL (Supabase)
                                                              └─► sendWhatsAppMessage (récap + demande motif si besoin)

RH ──► Navigateur ──► Supabase Auth ──► Dashboard Next.js ──► fetch /api/* ──► Prisma ──► PostgreSQL
```

### 3.2 Bot WhatsApp — séquence type

1. L’employé envoie un message texte (`1`–`11`, « arrivé », « départ », etc.) ou clique **Arrivée** / **Départ** / **Statut**.
2. Pour pointage : le serveur enregistre une intention dans `pendingActions` (clé = téléphone normalisé) et envoie un **lien** vers `/geoloc` avec `phone` + `action` (`CHECK_IN` | `CHECK_OUT`).
3. Les **positions envoyées comme message « location » WhatsApp** sont **refusées** (anti-fraude) : l’employé doit utiliser le lien et « Récupérer ma position maintenant ».
4. `POST /api/geoloc` valide le corps (`phone`, `lat`, `lng`, `action`, `comment?`), retrouve l’employé, appelle `processCheckIn` ou `processCheckOut`, renvoie une réponse JSON et **envoie le message WhatsApp** de retour.
5. Si heures sup > 0 sans `comment` au checkout : message demandant un **motif en texte libre** ; le prochain message texte peut être enregistré comme `overtimeReason` (voir logique §6 et §11).

### 3.3 Crons (API)

| Route | Usage typique |
|-------|----------------|
| `POST /api/cron/auto-checkout` | Départs automatiques à l’heure de fin de planning. |
| `POST /api/cron/checkout-reminder` | Rappels départ. |
| `POST /api/cron/mark-absent` | Marquage absences. |
| `POST /api/cron/overtime-reminder` | Rappel RH sur heures sup en attente. |
| `POST /api/cron/weekly-summary` | Résumé hebdo (WhatsApp / logique métier associée). |

*(Sécuriser ces routes par secret header / Vercel Cron selon configuration projet.)*

---

## 4. Architecture technique et diagrammes

### 4.1 Couches

| Couche | Technologie |
|--------|-------------|
| Front dashboard | React (Next.js App Router), composants client (`"use client"`) |
| Auth | Supabase SSR (`@supabase/ssr`), middleware `updateSession` |
| API | Route Handlers Next.js (`src/app/api/**/route.ts`) |
| Persistance | Prisma Client → PostgreSQL |
| Temps / fuseau | Variables type `APP_TIMEZONE` dans `attendance-engine` (à vérifier dans le fichier) |

### 4.2 Schéma logique (ASCII)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Supabase   │     │   Next.js    │     │   PostgreSQL    │
│    Auth     │────►│  Middleware  │────►│  (Prisma)       │
└─────────────┘     │  + API       │     │  users,         │
                    │  Routes      │     │  employees,     │
┌─────────────┐     └──────┬───────┘     │  attendance_*   │
│ Meta / WA   │────────────┘             │  leave_*, etc.  │
└─────────────┘                          └─────────────────┘
```

### 4.3 Fichiers critiques (référence rapide)

| Fichier | Rôle |
|---------|------|
| `src/lib/attendance-engine.ts` | Géofence, check-in/out, calcul heures sup, auto-checkout. |
| `src/app/api/webhooks/whatsapp/route.ts` | Webhook Meta, intents, saisie motif retard / départ anticipé / heures sup. |
| `src/lib/intent-parser.ts` | Parsing commandes WhatsApp + option `skipNumericMenuShortcuts`. |
| `src/lib/whatsapp.ts` | Envoi messages, boutons, demande de localisation (lien). |
| `src/app/api/geoloc/route.ts` | Pointage effectif après capture GPS navigateur. |
| `src/lib/auth.ts` | `getSession`, `requireRole`. |
| `src/lib/supabase/middleware.ts` | Routes publiques vs protégées. |

---

## 5. Schéma de base de données

### 5.1 Modèle ER (résumé textuel)

- **User** (compte dashboard) 1—N **AuditLog**, 1—N **HrRemark** (en tant qu’auteur).
- **Employee** N—1 **Site** ; 1—N **AttendanceRecord**, **LeaveRequest**, **Mission**, **FraudAttempt**, **HrRemark**.
- **Site** 1—N **Schedule** (horaires site).
- **AttendanceRecord** : une ligne par `(employeeId, date)` unique.

### 5.2 Tables et champs principaux

| Table Prisma | Map SQL | Champs / notes clés |
|--------------|---------|---------------------|
| User | `users` | `supabase_auth_id`, `email`, `name`, `role` (ADMIN, HR, DG), `active` |
| Employee | `employees` | `matricule` unique, `structure`, `whatsapp_phone` unique nullable, `site_id` |
| Site | `sites` | `center_lat`, `center_lng`, `radius_m` |
| Schedule | `schedules` | `start_time`, `end_time`, `closure_time`, `late_grace_min` |
| AttendanceRecord | `attendance_records` | Pointages, `final_status`, heures sup, `overtime_status`, `overtime_reason` |
| LeaveRequest | `leave_requests` | Permissions ; `cancelled_at`, `cancelled_by` (soft cancel) |
| Mission | `missions` | `origin_structure`, `host_structure`, `days_completed`, annulation logique |
| FraudAttempt | `fraud_attempts` | Tentatives hors zone |
| Holiday | `holidays` | Jours fériés |
| HrRemark | `hr_remarks` | Remarques RH sur employé |
| AuditLog | `audit_logs` | Traçabilité actions (`before_json`, `after_json`) |

### 5.3 Enums principaux

```text
Role: ADMIN | HR | DG
FinalStatus: PRESENT | ABSENT | PERMISSION | MISSION
RequestStatus: PENDING | APPROVED | REJECTED
OvertimeStatus: PENDING | APPROVED | REJECTED
Structure: SCPB | AFREXIA
```

### 5.4 Extrait schéma Prisma (référence)

```prisma
model Employee {
  id        String   @id @default(cuid())
  matricule String   @unique
  structure Structure @default(SCPB)
  siteId    String?  @map("site_id")
  site      Site?    @relation(fields: [siteId], references: [id])
  // ...
  @@map("employees")
}

model AttendanceRecord {
  id              String   @id @default(cuid())
  employeeId      String   @map("employee_id")
  date            DateTime @db.Date
  checkInTime     DateTime? @map("check_in_time")
  checkOutTime    DateTime? @map("check_out_time")
  overtimeMinutes Int?     @default(0) @map("overtime_minutes")
  overtimeStatus  OvertimeStatus? @map("overtime_status")
  overtimeReason  String?  @map("overtime_reason")
  finalStatus     FinalStatus @default(PRESENT) @map("final_status")
  @@unique([employeeId, date])
  @@map("attendance_records")
}
```

---

## 6. Logique métier

### 6.1 Géofence

- Distance Haversine + rayon `Site.radiusM`.
- Hors zone : refus + enregistrement **FraudAttempt** (`distanceM` peut être -1 si pas de site).

### 6.2 Permission / mission active

- Filtre standard : `cancelledAt: null` (`src/lib/request-active.ts` → `activeRequestFilter`).
- Les demandes **approuvées** sur la période calendaire du jour peuvent forcer `finalStatus` **PERMISSION** ou **MISSION** (voir `hasApprovedLeaveOrMission` dans `attendance-engine`).

### 6.3 Heures supplémentaires au départ

| Cas | Règle |
|-----|--------|
| **Samedi et dimanche** | Travail volontaire : **pas de statut « retard »** à l’arrivée (on ne compare pas à `startTime` du planning). Au départ, **toute la durée** travaillée compte en heures sup (comme l’ancienne règle « samedi seul »), dans les limites de fenêtre / plafonds. |
| **Lun–Ven** | Heures sup = minutes entre **max**(`schedule.endTime`, fenêtre OT) et **min**(heure de départ, fin fenêtre). Fenêtre OT par défaut **18h30** → **21h00** (`OVERTIME_START_*`, `OVERTIME_END_HOUR`). |
| **Plafonds** | Variables d’environnement `MAX_WEEKLY_OVERTIME_MIN` (défaut 600), `MAX_MONTHLY_OVERTIME_MIN` (défaut 2400). |

### 6.4 Départ automatique

- `runAutoCheckout()` : pour les pointages du jour avec arrivée mais sans départ, clôture à l’heure de fin du planning avec `checkOutStatus: AUTO` et commentaire type « Départ auto – non déclaré ».

### 6.5 Validation RH des heures sup

- `PUT /api/overtime/[id]` : passage `APPROVED` / `REJECTED`, enregistrement validateur, règles métier (ex. lien mission approuvée selon implémentation actuelle du fichier).

### 6.6 Matricule employé (création)

- Génération automatique : préfixe `STRUCTURE-SERVICE-` + suffixe numérique **aléatoire** 4 chiffres, contrôle d’unicité en base (boucle + repli 6 chiffres si nécessaire). Voir `src/app/api/employees/route.ts`.

### 6.7 Pseudo-code : checkout avec heures sup

```ts
// Simplifié — voir processCheckOut dans attendance-engine.ts
const total = minutesBetween(checkInTime, now);
if (isSaturday) {
  overtime = minutesBetween(checkInTime, effectiveCheckoutForOvertime);
} else {
  const overtimeStart = max(scheduleEnd, otWindowStart);
  overtime = minutesBetween(overtimeStart, effectiveCheckoutForOvertime);
}
overtime = min(overtime, remainingWeek, remainingMonth);
await prisma.attendanceRecord.update({ data: { checkOutTime: now, overtimeMinutes: overtime, overtimeStatus: overtime > 0 ? "PENDING" : null } });
```

---

## 7. Instructions exports Excel / PDF

| Page | Comportement |
|------|----------------|
| **Permissions** (`/leaves`) | Export **Excel** côté client (dynamic `import("exceljs")`), données via `GET /api/leaves` paginée (100/lot) avec les **filtres** courants. Ne pas utiliser `GET /api/reports?type=leaves` (inexistant / erreur dates). |
| **Missions** (`/missions`) | Excel (+ récapitulatif paie) et PDF ; `fetchAllMissions` enchaîne les pages de 100. |
| **Rapports** (`/reports`) | S'ouvre sur le mois en cours ; export XLSX / PDF du rapport affiché. |
| **Employés** | Excel / PDF via `fetchAllEmployees` (`src/lib/fetch-all-employees.ts`, pages de 100) ; export des pointages des employés cochés. |
| **Heures sup** | Excel ; pagination par lots de 100. |

> **Règle** : toutes les API de liste plafonnent `limit` à **100**. Un export ou une liste déroulante qui demande `limit=1000` ou `10000` ne reçoit que 100 lignes : toujours paginer (voir `fetchAllEmployees`).

**Documents individuels** : demande d'autorisation d'absence (PDF navigateur + Word serveur `GET /api/leaves/[id]/document`) et ordre de mission (PDF et « Word simple » navigateur + modèle officiel Word serveur `GET /api/missions/[id]/document`). Le contenu est écrit une seule fois (`src/lib/documents/leave-request.ts`, `mission-order.ts`) puis rendu en PDF (`download.ts`) ou en Word (`render-docx.ts`, briques `docx-kit.ts`). Logo de la structure, bandeau si la demande est annulée, cadres de signature, pied de page avec date de génération et numéro de page.

**Mise en forme commune** :

| Format | Module | À utiliser pour |
|--------|--------|-----------------|
| PDF | `src/lib/pdf-kit.ts` | `createPdf()` (jamais `new jsPDF()` directement), `addPdfHeader()`, `PDF_TABLE` pour autoTable, `savePdf()` (ajoute le pied de page). |
| Excel | `src/lib/excel-format.ts` | `finishSheet(ws)` après l'ajout des lignes (en-tête coloré, ligne figée, filtre), `excelDay()` pour les dates, `excelDuration()` + `EXCEL_DURATION_FORMAT` pour les durées. |
| Textes | `src/lib/export-format.ts` | `fmtHoursFr()` (« 468,7 h »), `fmtPercentFr()` (« — » si sans objet), `fmtDayFr()` / `fmtDayLongFr()` pour les dates `@db.Date`, `fileDateStamp()` pour les noms de fichiers (jour de Douala). |

> **Règle PDF** : la police Helvetica de jsPDF ne connaît que le jeu WinAnsi. Un caractère hors de ce jeu (« → », espace fine de `toLocaleString`, émoji) fait sortir toute la ligne lettres espacées. `createPdf()` filtre ces caractères ; écrire « du … au … » plutôt qu'une flèche.
>
> **Règle Word serveur** : les logos sont lus dans `public/brand/` ; `outputFileTracingIncludes` (`next.config.ts`) les embarque dans les fonctions Vercel. Une nouvelle route qui lit ces fichiers doit y être ajoutée.

---

## 8. UX / UI et marque

### 8.1 Navigation (dashboard)

Source unique : `src/lib/navigation.ts` (`NAV_GROUPS`), lue par le menu latéral, le fil d'Ariane et les titres d'onglet.

| Groupe | Pages |
|--------|-------|
| Pilotage | Tableau de bord `/`, Rapports `/reports` |
| Présences | Pointages `/attendance`, Pauses `/breaks`, Heures sup `/overtime` |
| Demandes | Autorisations d'absence `/leaves`, Missions `/missions` |
| Administration | Employés `/employees`, Utilisateurs `/users` (ADMIN), Paramètres `/settings` |

Compteurs « à traiter » (heures sup, autorisations et missions en attente) : `GET /api/nav-counts`, partagés par `useNavCounts()` (`src/lib/use-nav-counts.ts`). Après une décision, appeler `refreshNavCounts()`.

### 8.2 Marque et couleurs

| Élément | Où |
|---------|----|
| Couleurs | `@theme` dans `src/app/globals.css` : `scpb-*` (olive #94a538, orange #f7ad21) et `afrexia-*` (vert forêt #24683c) relevées sur les logos ; `brand-*` (couleur commune de l'interface, bleu provisoire) ; `ink-*` (fonds sombres). |
| Logos des structures | `src/lib/brand.ts` (`STRUCTURE_BRANDS`) : `logo`, `logoOnDark`, `wordmark` (le logo contient-il le nom ?), `hex` (exports). Sans fichier, un monogramme coloré s'affiche. |
| Fichiers de logo | `public/brand/scpb.png` et `public/brand/afrexia.png` (recadrés, 240 px de haut), générés à partir des originaux fournis `logo.png` (SCPB) et `logo-dark.png` (AFREXIA). GoldenBeans : `public/brand/goldenbeans.png` attendu (monogramme en attendant). |
| Logos dans les PDF | `addPdfLogos(doc, structures)` (`src/lib/pdf-branding.ts`) : rapports, listes employés / missions, ordre de mission et demande d'autorisation (logo de la structure de l'employé). |
| Pictogramme de l'application | `src/components/brand/BrandMark.tsx`, favicon `src/app/icon.svg`, icône iOS `src/app/apple-icon.tsx`. |
| Couleurs des graphiques | `src/lib/chart-colors.ts`. |

**Remplacer un logo** : déposer le nouveau fichier dans `public/brand/` (PNG transparent recadré), mettre à jour son chemin dans `STRUCTURE_BRANDS` et, s'il change de proportions, `logoAspect` (largeur / hauteur, utilisé par les PDF et les documents Word). La couleur des en-têtes de tableaux des exports est `EXPORT_ACCENT_HEX` (même fichier). Écrans RH : les logos des structures de l'entreprise côte à côte (`CoBrand`). Pages employé : logo de la structure de l'employé (`PublicShell structure=…`).

### 8.3 Composants partagés (`src/components/ui/`)

`Button` / `ButtonLink`, `Card`, `Field` + `Input` / `Select` / `Textarea`, `Badge`, `StatusBadge` / `StructureBadge` (libellés dans `src/lib/status-labels.ts`), `StatTile`, `PageHeader`, `FilterBar`, `Table`, `Pagination`, `EmptyState` / `Skeleton`, `Modal` (Échap, focus, panneau latéral `variant="drawer"`), `useConfirm()` et `useToast()` (montés à la racine par `Providers`). **Ne plus utiliser `alert()` / `confirm()`.**

### 8.4 Patterns UX

- **Filtres dans l'adresse** (`useUrlFilters`, `src/lib/use-url-filters.ts`) sur Pointages, Employés, Autorisations, Missions, Heures sup, Pauses, Rapports, Paramètres : ils survivent au rechargement et se partagent par lien (ex. `/overtime?status=PENDING`).
- **Indicateurs cliquables** (`StatTile`) : filtrent la liste correspondante.
- **Décisions** (approuver, refuser, annuler, supprimer) : confirmation pour les actions destructrices, notification de résultat dans tous les cas.
- **Pages publiques** (`PublicShell`) : géoloc, formulaires WhatsApp, onboarding, QR code, confidentialité. La page `/geoloc` vérifie d'abord le lien via `GET /api/geoloc/context`, puis demande la position.
- **Employés** : création avec matricule auto ; suppression réservée **ADMIN** (transaction avec `SET LOCAL statement_timeout`) ; préférer « Enregistrer un départ ».

---

## 9. Sécurité et authentification

| Sujet | Détail |
|-------|--------|
| **Auth utilisateurs RH** | Supabase ; session lue côté serveur ; API dashboard : 401 si non connecté (middleware). |
| **Rôles** | `requireRole([...])` / `requireTenant([...])` sur les routes API (ex. ADMIN seul pour suppression employé). |
| **Cloisonnement des entreprises** | Voir §13 : `tenantDb(orgId)` sur toutes les requêtes du dashboard, compte valable uniquement sur l'adresse de son entreprise, liens publics refusés sur une autre adresse. |
| **Données employés** | Accès Prisma via `DATABASE_URL` serveur — ne pas exposer la clé service côté client. |
| **Webhook WhatsApp** | Route publique ; validation par Meta (token vérification GET). |
| **RLS Supabase** | Migration `20260403120000_enable_rls_public_tables` : **RLS activée** sur les tables `public` listées (linter 0013). Pas de policies permissives : PostgREST `anon`/`authenticated` sans accès aux lignes par défaut ; Prisma (rôle propriétaire / privilégié) conserve l’accès. |
| **Politique confidentialité** | `/privacy` en route publique dans le middleware Supabase. |
| **Liens de pointage** | Signés HMAC, valables 15 min (`src/lib/geoloc-link.ts`). Le motif de retard (`LATE_REASON`) exige aussi la signature du lien d'arrivée. `GET /api/geoloc/context` ne renvoie prénom et structure qu'avec une signature valide. |

---

## 10. Fonctionnalités futures (piste SaaS RH)

| Idée | Description |
|------|-------------|
| Multi-tenant | **Fait** (§13) : `organizationId` sur toutes les tables, cloisonnement applicatif (`tenantDb`). Piste : RLS + policies par entreprise en défense supplémentaire, création d'entreprise sans déploiement (structures en table). |
| Congés longs | Module distinct des « permissions » courtes (soldes, types, workflows). |
| Self-service employé web | Portail sécurisé en plus du WhatsApp. |
| Facturation | Plans, limites utilisateurs / sites. |
| Audit renforcé | Export RGPD, anonymisation, rétention. |

---

## 11. Bugs identifiés et corrections

| Date | Bug | Correction |
|------|-----|------------|
| 2026-04 | **DELETE employé** en 500 (timeout ~10 s) | Transaction avec `SET LOCAL statement_timeout`, `timeout` / `maxWait` Prisma ; forme transaction adaptée selon évolutions. |
| 2026-04 | Export **Permissions** : JSON `dateFrom et dateTo sont requis` | L’export pointait vers `/api/reports` ; remplacé par export **ExcelJS** + agrégation `/api/leaves`. |
| 2026-04 | Pagination invisible (1 seule page) | Affichage permanent du résumé « X–Y sur Z » sur **Permissions** et **Missions** ; navigation si `totalPages > 1`. |
| 2026-04 | WhatsApp : répondre **« 2 »** pour motif heures sup lançait **Départ** | Conflit menu numérique (2 = départ) ; **motif en texte libre** + `parseIntent(..., { skipNumericMenuShortcuts })` tant qu’un `overtimeReason` est attendu. |
| 2026-04 | Linter Supabase **RLS disabled** | Migration SQL activation RLS sur tables `public` applicatives (+ `_prisma_migrations`). |
| 2026-04-11 | **Samedi** : pointage traité comme **retard** vs horaire de semaine | `isSaturdayOrSunday` : pas de `LATE` le week-end ; **dimanche** : pointage autorisé (avant : refus). Départ : dimanche = même logique heures sup que samedi. |
| 2026-10-21 | Motif de retard enregistrable sans lien signé (numéro seul) | `LATE_REASON` vérifie `exp`/`sig` du lien d'arrivée. |
| 2026-10-21 | Exports Employés / Missions / Heures sup et listes d'employés tronqués à 100 | Pagination par lots de 100 (`fetchAllEmployees`, boucles d'export). |
| 2026-10-21 | Compteurs Employés calculés sur la seule page affichée | `GET /api/employees` renvoie `stats` (actifs, inactifs, WhatsApp) sur toute la sélection. |
| 2026-10-21 | Fiche employé : samedis et jours avant embauche / après départ comptés comme absences | Jours ouvrés = lundi–vendredi hors fériés, bornés par l'embauche et le départ ; week-ends travaillés affichés. |
| 2026-10-21 | Paramètres : fenêtre fermée comme « enregistré » même si l'API refusait | Réponse vérifiée, erreur affichée ; lecture seule pour le DG. |
| 2026-10-21 | Titre « Heures sup » absent de l'en-tête ; police Geist jamais appliquée ; date d'en-tête décalée entre 23 h et minuit | Navigation centralisée, `font-family` corrigée, date calculée au fuseau Douala côté navigateur. |
| 2026-10-21 | Pauses : jour par défaut en UTC (la veille entre minuit et 1 h) | Jour au fuseau Douala (`todayDate()`). |
| 2026-10-21 | Pagination limitée aux pages 1 à 5 (Employés) | Composant `Pagination` avec fenêtre autour de la page courante. |
| 2026-10-22 | Rapport PDF : période illisible (« Période : 1 oct. !' 21 oct. »), logos dans un ordre aléatoire, décimales à point (« 468.7h ») | Caractères filtrés par `createPdf()`, « du … au … », logos toujours SCPB puis AFREXIA, nombres au format français. |
| 2026-10-22 | Ponctualité à 100 % pour un employé sans aucune arrivée (rapport, fiche employé) | Taux `null` affiché « — » et classé en fin de tri. |
| 2026-10-22 | Ordre de mission (modèle officiel Word) : « Heure de départ / retour » écrasés dans une colonne d'un mot, lignes à remplir invisibles, signatures décalées | Grille de tableau fixe, lignes à remplir en bordure basse, case du transport cochée d'après la saisie, cadres de signature alignés, logo. |
| 2026-10-22 | Demande d'absence Word : police par défaut, titre sur deux lignes, statut « Approuvé » (≠ interface), demande annulée non signalée, date de création au jour UTC | Document commun PDF / Word (`src/lib/documents/`), libellés de `status-labels.ts`, bandeau « annulée », date au fuseau Douala. |
| 2026-10-22 | Exports Excel : dates et durées en texte, pas de ligne d'en-tête figée ni de filtre, « 0h00 » les jours d'absence ; noms de fichiers datés du jour UTC | `finishSheet()`, vraies dates et durées `[h]:mm`, cellules vides les jours non travaillés, `fileDateStamp()` / dates locales. |

---

## 12. Historique des modifications (changelog)

| Date | Section | Modification |
|------|---------|--------------|
| 2026-04-03 | Document entier | Création initiale de `Projet_Pointage_RH.md` : structure 1–12, workflow WhatsApp, schéma BDD, logique métier, sécurité, bugs connus, exports. |
| 2026-04-03 | §5, §9 | Référence migration RLS `20260403120000_enable_rls_public_tables`. |
| 2026-04-03 | §6, §11 | Matricule aléatoire ; timeouts suppression employé ; motif heures sup WhatsApp. |
| 2026-04-03 | §7, §8 | Export permissions Excel client ; pagination missions/permissions. |
| 2026-04-11 | §6, §11, dashboard | Week-end : pas de retard à l’arrivée ; pointage dimanche ; message dashboard week-end. |
| 2026-04-11 | §6, annexes env | Défaut heures sup semaine : début fenêtre **18h30** (au lieu de 18h00). Planning type seed : arrivée 8h, marge 30 min, fin 17h30. |
| 2026-10-22 | §9, §10, §13, annexe A | Multi-entreprise : table `organizations`, `organization_id` partout, `tenantDb`, sous-domaines (`goldenbeans.staf-track.com`), crons par entreprise, marque par entreprise, `pnpm org:create`, `pnpm tenant:check`. |
| 2026-10-21 | §7, §8, §9, §11 | Refonte UI/UX et marque : composants partagés, navigation groupée avec compteurs, filtres dans l'adresse, pages publiques `PublicShell`, `GET /api/nav-counts`, `GET /api/geoloc/context`, corrections listées au §11. |
| 2026-10-22 | §7, §8, §11 | Vérification du rendu de tous les documents générés : modules `pdf-kit`, `excel-format`, `export-format`, `src/lib/documents/` ; documents individuels refaits (logo, sections, signatures, pied de page) ; corrections listées au §11. |

## 13. Multi-entreprise

Plusieurs entreprises partagent la même application et la même base, chacune dans un espace cloisonné.

| Entreprise | Adresse | Structures |
|------------|---------|------------|
| `groupe` (par défaut) | `staf-track.com` (domaine de `APP_BASE_URL`) | SCPB, AFREXIA |
| `goldenbeans` | `goldenbeans.staf-track.com` | GOLDENBEANS |

### 13.1 Principe

- Table `organizations` (`slug`, `name`, `structures`) ; colonne `organization_id` sur toutes les tables métier.
- **L'adresse désigne l'entreprise** : sous-domaine → `slug` (`orgSlugFromHost`, `src/lib/tenant.ts`). Le domaine racine, `www`, `localhost` et les URL Vercel donnent l'entreprise par défaut (`DEFAULT_ORG_SLUG`, « groupe »). En local : `goldenbeans.localhost:3000`.
- **Un compte RH n'est valable que sur l'adresse de son entreprise** (`getSessionState` → `wrong-org`) : la connexion est refusée avec un message, le dashboard renvoie vers `/login?erreur=entreprise`. Les cookies de session sont propres à chaque sous-domaine.
- **Accès aux données** : toujours via `requireTenant(roles)` (routes) ou `tenantDb(orgId)` / `tenantScope(orgId)` (fonctions métier). `tenantDb` est une extension Prisma qui ajoute `organizationId` à chaque filtre et refuse toute écriture vers une autre entreprise (`TenantViolationError`). Les créations indiquent `organizationId` explicitement (vérifié par `tsc`).
- **Règle ESLint** : `@/lib/prisma` est interdit dans `src/app` et `src/components`, sauf pour les liens publics qui retrouvent d'abord l'employé sur toutes les entreprises (jeton signé, numéro WhatsApp).
- **Unicité** : matricule et numéro d'ordre de mission par entreprise ; numéros WhatsApp (employés et comptes RH) et e-mails des comptes uniques sur toute la base.
- **Liens publics** (GPS, formulaires) : construits avec `orgBaseUrl(org)` ; refusés s'ils sont ouverts sur l'adresse d'une autre entreprise (`orgForEmployeeRequest`).
- **WhatsApp** : un seul numéro pour toutes les entreprises ; l'employé est reconnu à son numéro, puis tout se fait dans son entreprise. Alertes RH : comptes RH / Admin / DG de l'entreprise ; les numéros `WHATSAPP_*_NOTIFY_PHONES` et `WHATSAPP_HR_PHONE` ne servent qu'au groupe.
- **Crons** : un passage par entreprise active (`forEachOrg`), mêmes horaires pour toutes.
- **Interface** : `OrgProvider` (layout racine) → `useOrg()` ; logos (`CoBrand`), listes de structures (`StructureOptions`), PDF. Les filtres « structure » n'apparaissent que si l'entreprise en a plusieurs.

### 13.2 Ajouter une entreprise

1. Ajouter sa structure à l'enum `Structure` (migration `ALTER TYPE "Structure" ADD VALUE …`), à `STRUCTURE_BRANDS` (`src/lib/brand.ts`), aux couleurs `@theme` (`globals.css`), à `Badge` / `STRUCTURE_TONE` (proportion du logo : `logoAspect`).
2. Déposer son logo dans `public/brand/<structure>.png` (PNG transparent recadré, ≥ 512 px de large ; variante `-dark` pour le menu si besoin).
3. Vercel : ajouter le domaine `<slug>.staf-track.com` ; DNS : `CNAME <slug> → cname.vercel-dns.com` ; Supabase Auth : ajouter `https://<slug>.staf-track.com/**` aux URL de redirection.
4. `pnpm org:create --slug <slug> --name "<Nom>" --structures <STRUCTURE> --admin-email … --admin-name "…"` : crée l'entreprise, recopie les jours fériés du groupe et le premier compte ADMIN (mot de passe saisi, masqué, dans le terminal).
5. L'administrateur de l'entreprise configure ses sites, horaires, employés et comptes RH depuis son espace.

### 13.3 Migrations

- `20261022120000_organizations` (étape 1/2) : compatible avec l'ancien code (valeur par défaut `org_groupe`, anciennes unicités conservées). À appliquer **avant** le déploiement.
- `prisma/after-deploy/20261022130000_organizations_finalize` (étape 2/2) : retire les valeurs par défaut et les unicités globales. À déplacer dans `prisma/migrations/` puis appliquer **après** le déploiement, avant de créer une autre entreprise.
- Contrôle du cloisonnement sur une base locale : `pnpm tenant:check`.

---

## Annexe A — Variables d’environnement (indicatives)

À compléter selon déploiement réel (ne pas committer les secrets) :

```env
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
WHATSAPP_VERIFY_TOKEN=
# Meta WhatsApp API, normalisation téléphone, etc.
MAX_WEEKLY_OVERTIME_MIN=
MAX_MONTHLY_OVERTIME_MIN=
OVERTIME_START_HOUR=18
OVERTIME_START_MINUTE=30
OVERTIME_END_HOUR=21
WHATSAPP_HR_PHONE=
# Multi-entreprise (§13) : domaine racine = celui de APP_BASE_URL
APP_BASE_URL=https://staf-track.com
DEFAULT_ORG_SLUG=groupe
```

---

## Annexe B — Menu numérique WhatsApp (rappel)

Les chiffres **1 à 11** sont décrits dans `HELP_MESSAGE` / `getWelcomeMessage` (`src/lib/intent-parser.ts`). Lorsqu’un **motif d’heures sup** est attendu pour la journée, ces raccourcis sont **désactivés** pour éviter les collisions avec une saisie numérique.

---

*Fin du document — à mettre à jour à chaque évolution fonctionnelle ou correctif majeur.*
