# Projet Pointage RH — Documentation technique

> Document de référence pour développeurs et agents IA. Dernière mise à jour du contenu : **2026-04-11**.

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
| **Missions** (`/missions`) | Excel (+ PDF jsPDF selon UI) ; `fetchAllMissions` avec `limit` API plafonné — pagination côté client si besoin. |
| **Rapports** (`/reports`) | Nécessite **dateFrom** et **dateTo** ; export XLSX / PDF depuis l’UI une fois les dates renseignées. |
| **Employés** | Export Excel depuis la page liste. |
| **Pointages / Heures sup** | Exports selon implémentation des pages (ExcelJS / colonnes dédiées). |

---

## 8. UX / UI

### 8.1 Menu latéral (dashboard)

| Lien | Chemin |
|------|--------|
| Dashboard | `/` |
| Employés | `/employees` |
| Pointages | `/attendance` |
| Heures sup | `/overtime` |
| Permissions | `/leaves` |
| Missions | `/missions` |
| Paramètres | `/settings` |
| Rapports | `/reports` |

### 8.2 Patterns UX notables

- **Permissions & Missions** : filtres (statut, dates, service, employé), **pagination** avec résumé « X–Y sur Z » toujours visible après chargement ; boutons Précédent/Suivant si plusieurs pages.
- **Employés** : création avec matricule auto ou saisi ; suppression réservée **ADMIN** ; transaction suppression avec `SET LOCAL statement_timeout` + timeouts Prisma étendus pour gros historiques.
- **Dashboard** : KPIs incluant missions / permissions en cours selon évolutions récentes.

---

## 9. Sécurité et authentification

| Sujet | Détail |
|-------|--------|
| **Auth utilisateurs RH** | Supabase ; session lue côté serveur ; API dashboard : 401 si non connecté (middleware). |
| **Rôles** | `requireRole([...])` sur les routes API (ex. ADMIN seul pour suppression employé). |
| **Données employés** | Accès Prisma via `DATABASE_URL` serveur — ne pas exposer la clé service côté client. |
| **Webhook WhatsApp** | Route publique ; validation par Meta (token vérification GET). |
| **RLS Supabase** | Migration `20260403120000_enable_rls_public_tables` : **RLS activée** sur les tables `public` listées (linter 0013). Pas de policies permissives : PostgREST `anon`/`authenticated` sans accès aux lignes par défaut ; Prisma (rôle propriétaire / privilégié) conserve l’accès. |
| **Politique confidentialité** | `/privacy` en route publique dans le middleware Supabase. |

---

## 10. Fonctionnalités futures (piste SaaS RH)

| Idée | Description |
|------|-------------|
| Multi-tenant | `organizationId` sur toutes les tables, isolation stricte RLS + policies par org. |
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
```

---

## Annexe B — Menu numérique WhatsApp (rappel)

Les chiffres **1 à 11** sont décrits dans `HELP_MESSAGE` / `getWelcomeMessage` (`src/lib/intent-parser.ts`). Lorsqu’un **motif d’heures sup** est attendu pour la journée, ces raccourcis sont **désactivés** pour éviter les collisions avec une saisie numérique.

---

*Fin du document — à mettre à jour à chaque évolution fonctionnelle ou correctif majeur.*
