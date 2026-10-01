# El Garage — Guide de test API (Postman)

Référence de toutes les routes actuellement implémentées, dans l'ordre du flow complet : **Register Admin → Owner approuve → Login → Invitation Mechanic → Customer/Vehicle → Work Order → Diagnosis → Tasks**.

## 0. Prérequis / correctifs avant de commencer

- **Lance l'API** : `npm run start:dev` (dans `backend/`), avec PostgreSQL démarré et `.env` rempli.
- **⚠️ Base URL** : `main.ts` a `app.setGlobalPrefix('api')` → toutes les routes commencent par `/api`. Le fichier `postman/El-Garage.postman_environment.json` a `baseUrl = http://localhost:3000` **sans** `/api` → à corriger en `http://localhost:3000/api`, sinon tu auras des 404 partout.
- **La collection Postman existante** (`postman/El-Garage.postman_collection.json`) couvre déjà Auth → Customers → Vehicles → Work Orders → Diagnosis → Tasks. Elle ne couvre **pas** l'Owner Console (approve/reject/...) ni les Invitations — ce guide comble ces deux trous en plus de tout redonner en détail.
- **Aucun compte OWNER n'existe** : l'Owner est "seedé", pas créé via signup public, et il n'y a pas encore de script de seed dans le projet. Pour tester les routes Owner, crée-le toi-même en base :
  ```bash
  npx prisma studio
  ```
  Dans la table `User`, crée une ligne : `role = OWNER`, `garageId = null`, `email`/`name` au choix, et un `passwordHash` bcrypt valide. Pour générer ce hash rapidement :
  ```bash
  node -e "console.log(require('bcrypt').hashSync('27504389', 10))"
  ```
  Colle le résultat dans `passwordHash`, puis connecte-toi normalement via `POST /auth/login`.
- **Validation stricte** : `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` → tout champ envoyé qui n'existe pas dans le DTO fait échouer la requête (400). Ne mets que les champs listés ci-dessous.
- Pour chaque route protégée : header `Authorization: Bearer <token>`. Ci-dessous j'utilise des noms de variables Postman suggérés (`{{tokenOwner}}`, `{{tokenAdmin}}`, `{{tokenMechanic}}`, ...) — crée-les dans ton environnement au fur et à mesure que tu récupères les tokens.
- Toutes les requêtes avec body : `Content-Type: application/json`, body type **raw / JSON**.

---

## 1. Auth & Inscription Garage

### 1.1 — Inscrire un Garage + son Admin (public)
```
POST {{baseUrl}}/garages/register
```
```json
{
  "garageName": "Atelier Ben Ali",
  "garagePhone": "71234567",
  "garageAddress": "12 Rue de Carthage, Tunis",
  "adminName": "Ahmed Ben Ali",
  "adminEmail": "ahmed@atelier.tn",
  "adminPassword": "motdepasse123"
}
```
`garagePhone`/`garageAddress` optionnels. `adminPassword` min. 8 caractères. Ne renvoie **pas** de token — il faut se logger juste après. Le Garage naît en `PENDING_APPROVAL`.

### 1.2 — Login (n'importe quel rôle)
```
POST {{baseUrl}}/auth/login
```
```json
{
  "email": "ahmed@atelier.tn",
  "password": "motdepasse123"
}
```
Réponse : `{ accessToken, user, garageStatus }`. Le login **réussit même si le Garage est PENDING_APPROVAL** (seul l'affichage frontend en tiendrait compte — aucune route backend ne bloque encore sur le statut du garage). Récupère `accessToken` → `{{tokenAdmin}}`, et `user.garageId` → `{{garageId}}`.

### 1.3 — Vérifier le token
```
GET {{baseUrl}}/auth/me
Authorization: Bearer {{tokenAdmin}}
```
Renvoie `{ id, garageId, role }` tel qu'extrait du JWT — sert juste à vérifier que le token fonctionne.

---

## 2. Owner Console (absent de la collection existante)

Toutes ces routes exigent `role = OWNER` (`{{tokenOwner}}`, voir section 0).

### 2.1 — Lister tous les garages
```
GET {{baseUrl}}/garages
Authorization: Bearer {{tokenOwner}}
```

### 2.2 — Voir un garage précis
```
GET {{baseUrl}}/garages/{{garageId}}
Authorization: Bearer <token de l'ADMIN/MECHANIC/FRONT_DESK de CE garage>
```
⚠️ Ce n'est **pas** une route Owner : elle utilise `GarageScopeGuard`, qui compare `garageId` du token à l'`:id` de l'URL. Un OWNER a toujours `garageId = null`, donc **il ne passera jamais ce guard** (comportement voulu). Utilise le token de l'Admin du garage, pas celui de l'Owner.

### 2.3 — Approuver le garage
```
PATCH {{baseUrl}}/garages/{{garageId}}/approve
Authorization: Bearer {{tokenOwner}}
```
Pas de body. Passe `status` à `ACTIVE`.

### 2.4 — Rejeter
```
PATCH {{baseUrl}}/garages/{{garageId}}/reject
Authorization: Bearer {{tokenOwner}}
```

### 2.5 — Suspendre / Réactiver
```
PATCH {{baseUrl}}/garages/{{garageId}}/suspend
PATCH {{baseUrl}}/garages/{{garageId}}/reactivate
Authorization: Bearer {{tokenOwner}}
```
`reactivate` échoue (400) si le garage n'est pas actuellement `SUSPENDED`.

---

## 3. Invitations (absent de la collection existante)

### 3.1 — Inviter un Mechanic ou Front Desk (ADMIN uniquement)
```
POST {{baseUrl}}/invitations
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "email": "mohamed@atelier.tn",
  "name": "Mohamed",
  "role": "MECHANIC"
}
```
`role` doit être `MECHANIC` ou `FRONT_DESK` (jamais `ADMIN`/`OWNER`). `garageId` est déduit du token, jamais fourni. Si `SMTP_HOST` est vide dans `.env`, l'email n'est pas réellement envoyé — le lien/token est juste loggé dans la console du serveur : va le récupérer là.

### 3.2 — Lister les invitations du garage (ADMIN)
```
GET {{baseUrl}}/invitations
Authorization: Bearer {{tokenAdmin}}
```

### 3.3 — Révoquer une invitation (ADMIN)
```
PATCH {{baseUrl}}/invitations/{{invitationId}}/revoke
Authorization: Bearer {{tokenAdmin}}
```

### 3.4 — Prévisualiser une invitation par token (public, pas de JWT)
```
GET {{baseUrl}}/invitations/by-token/{{invitationToken}}
```
`{{invitationToken}}` = celui récupéré dans les logs serveur (3.1).

### 3.5 — Accepter l'invitation (public, pas de JWT)
```
POST {{baseUrl}}/invitations/by-token/{{invitationToken}}/accept
```
```json
{
  "password": "motdepasse123"
}
```
Crée le compte Mechanic/Front Desk. Connecte-toi ensuite via `POST /auth/login` avec l'email invité → `{{tokenMechanic}}`.

---

## 4. Customers (ADMIN + FRONT_DESK pour create/update ; tous en lecture)

### 4.1 — Créer un client
```
POST {{baseUrl}}/customers
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "name": "Sami Trabelsi",
  "phone": "98765432",
  "email": "sami@example.com",
  "address": "Rue de la Liberté, Tunis"
}
```
Seul `name` est obligatoire.

### 4.2 — Lister les clients du garage
```
GET {{baseUrl}}/customers
Authorization: Bearer {{tokenAdmin}}
```

### 4.3 — Voir un client (avec ses véhicules)
```
GET {{baseUrl}}/customers/{{customerId}}
Authorization: Bearer {{tokenAdmin}}
```

### 4.4 — Modifier un client
```
PATCH {{baseUrl}}/customers/{{customerId}}
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "phone": "98765433"
}
```
Tous les champs optionnels (envoie juste ce qui change).

---

## 5. Vehicles (ADMIN + FRONT_DESK + MECHANIC pour create/update ; delete = ADMIN seul, pas encore de route DELETE de toute façon)

### 5.1 — Créer un véhicule
```
POST {{baseUrl}}/vehicles
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "customerId": "{{customerId}}",
  "make": "BMW",
  "model": "320i",
  "year": 2018,
  "plate": "123 TU 4567",
  "vin": "WBA8E9C50GK123456",
  "mileage": 142500,
  "fuelType": "DIESEL",
  "engineSize": "2.0",
  "transmission": "AUTOMATIC"
}
```
Obligatoires : `customerId`, `make`, `model`, `plate`. `fuelType` ∈ `PETROL|DIESEL|HYBRID|ELECTRIC|OTHER`, `transmission` ∈ `MANUAL|AUTOMATIC`. Le `customerId` doit correspondre à un client déjà créé (étape 4.1).

### 5.2 — Lister les véhicules du garage
```
GET {{baseUrl}}/vehicles
Authorization: Bearer {{tokenAdmin}}
```

### 5.3 — Voir un véhicule
```
GET {{baseUrl}}/vehicles/{{vehicleId}}
Authorization: Bearer {{tokenAdmin}}
```

### 5.4 — Modifier un véhicule (ex. kilométrage)
```
PATCH {{baseUrl}}/vehicles/{{vehicleId}}
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "mileage": 143200
}
```
⚠️ Règle métier : un **MECHANIC ne peut modifier que les véhicules qu'il a lui-même créés** (`createdById`). Teste ce cas avec `{{tokenMechanic}}` sur un véhicule créé par un autre user → doit renvoyer 403.

---

## 6. Work Orders (le ticket)

### 6.1 — Ouvrir un ticket
```
POST {{baseUrl}}/work-orders
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "vehicleId": "{{vehicleId}}",
  "problemReported": "Le moteur vibre en accélérant",
  "mileage": 143200,
  "priority": "HIGH"
}
```
Obligatoire : `vehicleId`, `problemReported`. `priority` ∈ `LOW|MEDIUM|HIGH|URGENT` (défaut si omis). `customerId` n'est **jamais** envoyé — dérivé automatiquement de `vehicle.customerId`.

### 6.2 — Lister les tickets du garage
```
GET {{baseUrl}}/work-orders
Authorization: Bearer {{tokenAdmin}}
```

### 6.3 — Voir un ticket (détail + timeline)
```
GET {{baseUrl}}/work-orders/{{workOrderId}}
Authorization: Bearer {{tokenAdmin}}
```
Inclut `activityEvents` (timeline triée), vehicle/customer/createdBy/assignedMechanic, diagnosis, et les compteurs tasks/parts/photos/notes.

### 6.4 — Modifier le contenu du ticket
```
PATCH {{baseUrl}}/work-orders/{{workOrderId}}
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "problemReported": "Le moteur vibre fortement en accélérant, bruit métallique",
  "priority": "URGENT"
}
```

### 6.5 — Changer le statut du ticket
```
PATCH {{baseUrl}}/work-orders/{{workOrderId}}/status
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "status": "DIAGNOSIS"
}
```
`status` ∈ `RECEIVED|DIAGNOSIS|WAITING_FOR_PARTS|REPAIR|QUALITY_CHECK|COMPLETED`. Génère un `ActivityEvent` de catégorie `SENSITIVE`.

### 6.6 — Assigner le ticket à un mécanicien (ADMIN + FRONT_DESK seulement)
```
PATCH {{baseUrl}}/work-orders/{{workOrderId}}/assign
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "assignedMechanicId": "{{mechanicUserId}}"
}
```
Le service vérifie que la cible est bien un `MECHANIC` du même garage. `{{mechanicUserId}}` = `user.id` récupéré via `GET /auth/me` avec `{{tokenMechanic}}`.

---

## 7. Diagnosis (sous-ressource d'un Work Order)

### 7.1 — Voir le diagnostic
```
GET {{baseUrl}}/work-orders/{{workOrderId}}/diagnosis
Authorization: Bearer {{tokenAdmin}}
```
Renvoie `null` tant qu'aucun diagnostic n'a été commencé (pas une 404, c'est un état normal).

### 7.2 — Démarrer / mettre à jour le diagnostic (upsert)
```
PUT {{baseUrl}}/work-orders/{{workOrderId}}/diagnosis
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "customerComplaint": "Le moteur vibre à l'accélération",
  "findings": "Valeurs anormales sur l'injecteur #3",
  "diagnosis": "Injecteur #3 défectueux",
  "recommendation": "Remplacer l'injecteur #3"
}
```
Tous les champs optionnels — remplissage progressif au fil de l'examen. Premier appel → `ActivityEvent` `DIAGNOSIS_STARTED`, suivants → `DIAGNOSIS_UPDATED`.

### 7.3 — Ajouter un symptôme
```
POST {{baseUrl}}/work-orders/{{workOrderId}}/diagnosis/symptoms
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "label": "Vibration du moteur"
}
```
⚠️ Nécessite qu'un Diagnosis existe déjà (fais 7.2 d'abord), sinon 404 explicite.

### 7.4 — Cocher un symptôme
```
PATCH {{baseUrl}}/work-orders/{{workOrderId}}/diagnosis/symptoms/{{symptomId}}
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "checked": true
}
```
`label` aussi modifiable en option.

### 7.5 — Ajouter un test de diagnostic
```
POST {{baseUrl}}/work-orders/{{workOrderId}}/diagnosis/tests
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "label": "Scan OBD"
}
```

### 7.6 — Marquer un test comme effectué
```
PATCH {{baseUrl}}/work-orders/{{workOrderId}}/diagnosis/tests/{{testId}}
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "performed": true
}
```

---

## 8. Tasks (sous-ressource d'un Work Order)

### 8.1 — Ajouter une tâche
```
POST {{baseUrl}}/work-orders/{{workOrderId}}/tasks
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "label": "Retirer l'injecteur",
  "assignedMechanicId": "{{mechanicUserId}}",
  "priority": "HIGH",
  "estimatedMinutes": 45,
  "notes": "Attention au joint",
  "order": 1
}
```
Seul `label` est obligatoire — naît toujours `TODO`. Si `assignedMechanicId` fourni, doit être un `MECHANIC` du même garage.

### 8.2 — Lister les tâches du ticket
```
GET {{baseUrl}}/work-orders/{{workOrderId}}/tasks
Authorization: Bearer {{tokenAdmin}}
```

### 8.3 — Faire avancer une tâche
```
PATCH {{baseUrl}}/work-orders/{{workOrderId}}/tasks/{{taskId}}
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "status": "IN_PROGRESS",
  "actualMinutes": 20
}
```
`status` ∈ `TODO|IN_PROGRESS|DONE`.

### 8.4 — Terminer une tâche
```json
{
  "status": "DONE",
  "actualMinutes": 50
}
```
(même route que 8.3)

### 8.5 — Supprimer une tâche
```
DELETE {{baseUrl}}/work-orders/{{workOrderId}}/tasks/{{taskId}}
Authorization: Bearer {{tokenAdmin}}
```

## 9. Parts (sous-ressource d'un Work Order)

### 9.1 — Ajouter une pièce
```
POST {{baseUrl}}/work-orders/{{workOrderId}}/parts
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "name": "Injecteur #3",
  "quantity": 1,
  "unit": "unite",
  "unitPrice": 480
}
```
Seuls `name` et `unitPrice` sont obligatoires — naît toujours `AVAILABLE`. `quantity`/`unitPrice` acceptent 2 décimales max.

### 9.2 — Lister les pièces du ticket
```
GET {{baseUrl}}/work-orders/{{workOrderId}}/parts
Authorization: Bearer {{tokenAdmin}}
```

### 9.3 — Faire avancer le statut d'une pièce
```
PATCH {{baseUrl}}/work-orders/{{workOrderId}}/parts/{{partId}}
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "status": "ORDERED"
}
```
`status` ∈ `AVAILABLE|ORDERED|RECEIVED|USED` — c'est ce champ qui permet de détecter "réparation bloquée en attente de pièce" (Section 14 de la spec).

### 9.4 — Supprimer une pièce
```
DELETE {{baseUrl}}/work-orders/{{workOrderId}}/parts/{{partId}}
Authorization: Bearer {{tokenAdmin}}
```

---

## 10. Photos (sous-ressource d'un Work Order)

### 10.1 — Ajouter une photo
```
POST {{baseUrl}}/work-orders/{{workOrderId}}/photos
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "url": "https://storage.example.com/before.jpg",
  "caption": "Injecteur endommagé",
  "stage": "BEFORE"
}
```
Seul `url` est obligatoire. `stage` ∈ `BEFORE|AFTER`, optionnel — toutes les photos ne rentrent pas forcément dans ce schéma avant/après. `uploadedById` est déduit automatiquement de ton token, pas besoin de le fournir. Ce endpoint ne reçoit jamais de binaire, juste une référence vers un fichier stocké ailleurs (S3, Cloudinary...).

### 10.2 — Lister les photos du ticket
```
GET {{baseUrl}}/work-orders/{{workOrderId}}/photos
Authorization: Bearer {{tokenAdmin}}
```

### 10.3 — Supprimer une photo
```
DELETE {{baseUrl}}/work-orders/{{workOrderId}}/photos/{{photoId}}
Authorization: Bearer {{tokenAdmin}}
```
Pas de route PATCH : une photo est immuable une fois postée (voir photo.prisma) — seule la suppression est permise pour corriger un upload par erreur.

---

## 11. Notes (sous-ressource d'un Work Order)

### 11.1 — Ajouter une note
```
POST {{baseUrl}}/work-orders/{{workOrderId}}/notes
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "content": "Injector #3 values are abnormal."
}
```

### 11.2 — Lister les notes du ticket
```
GET {{baseUrl}}/work-orders/{{workOrderId}}/notes
Authorization: Bearer {{tokenAdmin}}
```

### 11.3 — Supprimer une note
```
DELETE {{baseUrl}}/work-orders/{{workOrderId}}/notes/{{noteId}}
Authorization: Bearer {{tokenAdmin}}
```
Pas de route PATCH : une Note est append-only (voir note.prisma) — une correction s'exprime en ajoutant une nouvelle Note, jamais en réécrivant une entrée existante.

## 12. Invoice & Payments (Section 30 — ADMIN + FRONT_DESK uniquement, aucun accès MECHANIC)

### 12.1 — Créer la facture du ticket (naît toujours DRAFT)
```
POST {{baseUrl}}/work-orders/{{workOrderId}}/invoice
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "laborPrice": 200,
  "dueDate": "2026-10-01"
}
```
`partsTotal` n'est jamais envoyé ici : il est calculé automatiquement en sommant les Parts existantes du ticket (`quantity × unitPrice`). Un seul appel possible par ticket (relation 1-1) — un deuxième POST renvoie 409 Conflict.

### 12.2 — Voir la facture (+ ses paiements)
```
GET {{baseUrl}}/work-orders/{{workOrderId}}/invoice
Authorization: Bearer {{tokenAdmin}}
```
Renvoie `null` si aucune facture n'a encore été créée pour ce ticket (pas une 404).

### 12.3 — Modifier le prix (avant ou après émission)
```
PATCH {{baseUrl}}/work-orders/{{workOrderId}}/invoice
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "laborPrice": 250,
  "partsTotal": 630
}
```
Reste possible même après paiement (Section 30bis : visible et tracé, pas bloqué pour le MVP) — un `ActivityEvent` SENSITIVE avec `afterPayment: true` est alors journalisé. Rejeté (400) si la facture est déjà `CANCELLED`.

### 12.4 — Émettre la facture (DRAFT → ISSUED)
```
POST {{baseUrl}}/work-orders/{{workOrderId}}/invoice/issue
Authorization: Bearer {{tokenAdmin}}
```
Fixe `issuedById`/`issuedAt`. Rejeté (400) si la facture n'est pas en `DRAFT`.

### 12.5 — Annuler la facture (DRAFT/ISSUED → CANCELLED)
```
POST {{baseUrl}}/work-orders/{{workOrderId}}/invoice/cancel
Authorization: Bearer {{tokenAdmin}}
```
Rejeté (400) si un paiement a déjà été enregistré (`PARTIALLY_PAID`/`PAID`).

### 12.6 — Enregistrer un paiement
```
POST {{baseUrl}}/work-orders/{{workOrderId}}/invoice/payments
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "amount": 400,
  "method": "CASH"
}
```
`method` ∈ `CASH|CARD|TRANSFER|OTHER`. Nécessite une facture `ISSUED` ou `PARTIALLY_PAID` (400 sinon). Le montant ne peut pas dépasser le solde restant dû (400 sinon). Fait automatiquement passer `Invoice.status` à `PARTIALLY_PAID` ou `PAID` selon le cumul des paiements.

### 12.7 — Lister les paiements du ticket
```
GET {{baseUrl}}/work-orders/{{workOrderId}}/invoice/payments
Authorization: Bearer {{tokenAdmin}}
```
Pas de route PATCH/DELETE sur un Payment : un fait financier ne se modifie/supprime jamais une fois enregistré.

## 13. Reservations (Section 33 — calendrier, PAS imbriqué sous /work-orders)

> ⚠️ Nécessite d'avoir lancé `npx prisma migrate dev` après le dernier pull : `assignedMechanicId` et `durationMinutes` ont été ajoutés à `reservation.prisma` pour couvrir l'exemple de calendrier de la spec (mécanicien pré-assigné + durée du créneau).

### 13.1 — Créer une réservation (naît toujours PENDING)
```
POST {{baseUrl}}/reservations
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "customerId": "{{customerId}}",
  "vehicleId": "{{vehicleId}}",
  "scheduledAt": "2026-09-22T08:00:00Z",
  "reason": "Vidange",
  "assignedMechanicId": "{{mechanicUserId}}",
  "durationMinutes": 45
}
```
Seuls `customerId`, `scheduledAt` et `reason` sont obligatoires — `vehicleId` reste optionnel (un nouveau contact n'a pas forcément de véhicule connu au moment de l'appel).

### 13.2 — Lister les réservations
```
GET {{baseUrl}}/reservations
Authorization: Bearer {{tokenAdmin}}
```
Avec `{{tokenMechanic}}`, la liste ne contient QUE les réservations où il est `assignedMechanicId` (Section 33 : "view only, ses rendez-vous assignés").

### 13.3 — Voir une réservation précise
```
GET {{baseUrl}}/reservations/{{reservationId}}
Authorization: Bearer {{tokenAdmin}}
```
Avec `{{tokenMechanic}}` sur une réservation qui n'est pas la sienne : 403.

### 13.4 — Modifier une réservation (avant conversion)
```
PATCH {{baseUrl}}/reservations/{{reservationId}}
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "scheduledAt": "2026-09-22T09:00:00Z",
  "assignedMechanicId": "{{mechanicUserId}}"
}
```
`customerId` n'est pas modifiable (figé à la création). Rejeté (400) si la réservation est déjà `CONVERTED`/`CANCELLED`/`NO_SHOW`.

### 13.5 — Confirmer / annuler / marquer no-show
```
PATCH {{baseUrl}}/reservations/{{reservationId}}/status
Authorization: Bearer {{tokenAdmin}}
```
```json
{ "status": "CONFIRMED" }
```
`status` ∈ `CONFIRMED|CANCELLED|NO_SHOW` uniquement — `CONVERTED` n'est jamais accepté ici, voir 13.6. Rejeté (400) si la réservation est déjà dans un état final.

### 13.6 — Convertir en Work Order (le client se présente)
```
POST {{baseUrl}}/reservations/{{reservationId}}/convert
Authorization: Bearer {{tokenAdmin}}
```
```json
{
  "mileage": 45000
}
```
`vehicleId` n'est requis dans le body QUE si la réservation n'en avait pas déjà un. Crée un vrai `WorkOrder` (préremplis avec le véhicule/motif de la réservation, mécanicien pré-assigné repris s'il y en avait un), passe la réservation à `CONVERTED` et fixe `convertedWorkOrderId` — les deux dans la même transaction. Rejeté (400) si la réservation n'est pas `PENDING`/`CONFIRMED`, ou si aucun véhicule n'est disponible.

---

## Rappel des règles d'ownership Mécanicien (à tester volontairement)

Ces règles sont appliquées **au niveau service**, pas seulement par les rôles — teste-les explicitement avec `{{tokenMechanic}}` :
- Un Mechanic ne peut **modifier** (`PATCH`) que les Vehicles/Work Orders qu'il a lui-même créés (`createdById`) — même règle pour la Diagnosis et les Tasks du ticket (héritée du Work Order parent).
- Un Mechanic peut créer un Vehicle et travailler dessus, mais ne peut pas modifier celui d'un collègue.
- La même règle d'ownership (créateur du ticket) s'applique à l'ajout de Parts, Photos et Notes sur un Work Order — un Mechanic qui n'a pas créé le ticket doit recevoir un 403 sur ces trois sous-ressources aussi.
- `Invoice`/`Payment` échappent totalement à cette logique : ce n'est pas une question d'ownership mais de rôle — un `{{tokenMechanic}}` doit recevoir un 403 sur TOUTES les routes `/invoice` (même sur un ticket qu'il a lui-même créé), Admin et Front Desk y ayant les mêmes droits sur tous les tickets du garage.
- `Reservation` a sa propre règle, différente des deux précédentes : ce n'est ni de l'ownership (créateur du ticket) ni un blocage total par rôle — un Mechanic PEUT lire (`GET`), mais seulement les réservations où il est `assignedMechanicId` ; toute écriture (`POST`/`PATCH`/`convert`) lui est fermée quel que soit le rendez-vous.
- `assign` sur un Work Order est réservé à ADMIN/FRONT_DESK — un Mechanic qui essaie doit recevoir un 403.
- `Customer` create/update est réservé à ADMIN/FRONT_DESK — un Mechanic qui essaie doit recevoir un 403.
