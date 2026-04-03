# MidMeet — Frontend–Backend Integration Guide

> **Audience:** Backend developers implementing Lambda handlers and CDK infrastructure.
> **Last updated:** 2026-03-28
> **Related files:** `README.md`, `FRONTEND_PROGRESS.md`, `backend/cdk/lib/DynamoDB_Tables.md`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Integration Flow & Setup](#2-integration-flow--setup)
3. [Authentication — Cognito & JWT](#3-authentication--cognito--jwt)
4. [API Design — Full Endpoint Specification](#4-api-design--full-endpoint-specification)
   - 4.1 Users
   - 4.2 Friends / Friendships
   - 4.3 Events
   - 4.4 Event Members (Availability & Attendance)
   - 4.5 Venues
5. [Lambda Implementation Guide](#5-lambda-implementation-guide)
6. [Conflicts & Resolution Plan](#6-conflicts--resolution-plan)
7. [DynamoDB Access Patterns Summary](#7-dynamodb-access-patterns-summary)
8. [CDK Infrastructure Changes Required](#8-cdk-infrastructure-changes-required)

---

## 1. Architecture Overview

```
Browser (React + Amplify v6)
        │
        │  HTTPS + Cognito ID Token
        ▼
API Gateway REST API  (/prod or /dev stage)
        │
        │  Lambda Proxy Integration
        ▼
Lambda  index.js  (Node.js 20.x — single function router)
        │
        ├──► DynamoDB  midmeet-{stage}-users
        ├──► DynamoDB  midmeet-{stage}-friendships
        ├──► DynamoDB  midmeet-{stage}-events
        └──► DynamoDB  midmeet-{stage}-event-members
```

**Current state:** the Lambda and API Gateway exist but only expose `GET /events` with a broken implementation. This document specifies everything that needs to be built.

---

## 2. Integration Flow & Setup

### 2.1 One-time Infrastructure Deployment

```bash
# 1. Bootstrap CDK in your AWS account/region (only once per account)
cd backend/cdk
npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION>

# 2. Deploy the dev stack
npx cdk deploy -c stage=dev

# 3. Note the outputs printed by CDK:
#    UserPoolId        → VITE_USER_POOL_ID
#    UserPoolClientId  → VITE_USER_POOL_CLIENT_ID
#    ApiUrl            → VITE_API_URL
```

### 2.2 Frontend Environment Configuration

Create `frontend/.env.local` (not committed to git):

```env
VITE_USER_POOL_ID=ap-southeast-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_API_URL=https://xxxxxxxxxx.execute-api.ap-southeast-1.amazonaws.com/prod
```

The frontend reads these via `import.meta.env.VITE_*` in `frontend/src/main.tsx`.

### 2.3 Frontend API Layer — Where to Wire In

All mock functions are in `frontend/src/api/Event.tsx` and `frontend/src/api/eventService.ts`.
When the real API is ready, replace mock functions one by one with real `fetch` / Amplify API calls.
The function signatures must remain identical — only the implementation changes.

| Mock function | File | Replacement action |
|---|---|---|
| `createFullEvent` | `Event.tsx` | `POST /events` |
| `readEventStore` / `fetchEventById` | `Event.tsx` | `GET /events`, `GET /events/:eventId` |
| `submitAvailability` | `Event.tsx` | `POST /events/:eventId/availability` |
| `selectSlotAndVenue` | `Event.tsx` | `POST /events/:eventId/finalize` |
| `confirmAttendance` | `Event.tsx` | `POST /events/:eventId/confirm` |
| `declineAttendance` | `Event.tsx` | `POST /events/:eventId/decline` |
| `unfinalizeEvent` | `Event.tsx` | `POST /events/:eventId/unfinalize` |
| `fetchSuggestedVenues` | `Event.tsx` | `GET /events/:eventId/venues` |
| `fetchFriends` | `eventService.ts` | `GET /friends` |
| `fetchNotifications` | `eventService.ts` | `GET /notifications` |
| `fetchDashboardData` | `eventService.ts` | `GET /dashboard` |

---

## 3. Authentication — Cognito & JWT

### 3.1 How Amplify Sends the Token

The frontend uses **AWS Amplify v6** configured with the Cognito User Pool. Every authenticated API call must include:

```
Authorization: <Cognito ID Token (JWT)>
```

API Gateway's `CognitoUserPoolsAuthorizer` validates this token automatically before invoking Lambda.

### 3.2 Extracting userId in Lambda

For a **REST API** (which is what `apigateway.RestApi` creates in CDK), the authorizer context arrives in:

```javascript
// REST API (apigateway.RestApi) — correct path
const userId = event.requestContext.authorizer.claims.sub;

// ❌ WRONG — this is for HTTP API (apigateway.HttpApi), not REST API
// const userId = event.requestContext.authorizer.jwt.claims.sub;
```

> **Bug in current `index.js`:** it uses the HTTP API path. Fix to `.authorizer.claims.sub`.

### 3.3 userId = Cognito sub

The `sub` claim from the JWT is the user's `userId` in all DynamoDB tables. This is stable, unique, and does not change. The frontend constant `CURRENT_USER_ID = 'u-current'` must be replaced with the actual Cognito sub.

---

## 4. API Design — Full Endpoint Specification

All routes are mounted under the API Gateway base URL. The Lambda handler must route on both `event.resource` (the path template) and `event.httpMethod`.

**Standard response envelope:**
```json
{
  "data": { ... },
  "error": null
}
```
**Standard error response:**
```json
{
  "data": null,
  "error": { "code": "NOT_FOUND", "message": "Event not found." }
}
```

---

### 4.1 Users

#### `GET /users/me`
Returns the current user's profile.

**Auth:** Required

**DynamoDB:** `GetItem` on `midmeet-{stage}-users`, key `{ userId: <sub> }`

**Response:**
```json
{
  "userId": "cognito-sub-abc",
  "name": "Alice",
  "email": "alice@example.com",
  "approxArea": "Jurong East",
  "exactAddress": "123 Jurong East Street 21, Singapore",
  "transportType": "MRT",
  "personality": ["introvert", "planner"],
  "preferences": {
    "sports": ["badminton"],
    "foodTypes": ["japanese"],
    "gatheringTypes": ["study", "meal"],
    "venuePreferences": ["cafe", "library"],
    "timePreferences": ["weekday_evening"]
  },
  "createdAt": "2026-03-28T12:00:00Z",
  "updatedAt": "2026-03-28T12:00:00Z"
}
```

---

#### `PUT /users/me`
Create or update the current user's profile. Call this after Cognito sign-up to persist the user record.

**Auth:** Required

**Request body:**
```json
{
  "name": "Alice",
  "approxArea": "Jurong East",
  "transportType": "MRT",
  "personality": ["introvert"],
  "preferences": {
    "foodTypes": ["japanese"],
    "venuePreferences": ["cafe"]
  }
}
```

**DynamoDB:** `PutItem` / `UpdateItem` on `midmeet-{stage}-users`.
Set `userId` from JWT `sub`, `email` from JWT `email` claim, `updatedAt` = now. Set `createdAt` only if not already set.

---

#### `GET /users/:userId`
Fetch another user's public profile (for display in events, friend lists).

**Auth:** Required

**DynamoDB:** `GetItem` on `midmeet-{stage}-users`, key `{ userId }`

**Note:** Do **not** return `exactAddress` in this endpoint. Return only `approxArea`.

---

### 4.2 Friends / Friendships

#### `GET /friends`
Returns the current user's confirmed friends.

**Auth:** Required

**DynamoDB:** `Query` on `midmeet-{stage}-friendships`:
```
KeyConditionExpression: "userId = :uid"
FilterExpression: "#s = :accepted"
ExpressionAttributeNames: { "#s": "status" }
ExpressionAttributeValues: { ":uid": userId, ":accepted": "ACCEPTED" }
```

For each result, fetch the friend's profile via `GetItem` on Users table using `friendId`.

**Response:**
```json
[
  {
    "userId": "u-bob",
    "name": "Bob",
    "approxArea": "Bishan",
    "interests": ["Hiking", "Photography"]
  }
]
```

> **Frontend note:** The frontend `FriendProfile` type has an `interests` field (string array). Map this from `preferences.sports + preferences.gatheringTypes` concatenated, or add a dedicated `interests` list to the Users table (see Section 6, Conflict #4).

---

#### `GET /friends/{userId}`
Returns the user's friend graph snapshot:
- `friends` (accepted)
- `incomingRequests` (pending and requested by others)
- `outgoingRequests` (pending and requested by self)

**Auth:** Required

**Notes:**
- The authenticated user can only access their own `userId`.
- Friend profile fields are hydrated from user profiles when available.

---

#### `GET /friends/suggestions/{userId}`
Returns ranked suggestions by interest overlap.

**Auth:** Required

**Behavior detail:** if the current user profile is missing, backend returns:
```json
{ "userId": "<id>", "suggestions": [] }
```
instead of 404.

---

#### `POST /friends/request`
Send a friend request by `targetUserId`.

**Auth:** Required

**Request body:** `{ "targetUserId": "u-bob" }`

**DynamoDB steps:**
1. Check whether relationship record already exists (`ACCEPTED`/`PENDING` conflict checks).
2. `PutItem` A→B friendship record with `status: "PENDING"`, `requestedBy: userId`.
3. `PutItem` B→A mirrored record with same `status` and `requestedBy`.

**Current constraint (relaxed send mode):**
- Backend does not hard-require target `PROFILE` existence before writing friendship records.
- As a result, some rows may reference users whose profile fields are incomplete until profile onboarding finishes.

**Error:** If A→B record already exists, return `409 ALREADY_EXISTS`.

---

#### `PUT /friends/accept`
Accept a pending friend request.

**Auth:** Required

**Request body:** `{ "requesterUserId": "u-alice" }`

**DynamoDB:** `UpdateItem` both A→B and B→A records to `status: "ACCEPTED"`.

---

### 4.3 Events

#### `GET /events`
Returns all events the current user is participating in (as creator or member).

**Auth:** Required

**DynamoDB steps:**
1. `Query` on `midmeet-{stage}-event-members` using GSI `userId-createdAt-index`:
   ```
   KeyConditionExpression: "userId = :uid"
   ```
   This returns all `eventId` values the user belongs to.
2. Batch `GetItem` on `midmeet-{stage}-events` for all returned `eventId` values.
3. For each event, also fetch all members from `midmeet-{stage}-event-members` (query by `eventId`).

**Response:** Array of full event objects (see `GET /events/:eventId` schema below).

**Pagination:** Use `LastEvaluatedKey` from DynamoDB for cursor-based pagination. Frontend currently loads all events; add pagination support when dataset grows.

---

#### `POST /events`
Create a new event and invite participants.

**Auth:** Required

**Request body:**
```json
{
  "title": "Badminton Meetup",
  "description": "Let's play at Bishan",
  "venueType": "Sports Hall",
  "dateRange": { "start": "2026-04-10", "end": "2026-04-20" },
  "participantIds": ["u-alice", "u-bob"]
}
```

**DynamoDB steps:**
1. `PutItem` on `midmeet-{stage}-events`:
   ```json
   {
     "eventId": "<uuid>",
     "creatorId": "<sub>",
     "title": "...",
     "description": "...",
     "venueType": "Sports Hall",
     "dateRange": { "start": "2026-04-10", "end": "2026-04-20" },
     "status": "COLLECTING_AVAILABILITY",
     "createdAt": "<ISO 8601>",
     "updatedAt": "<ISO 8601>"
   }
   ```
   > **Note:** `dateRange` is a frontend concept not in the original schema. Add it as a DynamoDB Map attribute on the Events table.

2. `PutItem` on `midmeet-{stage}-event-members` for the creator:
   ```json
   {
     "eventId": "<uuid>", "userId": "<creatorSub>",
     "role": "CREATOR", "inviteStatus": "ACCEPTED",
     "createdAt": "<ISO 8601>", "updatedAt": "<ISO 8601>"
   }
   ```

3. `PutItem` on `midmeet-{stage}-event-members` for each `participantId`:
   ```json
   {
     "eventId": "<uuid>", "userId": "<participantId>",
     "role": "PARTICIPANT", "inviteStatus": "PENDING",
     "createdAt": "<ISO 8601>", "updatedAt": "<ISO 8601>"
   }
   ```

**Response:** Full event object (same as `GET /events/:eventId`).

---

#### `GET /events/:eventId`
Fetch a single event with all derived state.

**Auth:** Required (must be a member of the event)

**DynamoDB steps:**
1. `GetItem` on `midmeet-{stage}-events` by `eventId`
2. `Query` on `midmeet-{stage}-event-members` by `eventId` (all member records)
3. For each member, optionally batch-fetch user names from Users table

**Response (full EventDetail shape):**
```json
{
  "eventId": "evt-001",
  "title": "Badminton Meetup",
  "description": "Let's play at Bishan",
  "status": "COLLECTING_AVAILABILITY",
  "creatorId": "sub-creator",
  "creatorName": "Alice",
  "venueType": "Sports Hall",
  "dateRange": { "start": "2026-04-10", "end": "2026-04-20" },
  "participants": [
    { "userId": "sub-creator", "name": "Alice" },
    { "userId": "sub-bob",     "name": "Bob" }
  ],
  "availabilitySubmittedBy": ["sub-creator"],
  "slotCounts": {
    "2026-04-15-14": 2,
    "2026-04-16-10": 1
  },
  "confirmedUserIds": [],
  "declinedUserIds": [],
  "selectedTime": null,
  "selectedVenue": null,
  "createdAt": "2026-03-28T12:00:00Z",
  "updatedAt": "2026-03-28T12:00:00Z"
}
```

**How to compute derived fields from DynamoDB:**

| Frontend field | Source |
|---|---|
| `availabilitySubmittedBy` | EventMembers records where `availableTimeSlots` is non-empty |
| `slotCounts` | Aggregate all `availableTimeSlots` across members; count how many members listed each slot |
| `confirmedUserIds` | EventMembers records where `inviteStatus = "ACCEPTED"` AND event `status = "AWAITING_CONFIRMATION"` or `"FINALIZED"` |
| `declinedUserIds` | EventMembers records where `inviteStatus = "DECLINED"` |
| `participants` | All EventMembers records for this event (join with Users for names) |

---

#### `DELETE /events/:eventId`
Delete an event (creator only).

**Auth:** Required. Only the creator (`creatorId === sub`) may delete.

**DynamoDB:** `DeleteItem` on `midmeet-{stage}-events`. Optionally also delete all EventMembers records for this event.

---

### 4.4 Event Members (Availability & Attendance)

#### `POST /events/:eventId/availability`
Submit the current user's available time slots.

**Auth:** Required (must be a member of the event)

**Request body:**
```json
{
  "slots": ["2026-04-15-14", "2026-04-15-15", "2026-04-16-10"]
}
```

**Slot format:** `"YYYY-MM-DD-HH"` — the frontend uses this compact key format throughout.
**Backend storage:** convert each slot to ISO 8601 for the `availableTimeSlots` field in EventMembers:
`"2026-04-15-14"` → `"2026-04-15T14:00:00+08:00"`

**DynamoDB steps:**
1. `UpdateItem` on `midmeet-{stage}-event-members` for `{ eventId, userId }`:
   ```
   SET availableTimeSlots = :slots, updatedAt = :now
   ```
2. Check if **all** non-creator members have now submitted. If yes:
   - `UpdateItem` on `midmeet-{stage}-events`: `SET status = "SELECTING_VENUE", updatedAt = :now`

**Response:** Updated event object (same as `GET /events/:eventId`).

---

#### `POST /events/:eventId/finalize`
Creator selects the final time slot and venue. Transitions event to `AWAITING_CONFIRMATION`.

**Auth:** Required. Only the creator may call this.

**Request body:**
```json
{
  "selectedTime": { "date": "2026-04-15", "startHour": 14 },
  "selectedVenue": {
    "venueId": "venue-1",
    "name": "ActiveSG Bishan Sports Hall",
    "address": "513 Bishan St 13, Singapore 570513",
    "rating": 4.5,
    "distanceKm": 1.2,
    "estimatedMinutes": 18
  }
}
```

**DynamoDB:** `UpdateItem` on `midmeet-{stage}-events`:
```
SET selectedTime = :time, selectedVenue = :venue,
    #s = :status, updatedAt = :now
ExpressionAttributeNames: { "#s": "status" }
ExpressionAttributeValues: {
  ":time": "2026-04-15T14:00:00+08:00",
  ":venue": { ... },
  ":status": "AWAITING_CONFIRMATION"
}
```

**Store `selectedTime` as ISO 8601 string** in DynamoDB Events table.

**Response:** Updated event object.

---

#### `POST /events/:eventId/confirm`
Participant confirms attendance.

**Auth:** Required (must be a participant)

**DynamoDB:** `UpdateItem` on `midmeet-{stage}-event-members`:
```
SET inviteStatus = "ACCEPTED", updatedAt = :now
WHERE eventId = :eventId AND userId = :sub
```

Then check if **all** participants have responded (ACCEPTED or DECLINED). If yes, transition event to `FINALIZED`:
```
UpdateItem on events: SET #s = "FINALIZED", updatedAt = :now
```

**Response:** Updated event object.

---

#### `POST /events/:eventId/decline`
Participant declines attendance.

**Auth:** Required (must be a participant)

**DynamoDB:** Same as confirm, but set `inviteStatus = "DECLINED"`.

Check for full-response transition to `FINALIZED` same as above.

**Response:** Updated event object.

---

#### `POST /events/:eventId/unfinalize`
Creator reverts a finalized/confirmed event back to `SELECTING_VENUE`.

**Auth:** Required. Only the creator may call this.

**DynamoDB steps:**
1. `UpdateItem` on `midmeet-{stage}-events`:
   ```
   REMOVE selectedTime, selectedVenue
   SET #s = "SELECTING_VENUE", updatedAt = :now
   ```
2. `UpdateItem` on all EventMembers records for this event: reset `inviteStatus` to `"PENDING"` for all non-creator members.

**Response:** Updated event object.

---

### 4.5 Venues

#### `GET /events/:eventId/venues`
Returns venue suggestions for a given event, based on participants' locations and the event's `venueType`.

**Auth:** Required (must be a member of the event)

**Logic (initial implementation):**
This endpoint integrates with an external place-search API (e.g. Google Places API or OneMap Singapore).
For MVP, return static mock venues filtered by `venueType`.

**DynamoDB:** Read EventMembers to get `departureLocations`. Fetch Users' `approxArea` as fallback.

**Response:**
```json
[
  {
    "venueId": "venue-1",
    "name": "ActiveSG Bishan Sports Hall",
    "address": "513 Bishan St 13, Singapore 570513",
    "rating": 4.5,
    "distanceKm": 1.2,
    "estimatedMinutes": 18
  }
]
```

---

### 4.6 Notifications

#### `GET /notifications`
Returns actionable and informational notifications for the current user.

**Auth:** Required

**Logic:**
1. Query EventMembers GSI `userId-createdAt-index` to get all events the user belongs to
2. For each event:
   - If `status = "SELECTING_VENUE"` and user is creator → `ALL_SUBMITTED` notification
   - If `status = "AWAITING_CONFIRMATION"` and user's `inviteStatus = "PENDING"` → `ATTENDANCE_REQUEST` notification
3. Query Friendships for `status = "PENDING"` and `requestedBy <> userId` → `FRIEND_REQUEST` notifications

**Response:**
```json
[
  {
    "id": "notif-all-submitted-evt-001",
    "title": "All participants submitted availability",
    "detail": "Everyone in \"Badminton Meetup\" has submitted. You can now select a venue.",
    "createdAt": "2026-03-28T12:00:00Z",
    "kind": "ALL_SUBMITTED",
    "eventId": "evt-001"
  }
]
```

---

### 4.7 Dashboard

#### `GET /dashboard`
Returns a combined summary for the home screen.

**Auth:** Required

**Logic:**
1. Run `GET /events` logic to get all events for the user
2. Compute `upcomingEvents`: filter by active participation, sort by date, take top 3
3. Compute `pendingInvites`: events in `COLLECTING_AVAILABILITY` where user hasn't submitted

**Response:**
```json
{
  "upcomingEvents": [
    {
      "eventId": "evt-001",
      "title": "Badminton Meetup",
      "creatorId": "sub-creator",
      "participantIds": ["sub-creator", "sub-bob"],
      "participantNames": ["Alice", "Bob"],
      "venueType": "Sports Hall",
      "selectedTime": "2026-04-15T14:00:00+08:00",
      "selectedVenue": "ActiveSG Bishan Sports Hall",
      "status": "FINALIZED"
    }
  ],
  "pendingInvites": [
    {
      "eventId": "evt-002",
      "title": "Book Club Lunch",
      "fromUser": "Daisy",
      "venueType": "Restaurant",
      "dateRange": { "start": "2026-04-10", "end": "2026-04-20" }
    }
  ]
}
```

---

## 5. Lambda Implementation Guide

### 5.1 Recommended Router Pattern

Replace the current flat `if` chain with a `(method, resource)` map:

```javascript
// index.mjs
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { routeRequest } from "./router.mjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event) => {
  // REST API authorizer path (not HTTP API)
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: "Unauthorized" });

  const method = event.httpMethod;          // "GET", "POST", etc.
  const resource = event.resource;          // "/events/{eventId}" (path template)
  const pathParams = event.pathParameters ?? {};
  const body = event.body ? JSON.parse(event.body) : null;

  return routeRequest({ method, resource, pathParams, body, userId, ddb });
};

const respond = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  },
  body: JSON.stringify(body),
});
```

### 5.2 Environment Variables (from CDK)

Read table names from env vars, never hardcode them:

```javascript
const USERS_TABLE         = process.env.USERS_TABLE;
const FRIENDSHIPS_TABLE   = process.env.FRIENDSHIPS_TABLE;
const EVENTS_TABLE        = process.env.EVENTS_TABLE;
const EVENT_MEMBERS_TABLE = process.env.EVENT_MEMBERS_TABLE;
const STAGE               = process.env.STAGE;  // "dev" | "prod"
```

### 5.3 Slot Key Conversion Utilities

The frontend uses compact slot keys (`"YYYY-MM-DD-HH"`). The DB stores ISO 8601 strings. Put these helpers in a `utils.mjs` file:

```javascript
// "2026-04-15-14" → "2026-04-15T14:00:00+08:00"
export function slotKeyToISO(key) {
  const [y, m, d, h] = key.split('-');
  return `${y}-${m}-${d}T${h.padStart(2,'0')}:00:00+08:00`;
}

// "2026-04-15T14:00:00+08:00" → "2026-04-15-14"
export function isoToSlotKey(iso) {
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const hour = d.getUTCHours() + 8; // adjust for SGT (UTC+8)
  return `${date}-${hour}`;
}

// Given array of ISO slot strings, compute counts map keyed by slot key
export function computeSlotCounts(memberSlots) {
  const counts = {};
  for (const slots of memberSlots) {
    for (const iso of (slots ?? [])) {
      const key = isoToSlotKey(iso);
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}
```

---

## 6. Conflicts & Resolution Plan

The following discrepancies exist between the current frontend code and the backend schema/implementation. Each one must be resolved before real API integration.

---

### Conflict 1 — Lambda uses `ownerId`, schema requires `creatorId`

**Location:** `backend/lambda/index.js` lines 18, 22, 43
**Problem:** The Lambda writes `ownerId` to DynamoDB, but the Events table schema and all frontend code use `creatorId`. The GSI `creatorId-createdAt-index` will never match.

**Resolution:** In `index.js`, rename all `ownerId` references to `creatorId`. Update the `QueryCommand` to use `creatorId`:
```javascript
// Fix this:
KeyConditionExpression: "creatorId = :uid",
IndexName: "creatorId-createdAt-index",
```

---

### Conflict 2 — Lambda hardcodes table names instead of using env vars

**Location:** `backend/lambda/index.js` lines 8–9
**Problem:**
```javascript
const USERS_TABLE = "Users";    // ❌
const EVENTS_TABLE = "Events";  // ❌
```
These tables do not exist. Actual table names are `midmeet-dev-users`, `midmeet-prod-users`, etc., passed via env vars.

**Resolution:** Replace with:
```javascript
const USERS_TABLE   = process.env.USERS_TABLE;
const EVENTS_TABLE  = process.env.EVENTS_TABLE;
```

---

### Conflict 3 — Lambda reads `User.friends` field which doesn't exist

**Location:** `backend/lambda/index.js` line 33
**Problem:** `result.Item?.friends` assumes a `friends` array on the Users record. The Users table has no such field. Friends are stored in the separate `midmeet-{stage}-friendships` table.

**Resolution:** Rewrite `GET /friends` to query the Friendships table (see Section 4.2).

---

### Conflict 4 — Frontend `interests[]` vs backend `preferences` Map

**Location:** `frontend/src/api/eventService.ts` line 18; `types/event.ts` line 43
**Problem:** `FriendProfile.interests` is a flat string array (e.g. `["Food", "Cafe", "Board Games"]`). The Users table stores structured preferences: `preferences.sports`, `preferences.foodTypes`, `preferences.gatheringTypes`, etc.

**Resolution (choose one):**
- **Option A (recommended):** Add a flat `interests` string list field to the Users table. Frontend populates it during onboarding; backend returns it directly.
- **Option B:** Backend concatenates `preferences.sports + preferences.gatheringTypes + preferences.venuePreferences` when returning friend profiles. Document this mapping explicitly.

---

### Conflict 5 — Frontend `address` field vs backend `approxArea` / `exactAddress`

**Location:** `frontend/src/api/eventService.ts` line 18 (FriendProfile has no address field currently, but onboarding and user profile pages will need it)

**Problem:** The Users table has two address fields: `approxArea` (coarse, safe to share) and `exactAddress` (precise, private). The frontend currently has a single `address` concept.

**Resolution:**
- Map `approxArea` to frontend display fields (friend cards, event member lists)
- Never expose `exactAddress` via `GET /users/:userId`
- Only return `exactAddress` in `GET /users/me`

---

### Conflict 6 — Event status enum values differ

**Location:** `backend/cdk/lib/DynamoDB_Tables.md` example shows `"TIME_SELECTING"`; frontend uses `"SELECTING_VENUE"`.

**Problem:** No canonical enum is defined in the backend. Risk of inconsistency as multiple developers implement handlers.

**Resolution:** Adopt the frontend enum as the canonical set. Define a constants file in the Lambda:
```javascript
// constants.mjs
export const EVENT_STATUS = {
  COLLECTING_AVAILABILITY: 'COLLECTING_AVAILABILITY',
  SELECTING_VENUE:         'SELECTING_VENUE',
  AWAITING_CONFIRMATION:   'AWAITING_CONFIRMATION',
  FINALIZED:               'FINALIZED',
};
```
Update `DynamoDB_Tables.md` example to use `"COLLECTING_AVAILABILITY"`.

---

### Conflict 7 — Frontend `slotCounts` has no direct DB field

**Location:** `frontend/src/api/Event.tsx` — `EventDetail.slotCounts?: Record<string, number>`
**Problem:** The Events table has no `slotCounts` field. The frontend expects a precomputed vote-count map.

**Resolution:** Backend **computes** `slotCounts` on the fly from EventMembers `availableTimeSlots` arrays. Use `computeSlotCounts()` utility from Section 5.3. Do not store `slotCounts` in DynamoDB — it is always derived.

---

### Conflict 8 — Frontend tracking arrays (`availabilitySubmittedBy`, `confirmedUserIds`, `declinedUserIds`) have no DB equivalents

**Location:** `frontend/src/api/Event.tsx` — `EventDetail` type
**Problem:** These arrays are used heavily by the frontend for conditional rendering and notification logic. The DB has no dedicated fields for them.

**Resolution:** Backend derives all three from EventMembers records when building the response:

| Frontend field | Derived from EventMembers |
|---|---|
| `availabilitySubmittedBy` | `userId` for members where `availableTimeSlots` is non-empty |
| `confirmedUserIds` | `userId` for members where `inviteStatus = "ACCEPTED"` (only meaningful when status is `AWAITING_CONFIRMATION` or `FINALIZED`) |
| `declinedUserIds` | `userId` for members where `inviteStatus = "DECLINED"` |

---

### Conflict 9 — Slot format mismatch: `"YYYY-MM-DD-HH"` vs ISO 8601

**Location:** Frontend uses compact keys throughout; EventMembers stores ISO 8601 strings.

**Resolution:** Backend handles all conversion internally using the utilities in Section 5.3. The frontend-facing API always uses `"YYYY-MM-DD-HH"` slot keys. The DynamoDB layer always stores ISO 8601.

---

### Conflict 10 — `dateRange` field missing from Events table schema

**Location:** `frontend/src/api/Event.tsx` — `EventDetail.dateRange: { start: string; end: string }`
**Problem:** The Events table schema in `DynamoDB_Tables.md` does not include `dateRange`. The frontend requires it to display the availability collection window.

**Resolution:** Add `dateRange` as a DynamoDB Map attribute to the Events table. No CDK migration needed for existing data — just ensure the `PutItem` on event creation includes it:
```json
"dateRange": { "start": "2026-04-10", "end": "2026-04-20" }
```

---

### Conflict 11 — API Gateway only exposes `GET /events`; 20+ endpoints required

**Location:** `backend/cdk/lib/cdk-stack.ts` line 110
**Problem:** Only `GET /events` is wired. All other routes return 404 from API Gateway before even reaching Lambda.

**Resolution:** Add all required routes in CDK. Recommended pattern to avoid boilerplate:

```typescript
// cdk-stack.ts — add after existing GET /events

const resources: Record<string, apigateway.Resource> = {};

function getOrCreateResource(path: string): apigateway.Resource {
  if (resources[path]) return resources[path];
  const parts = path.split('/').filter(Boolean);
  let current = api.root;
  for (const part of parts) {
    const existing = current.getResource(part);
    current = existing ?? current.addResource(part);
  }
  resources[path] = current;
  return current;
}

const AUTH = { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO };

const routes: [string, string][] = [
  ['GET',    '/users/me'],
  ['PUT',    '/users/me'],
  ['GET',    '/users/{userId}'],
  ['GET',    '/friends'],
  ['POST',   '/friends/request'],
  ['PUT',    '/friends/accept'],
  ['GET',    '/friends/{userId}'],
  ['GET',    '/friends/suggestions/{userId}'],
  ['GET',    '/events'],
  ['POST',   '/events'],
  ['GET',    '/events/{eventId}'],
  ['DELETE', '/events/{eventId}'],
  ['POST',   '/events/{eventId}/availability'],
  ['POST',   '/events/{eventId}/finalize'],
  ['POST',   '/events/{eventId}/confirm'],
  ['POST',   '/events/{eventId}/decline'],
  ['POST',   '/events/{eventId}/unfinalize'],
  ['GET',    '/events/{eventId}/venues'],
  ['GET',    '/notifications'],
  ['GET',    '/dashboard'],
];

for (const [method, path] of routes) {
  getOrCreateResource(path).addMethod(method, lambdaIntegration, AUTH);
}
```

---

### Conflict 12 — Lambda uses HTTP API event format on a REST API

**Location:** `backend/lambda/index.js` line 12 — `event.requestContext.authorizer.jwt.claims.sub`
**Problem:** `apigateway.RestApi` in CDK creates a **REST API**, not an HTTP API. The event format is different.

**Resolution:**
```javascript
// REST API (correct for RestApi)
const userId = event.requestContext.authorizer.claims.sub;

// HTTP API (only if you switch to apigateway.HttpApi)
// const userId = event.requestContext.authorizer.jwt.claims.sub;
```

The routing also differs: REST API uses `event.resource` (path template like `/events/{eventId}`) and `event.httpMethod`. The current code uses `event.rawPath` and `event.requestContext.http.method` (HTTP API fields).

---

## 7. DynamoDB Access Patterns Summary

| Operation | Table | Operation Type | Key / Index |
|---|---|---|---|
| Get my profile | users | GetItem | `userId = sub` |
| Update my profile | users | PutItem/UpdateItem | `userId = sub` |
| Get user by ID | users | GetItem | `userId = :id` |
| Lookup user by ID (profile hydrate) | users | GetItem | `PK=USER#<id>, SK=PROFILE` |
| Get my friends | friendships | Query + filter | `userId = sub, status = ACCEPTED` |
| Get friend graph snapshot | friendships | Query + classify | `PK=USER#uid, SK begins_with FRIEND#` |
| Send friend request | friendships | PutItem ×2 | Both directions |
| Accept request | friendships | UpdateItem ×2 | Both directions |
| Get my events | event-members | Query (GSI) | `userId-createdAt-index` |
| Get event | events | GetItem | `eventId` |
| Get event members | event-members | Query | `eventId` (partition key) |
| Create event | events + event-members | PutItem ×(1 + N) | — |
| Submit availability | event-members | UpdateItem | `{ eventId, userId }` |
| Finalize event | events | UpdateItem | `eventId` |
| Confirm/Decline | event-members | UpdateItem | `{ eventId, userId }` |
| Unfinalize event | events + event-members | UpdateItem ×(1 + N) | — |
| Creator's events (sorted) | events | Query (GSI) | `creatorId-createdAt-index` |

---

## 8. CDK Infrastructure Changes Required

Beyond adding routes (Conflict 11), the following CDK changes are needed:

### 8.1 Enable CORS on API Gateway

```typescript
const api = new apigateway.RestApi(this, 'EventsApi', {
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
    allowHeaders: ['Authorization', 'Content-Type'],
  },
});
```

Without this, browser requests from `localhost:5173` will be blocked by CORS.

### 8.2 Add Cognito Email Scope to User Pool Client

```typescript
const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
  userPool,
  generateSecret: false,
  authFlows: {
    userPassword: true,
    userSrp: true,
  },
});
```

### 8.3 Output the Cognito Domain (for Hosted UI, optional)

If using Cognito Hosted UI for sign-in, add:
```typescript
const domain = userPool.addDomain('Domain', {
  cognitoDomain: { domainPrefix: `${prefix}-auth` },
});
new cdk.CfnOutput(this, 'CognitoDomain', { value: domain.domainName });
```

### 8.4 Lambda Timeout & Memory

The default Lambda timeout is 3 seconds. Event creation and venue fetch may involve multiple DynamoDB calls. Set:
```typescript
const apiLambda = new lambda.Function(this, 'ApiLambda', {
  // ... existing config ...
  timeout: cdk.Duration.seconds(15),
  memorySize: 256,
});
```

---

*This document should be kept in sync with `FRONTEND_PROGRESS.md` as the project evolves. When backend endpoints are implemented, update the "Replacement action" column in Section 2.3 and mark conflicts as resolved in Section 6.*
