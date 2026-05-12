# Modèle — Demande d’autorisation d’absence / congés

Ce fichier décrit les champs portés **dans Pointage RH** (formulaire employé envoyé depuis WhatsApp + saisie RH). Il sert de référence pour l’édition RH et pour l’export PDF/DOCX.

## Données employé (issue de la fiche — lecture seule sur le formulaire)

| Champ        | Description          |
|-------------|----------------------|
| Structure   | SCPB ou AFREXIA      |
| Nom, Prénom | Identité             |
| Matricule   | Identifiant interne |
| Service     | Direction / service |

## Données saisies par l’employé (ou complétées par RH)

| Champ                               | Obligatoire | Description                                           |
|------------------------------------|-------------|-------------------------------------------------------|
| Type de demande                   | oui        | Liste : courte durée, congés annuels, RTT, formation… |
| Date de début                      | oui        | Date                                                  |
| Date de fin                        | oui        | Date (≥ début)                                        |
| Motif détaillé                     | oui        | Texte                                                 |
| Personne/service à prévenir        | non        | Remplacement, contact joignable…                      |

## Certification

Une case oblige à **certifier l’exactitude** des informations avant envoi depuis le lien WhatsApp.

## Traitement RH

- Les demandes envoyées depuis le lien apparaissent dans **Autorisations d’absence** avec origine « Formulaire (lien WhatsApp) ».
- La RH peut **approuver** ou **refuser** ; l’employé reçoit une notification WhatsApp.
- **Télécharger** : depuis le détail de la demande — export **PDF** (aperçu imprimable) ou **DOCX**.

## Technique

Lien courte durée (~20 min) query `t=` signée par `LEAVE_REQUEST_FORM_SECRET` ; URL publique de l’app : `NEXT_PUBLIC_APP_URL`.
