# Mode d’emploi — Numérotation WhatsApp (1 à 14)

**Application :** Pointage RH — canal employé WhatsApp  
**Public :** formation des employés et encadrement  
**Dernière mise à jour :** mai 2026

---

## 1. Avant de commencer

### 1.1 Prérequis

| Condition | Si ce n’est pas le cas |
|-----------|-------------------------|
| Votre numéro WhatsApp est enregistré par les RH dans la fiche employé | Message : *« Votre numéro n'est pas encore lié… »* → contacter les RH |
| Votre compte est **actif** | Message : *« Votre compte est désactivé »* |
| Connexion Internet sur le téléphone | Impossible d’ouvrir le lien de géolocalisation |
| GPS activé et autorisation « position » accordée au navigateur | Le pointage via lien échoue |

### 1.2 Comment parler au bot

- Envoyez un **message texte** au numéro WhatsApp de l’entreprise (celui configuré par les RH).
- Pour le menu complet : tapez **`aide`**, **`menu`**, **`help`**, **`?`** ou un simple **`bonjour`**.
- Pour une action : envoyez le **numéro seul** (`1`, `2`, `3`…) ou le **mot-clé** (ex. *arrivé*, *départ*, *statut*).
- Si le bot ne comprend pas : il affiche **3 boutons** (*Arrivé*, *Départ*, *Mon statut*) — équivalents aux numéros **1**, **2** et **3**.

### 1.3 Règle importante : géolocalisation

Les numéros **1**, **2**, **13** et **14** déclenchent toujours la **même procédure** :

1. Le bot envoie un **lien** (page web `/geoloc`).
2. Vous **ouvrez le lien** sur votre téléphone.
3. Vous appuyez sur **« Récupérer ma position maintenant »** (GPS en direct).
4. Vous **validez** l’enregistrement.
5. Le bot vous renvoie un **message de confirmation** sur WhatsApp.

> **Interdit / refusé :** envoyer une **position WhatsApp** (épingle carte) à la place du lien. Le système l’ignore et demande d’utiliser le lien.

> **Zone :** le pointage n’est accepté que si vous êtes dans le **périmètre GPS** du site de travail assigné. Sinon : *« Vous n'êtes pas dans la zone de travail (Xm). Pointage refusé. »*

Le lien d’action reste valide environ **10 minutes** après votre demande (1, 2, 13 ou 14).

---

## 2. Vue d’ensemble du menu

| N° | Intitulé court | Géoloc ? | Résumé |
|----|----------------|----------|--------|
| **1** | Arrivée | Oui | Pointer l’entrée du matin |
| **2** | Départ | Oui | Pointer la sortie |
| **3** | Statut du jour | Non | Voir arrivée / départ / pause du jour |
| **4** | Mes pointages | Non | Synthèse du mois + 5 derniers jours |
| **5** | Autorisations en cours | Non | Demandes en attente + absences approuvées « aujourd’hui » |
| **6** | Heures sup validées | Non | Heures sup du mois, statut validé |
| **7** | Missions & autorisations | Non | Historique récent (3 mois) |
| **8** | Heures sup en attente | Non | Heures sup non encore validées par la RH |
| **9** | Détail d’un jour | Non | Fiche d’un jour précis (date à préciser) |
| **10** | Résumé semaine | Non | Lundi → samedi, semaine en cours |
| **11** | Absences au pointage | Non | Jours marqués « absent » (3 mois) |
| **12** | Demander une autorisation | Non | Lien formulaire web sécurisé |
| **13** | Début de pause | Oui | Sortie pause déjeuner |
| **14** | Retour de pause | Oui | Reprise après pause |

*(Le système propose aussi le **15** = demande de mission ; voir annexe en fin de document.)*

---

## 3. Détail par numéro

---

### 1 — Arrivée (check-in)

**Quand l’utiliser :** en début de journée de travail, à l’arrivée sur le site.

**Comment :** envoyez `1` ou un mot comme *arrivé*, *présent*, *check-in*.

**Étapes :**
1. Réception du lien de géolocalisation.
2. Validation GPS sur le lien.
3. Message de confirmation avec l’heure d’arrivée.

**Ce que le système enregistre :**
- Heure d’arrivée réelle.
- Statut **à l’heure** ou **en retard** (par rapport à l’horaire du site + marge de tolérance RH).
- Position GPS.

**Cas particuliers :**

| Situation | Comportement |
|-----------|--------------|
| Arrivée déjà pointée le même jour | Refus : *« Vous avez déjà pointé votre arrivée aujourd'hui. »* |
| Jour férié | Refus |
| Autorisation d’absence ou mission **déjà approuvée** pour aujourd’hui | Refus (pas de double pointage) |
| Retard | Message avec minutes de retard ; le bot peut demander un **motif** (répondez en texte libre, pas un numéro du menu) |
| Samedi / dimanche | Arrivée acceptée ; pas de « retard » métier ; les heures du week-end peuvent être traitées en heures sup au départ |

**Formation — scénario :** un employé envoie `1` à 8h05, ouvre le lien, valide. Il reçoit *« Arrivée enregistrée à 08:05… »*.

---

### 2 — Départ (check-out)

**Quand l’utiliser :** en fin de journée, avant de quitter le site (ou la zone autorisée).

**Comment :** envoyez `2` ou *départ*, *je pars*, *checkout*, etc.

**Prérequis :** une **arrivée (1)** doit déjà exister pour la journée.

**Étapes :** identiques à l’arrivée (lien GPS → confirmation WhatsApp).

**Ce que le système calcule :**
- Heure de départ.
- Durée travaillée (en déduisant la pause enregistrée).
- **Heures supplémentaires** éventuelles (voir ci-dessous).
- Pause mesurée et pause déduite (max. 60 min pour la paie).

**Heures sup (rappel formation) :**
- En semaine : comptées en général **à partir de 18h30** (ou fin d’horaire planifié si plus tard), jusqu’à **21h00** max pour le calcul automatique.
- Si des heures sup sont détectées : le bot demande un **motif en une phrase** (texte libre). Tant que ce motif n’est pas saisi, les chiffres **1 à 12 du menu ne sont pas interprétés** comme commandes (pour éviter qu’un « 2 » soit pris pour « Départ » au lieu du motif).
- Les heures sup restent **en attente de validation RH** (voir **8** et **6**).

**Départ anticipé :** si vous partez avant l’heure de fin prévue, le bot signale l’avance et peut demander un **motif** (texte libre).

**Départ automatique :** si vous oubliez de pointer le départ, un traitement automatique peut enregistrer un départ vers l’heure de fin planifiée (ex. 17h30) **sans heures sup**. Vous recevez alors un message WhatsApp d’information (souvent vers 21h).

**Formation — scénario :** après une journée normale, l’employé envoie `2` à 18h45, valide le GPS, reçoit durée travaillée + éventuelles heures sup + demande de motif.

---

### 3 — Statut du jour

**Quand l’utiliser :** à tout moment pour **consulter** sans modifier le pointage.

**Comment :** `3` ou *statut*, *état*.

**Réponse type :**
- Heure d’arrivée (+ à l’heure / en retard).
- Heure de départ (ou *non encore pointé*).
- Départ / retour de pause si applicable.
- Statut global de la journée (`PRESENT`, `ABSENT`, `MISSION`, etc.).

**Si aucun pointage aujourd’hui :** *« Aucun pointage aujourd'hui. »*

**Utile en formation pour :** vérifier qu’un `1` ou `13`/`14` a bien été pris en compte avant d’envoyer `2`.

---

### 4 — Mes pointages du mois

**Quand l’utiliser :** bilan personnel sur le **mois civil en cours**.

**Comment :** `4` ou *mes pointages*, *mon historique*, *pointages du mois*.

**Contenu du message :**
- Nombre de jours **présents** / **absents**.
- Compteurs **à l’heure** / **en retard**.
- Total **heures sup** du mois (validées ou sans statut bloquant).
- Liste des **5 derniers jours** avec heures arrivée → départ.

**Ne pas confondre avec :**
- **10** = semaine en cours (lun–sam).
- **9** = un jour précis au choix.
- **11** = uniquement les jours **absents** au sens pointage.

---

### 5 — Mes autorisations d’absence en cours

**Quand l’utiliser :** savoir si une demande est **en attente** ou si une absence **approuvée couvre aujourd’hui**.

**Comment :** `5` ou *mes autorisations*, *autorisation d'absence*.

**Contenu :**
- Demandes **⏳ en attente** de validation RH.
- Périodes **✅ approuvées** dont la date du jour est comprise entre début et fin.

**Ne pas confondre avec :**
- **11** = jours où le **pointage** indique « absent » (pas de présence enregistrée), sur 3 mois.
- **7** = historique large missions + autorisations (3 mois).
- **12** = **créer** une nouvelle demande.

**Si rien en cours :** message explicite + rappel d’utiliser **7** ou **11** selon le besoin.

---

### 6 — Mes heures supplémentaires (validées)

**Quand l’utiliser :** consulter les heures sup **déjà validées** par la RH pour le **mois en cours**.

**Comment :** `6` ou *mes heures sup*, *heures supplémentaires*.

**Contenu :**
- Total heures/minutes du mois.
- Détail par jour (jusqu’à 8 jours affichés).

**Ne pas confondre avec :**
- **8** = heures sup **pas encore validées** (statut *en attente*).
- Le **motif** saisi au départ est visible via **9** (détail jour) pour une date donnée.

---

### 7 — Mes missions (et historique autorisations)

**Quand l’utiliser :** vue **historique récent** (3 derniers mois) des **missions** et des **autorisations d’absence** (tous statuts affichés : en attente, approuvé, refusé, annulé).

**Comment :** `7` ou *mes missions*.

**Contenu :**
- Liste des missions (dates, motif, lieu, statut).
- Liste des autorisations d’absence sur la même période.

**Ne pas confondre avec :**
- **5** = uniquement ce qui est **en cours** (attente + approuvé aujourd’hui).
- **15** = déposer une **nouvelle** demande de mission (formulaire).

---

### 8 — Heures sup en attente

**Quand l’utiliser :** suivre les heures sup **déclarées au départ** mais **pas encore validées** par la RH (3 derniers mois).

**Comment :** `8` ou *heures sup en attente*.

**Parcours type en formation :**
1. Départ tardif avec heures sup → message demandant le motif.
2. L’employé répond en texte : *« Réunion client urgente »*.
3. Plus tard : `8` montre la ligne en attente ; après validation RH, `6` l’affichera comme validée.

---

### 9 — Détail d’un jour

**Quand l’utiliser :** fiche complète d’**une date précise** (passée ou aujourd’hui).

**Comment (deux façons) :**
- `9 15/03` — numéro **9**, espace, date **JJ/MM**
- `9 15/03/2026` — avec année
- Ou texte : *détail jour 15/03*

**Si vous envoyez seulement `9` :** le bot demande la date.

**Contenu :**
- Arrivée / départ (et mention retard, départ auto, etc.).
- Durée travaillée.
- Heures sup + statut (validée / en attente / refusée) + motif si renseigné.
- Statut journée (présent, mission, autorisation…).

**Formation — exercice :** après un `2` hier, envoyer `9 27/05` et relire durée et heures sup.

---

### 10 — Résumé de la semaine

**Quand l’utiliser :** bilan **de la semaine en cours** (du **lundi au samedi**).

**Comment :** `10` ou *résumé semaine*, *ma semaine*, *historique semaine*.

**Contenu :** synthèse construite à partir des pointages de la semaine + indication s’il existe des autorisations en attente.

**Ne pas confondre avec :** **4** (mois) ou **9** (un jour).

---

### 11 — Mes absences au pointage

**Quand l’utiliser :** lister les jours où le système vous a marqué **ABSENT** (absence de pointage valide), sur les **3 derniers mois**.

**Comment :** `11` ou *mes absences*, *jours absent*.

**Important pour la formation :**
- Ce n’est **pas** la liste des demandes d’autorisation (**5**).
- Un jour peut être « absent » au pointage alors qu’une autorisation est en cours de traitement — d’où l’intérêt de faire **12** puis suivre avec **5**.

**Si aucune absence :** message positif du type *« aucune absence ces 3 derniers mois »*.

---

### 12 — Demander une autorisation d’absence

**Quand l’utiliser :** déposer une **nouvelle** demande officielle (congé, maladie, formation, etc.).

**Comment :** `12` ou *demander une autorisation*, *formulaire autorisation*, *nouvelle autorisation*.

**Ce qui se passe :**
1. Le bot envoie un **lien web personnel** (valide environ **20 minutes**).
2. L’employé ouvre le lien sur son téléphone.
3. Il remplit le formulaire (identité pré-remplie).
4. Il coche la **certification** d’exactitude et envoie.
5. Confirmation WhatsApp ; la demande apparaît côté RH pour validation.

**Catégories proposées sur le formulaire employé (4 choix) :**
- Événement familial
- Maladie
- Formation
- Autre

**Champs principaux :** dates début/fin, motif détaillé, personne à prévenir (optionnel).

**Après envoi :** suivre l’état avec **5** ; historique avec **7**.

**Formation — points à souligner :**
- Ne pas partager le lien (lien nominatif signé).
- Si le lien expire : renvoyer `12` pour en obtenir un nouveau.

---

### 13 — Début de pause

**Quand l’utiliser :** au moment de quitter le poste pour la **pause déjeuner** (fenêtre habituelle **12h30 – 13h30**, une pause par jour).

**Comment :** `13` ou *début pause*, *je pars en pause*.

**Procédure :** identique à **1** et **2** (lien GPS obligatoire).

**Prérequis :**
- Arrivée **1** déjà enregistrée.
- Départ **2** pas encore fait.

**Rappels automatiques (optionnels) :** le système peut envoyer des messages de rappel vers 12h30 (début pause) et 13h30 (fin pause) — selon configuration entreprise.

**Si pause déjà commencée :** *« Pause déjà démarrée. Merci de pointer votre retour de pause. »* → utiliser **14**.

---

### 14 — Retour de pause

**Quand l’utiliser :** au moment de **reprendre le travail** après la pause.

**Comment :** `14` ou *retour pause*, *fin pause*.

**Procédure :** lien GPS comme pour **13**.

**Prérequis :**
- Arrivée pointée.
- Départ en pause **13** enregistré.
- Départ journée **2** pas encore fait.

**Message type :** heure de retour + durée de pause cumulée.

**Si pause > 60 minutes :** avertissement (pause mesurée réelle conservée ; pour la paie, la déduction est plafonnée à 60 min).

**Si oubli du 14 :** au départ **2**, la pause peut être calculée jusqu’à l’heure de départ (avec mention dans le message).

---

## 4. Parcours journalier recommandé (fiche formation)

```
Matin     →  1  (arrivée + GPS)
Midi      →  13 (départ pause + GPS)
Après-midi→  14 (retour pause + GPS)
Soir      →  2  (départ + GPS)
            →  si heures sup : répondre au motif en texte libre
```

**Contrôles utiles :** `3` en cours de journée ; `4` ou `10` en fin de semaine.

**Administratif :** `12` pour une absence à venir ; `5` pour suivre ; `11` pour comprendre les absences « pointage ».

---

## 5. Erreurs fréquentes (FAQ formation)

| Problème | Cause probable | Solution |
|----------|----------------|----------|
| « Numéro non lié » | WhatsApp pas enregistré en RH | Contacter les RH |
| « Zone de travail » | Trop loin du site GPS | Se rapprocher du site, réessayer le lien |
| J’ai envoyé ma position WhatsApp | Méthode non acceptée | Toujours passer par le **lien** |
| « Arrivée non pointée » avant 13/14/2 | Pas de `1` aujourd’hui | Envoyer `1` d’abord |
| Le `2` ne part pas / pas d’heures sup | Départ auto ou déjà parti | Lire `3` ; contacter RH si besoin |
| Le bot ne réagit pas au `5` après un départ avec heures sup | Il attend le **motif** OT | Envoyer une phrase de motif, puis réessayer le menu |
| Lien formulaire (12) expiré | > ~20 min | Renvoyer `12` |

---

## 6. Mots-clés alternatifs (sans numéro)

| Action | Exemples de texte acceptés |
|--------|----------------------------|
| Menu | aide, help, menu, commandes, ? |
| Arrivée | arrivé, présent, check-in |
| Départ | départ, je pars, checkout |
| Statut | statut, status |
| Pointages mois | mes pointages, mon historique |
| Autorisations | mes autorisations d'absence |
| Heures sup | mes heures sup |
| Heures sup attente | heures sup en attente |
| Missions | mes missions |
| Semaine | résumé semaine, ma semaine |
| Absences pointage | mes absences |
| Autorisation (formulaire) | demander une autorisation |
| Pause début | début pause, je pars en pause |
| Pause fin | retour pause, fin pause |
| Détail jour | détail jour 15/03 |

---

## 7. Annexe — Numéro 15 (mission)

Hors périmètre « 1 à 14 » mais présent dans le menu complet :

| **15** | **Demande de mission** |
|--------|-------------------------|
| Effet | Envoi d’un lien formulaire *ordre de mission* (~20 min de validité) |
| Après envoi | Traitement RH dans le module Missions ; notification possible aux numéros RH configurés |
| Suivi | **7** (historique) |

Commande : `15` ou *demander une mission*, *ordre de mission*.

---

## 8. Support

- **Technique pointage / WhatsApp :** service RH ou référent outil.
- **Validation autorisations, missions, heures sup :** RH / manager via le tableau de bord Pointage RH.

---

*Document pour la formation interne — aligné sur le comportement de l’application.*
