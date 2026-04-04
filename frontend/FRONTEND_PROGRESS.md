# MidMeet Frontend — Developer Reference

> **Audience:** Backend engineers onboarding to the project, and frontend engineers picking up existing work.
> **Last Updated:** 2026-03-28
> **Author:** Li Junxian (branch: `junxian-frontend`)
> **Stack:** React 19 · TypeScript · Vite · Tailwind CSS · React Router v7 · AWS Amplify v6 (Cognito)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Directory Structure](#2-tech-stack--directory-structure)
3. [Local Development](#3-local-development)
4. [Authentication Flow (Cognito)](#4-authentication-flow-cognito)
5. [Routing Map](#5-routing-map)
6. [Data Model & TypeScript Types](#6-data-model--typescript-types)
7. [Event Lifecycle State Machine](#7-event-lifecycle-state-machine)
8. [Page Reference](#8-page-reference)
9. [API Layer & Mock Functions](#9-api-layer--mock-functions)
10. [Backend Integration Guide](#10-backend-integration-guide)
11. [Notification System Design](#11-notification-system-design)
12. [localStorage Mock Store](#12-localstorage-mock-store)
13. [Known Limitations & TODO](#13-known-limitations--todo)

---

## 1. Project Overview

MidMeet is a group-meetup coordination app. Its core value proposition is:

1. A group of friends wants to meet up. The creator invites friends and sets a date range and venue type.
2. Each participant privately submits their available time slots on a drag-to-select grid.
3. When everyone has submitted, the creator sees an aggregated vote-count heatmap and picks the best slot.
4. The creator then chooses a venue from a recommendation list (computed from each participant's home address — midpoint algorithm).
5. All participants receive a notification and confirm or decline attendance.
6. Once everyone responds, the event is **FINALIZED** and visible to all confirmed attendees.

All events are friend-circle (private) events. There is no public event concept.

---

## 2. Tech Stack & Directory Structure

```
cs5224/
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── Event.tsx          # Core event types, mock store, all event API functions
│   │   │   ├── eventService.ts    # Dashboard, notifications, friend-list helpers
│   │   │   └── User.tsx           # User profile + friend graph API
│   │   ├── pages/
│   │   │   ├── AuthPage.tsx       # Sign in / sign up / email verify (Cognito)
│   │   │   ├── OnboardingPage.tsx # First-time profile setup
│   │   │   ├── Dashboard.tsx      # Home dashboard
│   │   │   ├── EventList.tsx      # MyEvents — all events grouped by status
│   │   │   ├── EventCreationWizard.tsx  # 2-step new event flow
│   │   │   ├── EventWorkspace.tsx # Availability submission + slot voting + venue selection
│   │   │   ├── EventDetails.tsx   # Finalized event read-only view
│   │   │   ├── NotificationsPage.tsx    # Bell notifications with inline actions
│   │   │   └── ProfilePage.tsx    # Profile edit + friend management
│   │   ├── types/
│   │   │   └── event.ts           # Shared TypeScript types (EventStatus, NotificationItem, …)
│   │   ├── App.tsx                # Root — auth state machine, global nav, route declarations
│   │   └── main.tsx               # React entry point
│   ├── .env.local                 # VITE_USER_POOL_ID, VITE_CLIENT_ID (not committed)
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
└── FRONTEND_PROGRESS.md           # ← this file
```

**Key dependency versions** (see `package.json` for exact pins):

| Package | Role |
|---|---|
| `react` / `react-dom` | UI rendering |
| `react-router-dom` v7 | Client-side routing |
| `aws-amplify` v6 | Cognito auth (`signIn`, `signUp`, `confirmSignUp`, `getCurrentUser`, `Hub`) |
| `tailwindcss` | Utility-first CSS |
| `typescript` | Type safety |
| `vite` | Dev server + bundler |

---

## 3. Local Development

```bash
cd frontend
npm install

# Create .env.local with your Cognito pool details:
# VITE_USER_POOL_ID=ap-southeast-1_XXXXXXXXX
# VITE_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX

npm run dev        # http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

**Mock data reset:** All event data is persisted to `localStorage` under the key `midmeet-events-v3`. Clearing this key (or running in a fresh browser profile) reloads the 80+ seed events defined in `api/Event.tsx → DEFAULT_EVENTS`.

> **Backend engineers:** While the backend is under development, the frontend runs entirely on mock data. No real API calls are made. When integrating, each mock function should be replaced with a `fetch` / `axios` call to the corresponding Lambda endpoint. See [Section 10](#10-backend-integration-guide) for the full endpoint contract.

---

## 4. Authentication Flow (Cognito)

Authentication is handled by **AWS Amplify v6** against a Cognito User Pool. Configuration lives in `App.tsx`:

```typescript
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_CLIENT_ID,
    },
  },
});
```

### App-level Auth State Machine

`App.tsx` manages a top-level `status` state with four values:

| Status | Description | Rendered Component |
|---|---|---|
| `loading` | Checking Cognito session on mount | `<LoadingScreen />` |
| `unauthed` | No active session | `<AuthPage />` |
| `onboarding` | Authenticated but profile not set up (`address` is empty) | `<OnboardingPage />` |
| `authed` | Fully authenticated + profile complete | `<AppContent />` (full app) |

The transition logic in `checkAuth()`:
1. Call `getCurrentUser()` and `fetchUserAttributes()` from Amplify.
2. Attempt to load the user profile from the User store (mock: in-memory; real: Lambda + DynamoDB).
3. If no profile exists → create one via `createUser()`.
4. If profile exists but `address` is empty → `status = 'onboarding'`.
5. Otherwise → `status = 'authed'`, set `displayName` from profile.

### AuthPage — Three Modes

| Mode | Amplify Call | Next State |
|---|---|---|
| `signIn` | `signIn({ username, password })` | → `checkAuth()` |
| `signUp` | `signUp({ username, password, options: { userAttributes: { email } } })` | → `confirm` mode |
| `confirm` | `confirmSignUp({ username, confirmationCode })` | → `signIn` mode |

**Sign-out workaround:** Before every `signIn`, the code calls `signOut()` and ignores errors. This prevents the "There is already a signed in user" Amplify error that occurs when a Cognito account is deleted from the AWS console while a local session still exists.

### Identity in Mock Mode

Because the backend is not yet connected, all API functions use a hardcoded constant:

```typescript
// api/Event.tsx
export const CURRENT_USER_ID = 'u-current';
export const CURRENT_USER_NAME = 'You';
```

**When integrating with the backend**, replace `CURRENT_USER_ID` with the real Cognito `sub` obtained from `getCurrentUser().userId`. The frontend already passes `userId` down from `App.tsx → AppContent → ProfilePage` — extend this pattern to all API calls.

---

## 5. Routing Map

All routes are declared in `App.tsx → AppContent`. Routes are protected by the outer auth state machine — only rendered when `status === 'authed'`.

| Path | Component | Description |
|---|---|---|
| `/` | `Dashboard` | Home screen with upcoming events + pending invites |
| `/events` | `EventList` | MyEvents grouped by lifecycle status |
| `/events/new` | `EventCreationWizard` | 2-step event creation (invite friends → set details) |
| `/create` | `CreateEvent` | Legacy entry point (dead code; can be removed) |
| `/events/:eventId/workspace` | `EventWorkspace` | Availability grid + slot voting + venue selection |
| `/events/:eventId/details` | `EventDetails` | Read-only finalized event detail view |
| `/notifications` | `NotificationsPage` | Full notification list with inline confirm/decline |
| `/profile` | `ProfilePage` | Profile edit + friend management |

---

## 6. Data Model & TypeScript Types

### 6.1 Core Event Types (`api/Event.tsx`)

#### `EventDetail` — Master event object

This is the single canonical type for all event data throughout the app.

```typescript
type EventDetail = {
  eventId: string;           // Unique identifier, e.g. "evt-abc123"
  title: string;
  status: EventStatus;       // See lifecycle below

  creatorId: string;         // userId of the event creator
  creatorName: string;
  participants: Participant[]; // Only confirmed/active participants
                               // Declined users are removed at FINALIZED transition

  // ── Availability tracking ──────────────────────────────────────
  availabilitySubmittedBy?: string[];
  // userIds who submitted slots. Length compared to participants.length
  // to determine when status should advance to SELECTING_VENUE.

  slotCounts?: Record<string, number>;
  // Key format: "YYYY-MM-DD-HH" (e.g. "2026-04-15-14" = 2 PM on 15 Apr 2026)
  // Value: number of participants who selected that slot.
  // Populated incrementally as each participant submits.

  // ── Attendance tracking ────────────────────────────────────────
  confirmedUserIds?: string[];  // set during AWAITING_CONFIRMATION / FINALIZED
  declinedUserIds?: string[];   // set during AWAITING_CONFIRMATION / FINALIZED

  // ── Re-join support ────────────────────────────────────────────
  pendingUserIds?: string[];
  // Users who left a private event. They are removed from participants[]
  // but tracked here so they can rejoin later.

  // ── Event metadata ─────────────────────────────────────────────
  venueType: string;  // 'Cafe'|'Park'|'Restaurant'|'Mall'|'Library'|'Sports Hall'
  dateRange: { start: string; end: string };  // ISO date "YYYY-MM-DD"
  isPublic: boolean;  // Always false — public events are not supported
  description?: string;

  // ── Finalization data (set during SELECTING_VENUE) ─────────────
  selectedTime?: TimeSlot;
  selectedVenue?: Venue;
};
```

#### `Participant`

```typescript
type Participant = {
  userId: string;
  name: string;
};
```

#### `TimeSlot`

```typescript
type TimeSlot = {
  date: string;       // "YYYY-MM-DD"
  startHour: number;  // Integer hour 0–23 (e.g. 14 = 2 PM)
};
```

#### `Venue`

```typescript
type Venue = {
  venueId: string;
  name: string;
  address: string;
  rating: number;           // 0.0–5.0
  distanceKm: number;       // Midpoint-adjusted distance in km
  estimatedMinutes: number; // Travel time estimate in minutes
};
```

#### `CommonTime` (used internally by `fetchCommonTimes`)

```typescript
type CommonTime = {
  date: string;
  startHour: number;
  count: number;              // How many participants are free at this slot
  participantNames: string[]; // Names of available participants
};
```

#### `CreateEventInput`

```typescript
type CreateEventInput = {
  title: string;
  participantIds: string[];
  participantNames: string[];
  venueType: string;
  dateRange: { start: string; end: string };
  isPublic: boolean;   // Always false in current implementation
  description?: string;
};
```

#### Slot key format

Slots are stored as string keys: `"YYYY-MM-DD-HH"` where `HH` is the integer hour (not zero-padded, e.g. `"2026-04-15-14"` = 2 PM on 15 Apr 2026). This format is used in `slotCounts`, `selectedFinalSlotKey`, and all serialization throughout the frontend.

---

### 6.2 Shared Types (`types/event.ts`)

```typescript
type EventStatus =
  | 'COLLECTING_AVAILABILITY'
  | 'SELECTING_VENUE'
  | 'AWAITING_CONFIRMATION'
  | 'FINALIZED';

type VenueType = 'Cafe' | 'Park' | 'Restaurant' | 'Mall' | 'Library' | 'Sports Hall';

// Lightweight version for Dashboard and list cards
type EventSummary = {
  eventId: string;
  title: string;
  creatorId: string;
  participantIds: string[];
  participantNames: string[];
  venueType: VenueType;
  selectedTime: string;   // ISO 8601 with SGT offset, e.g. "2026-04-15T14:00:00+08:00"
  selectedVenue: string;  // Venue name, or "Venue TBD"
  status: EventStatus;
};

// Used in Dashboard pending invites section
type InviteSummary = {
  eventId: string;
  title: string;
  fromUser: string;     // Creator's display name
  venueType: VenueType;
  dateRange: { start: string; end: string };
};

type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;    // ISO 8601
  kind:
    | 'FRIEND_REQUEST'          // Static; from friend graph
    | 'SUGGESTION'              // Static; system-generated interest match
    | 'EVENT_UPDATE'            // Generic event update
    | 'ALL_SUBMITTED'           // Creator: all participants submitted slots
    | 'ATTENDANCE_REQUEST';     // Participant: confirm/decline attendance
  eventId?: string;             // Present for ALL_SUBMITTED and ATTENDANCE_REQUEST
};

type DashboardData = {
  upcomingEvents: EventSummary[];
  pendingInvites: InviteSummary[];
};

// Lightweight friend object used in EventCreationWizard
type FriendProfile = {
  userId: string;
  name: string;
  interests: string[];
};
```

---

### 6.3 User & Friend Types (`api/User.tsx`)

```typescript
type User = {
  userId: string;
  name: string;
  email: string;
  address: string;        // Home address — used for midpoint calculation
  transportType: string;  // 'Walking' | 'Cycling' | 'Public Transport' | 'Car'
  interests: string[];    // e.g. ['Badminton', 'Yoga']
};

type FriendEntry = {
  userId: string;
  name: string;
  email: string;
  interests: string[];
  since: string;          // ISO date "YYYY-MM-DD", empty string if pending
};

type FriendRequest = {
  requestId: string;
  fromUserId: string;
  fromName: string;
  fromInterests: string[];
  sentAt: string;         // ISO 8601
};
```

---

## 7. Event Lifecycle State Machine

Events progress through exactly four statuses. **Transitions are irreversible except for the creator's explicit revert.**

```
                  ┌──────────────────────────────────────────────────────────┐
                  │                     Creator creates event                │
                  ▼                                                          │
  ┌──────────────────────────────┐                                          │
  │   COLLECTING_AVAILABILITY    │  All participants submit                  │
  │                              │  → auto-advances                          │
  │  • Participants drag-select  │                                          │
  │    their free time slots     │                                          │
  │  • Slots are private         │                                          │
  └─────────────┬────────────────┘                                          │
                │ availabilitySubmittedBy.length >= participants.length      │
                ▼                                                           │
  ┌──────────────────────────────┐                                          │
  │      SELECTING_VENUE         │  Creator picks slot + venue               │
  │                              │  → auto-advances                          │
  │  • Creator sees vote-count   │                                          │
  │    heatmap, picks final slot │                                          │
  │  • Creator picks venue from  │                                          │
  │    recommended list          │                                          │
  │  • Participants see ⏳        │                                          │
  └─────────────┬────────────────┘                                          │
                │ finalizeEvent() called by creator                        │
                ▼                                                           │
  ┌──────────────────────────────┐                                          │
  │   AWAITING_CONFIRMATION      │  All participants respond                 │
  │                              │  → auto-advances                          │
  │  • Each participant gets an  │                                          │
  │    ATTENDANCE_REQUEST notif  │                                          │
  │  • They confirm or decline   │                                          │
  │    via Notifications page    │                                          │
  └─────────────┬────────────────┘                                          │
                │ confirmedUserIds + declinedUserIds >= participants.length │
                ▼                                                           │
  ┌──────────────────────────────┐                                          │
  │          FINALIZED           │──── Creator can revert ───────────────────┘
  │                              │     unfinalizeEvent() → SELECTING_VENUE
  │  • Read-only event detail    │
  │  • participants[] contains   │
  │    only confirmed users      │
  └──────────────────────────────┘
```

### Status Transition Table

| Transition | Trigger | Actor | Code Location |
|---|---|---|---|
| `COLLECTING` → `SELECTING_VENUE` | `availabilitySubmittedBy.length >= participants.length` | Automatic | `submitAvailability()` |
| `SELECTING_VENUE` → `AWAITING_CONFIRMATION` | Creator selects slot + venue | Creator only | `finalizeEvent()` |
| `AWAITING_CONFIRMATION` → `FINALIZED` | `confirmedUserIds + declinedUserIds >= participants.length` | Automatic | `confirmAttendance()` / `declineAttendance()` |
| `FINALIZED` → `SELECTING_VENUE` | Creator explicitly reverts | Creator only | `unfinalizeEvent()` |

### Event Visibility Rules

`fetchMyEvents()` applies these filters:

| Status | Included? | Condition |
|---|---|---|
| `COLLECTING_AVAILABILITY` | Conditional | Only if `availabilitySubmittedBy` includes current user |
| `SELECTING_VENUE` | Always | User is in `participants[]` |
| `AWAITING_CONFIRMATION` | Conditional | Only if current user is in `confirmedUserIds` |
| `FINALIZED` | Always | User is in `participants[]` |

**Pending invitations** (`fetchPendingInvitations()`): `COLLECTING_AVAILABILITY` events where user is in `participants[]` but **not** in `availabilitySubmittedBy[]`.

**Rejoinable events** (`fetchPendingEvents()`): events where user is in `pendingUserIds[]` but **not** in `participants[]`.

---

## 8. Page Reference

### 8.1 AuthPage

**File:** [frontend/src/pages/AuthPage.tsx](frontend/src/pages/AuthPage.tsx)
**Activation:** Rendered by `App.tsx` when `status === 'unauthed'` (not a named route)

Three-mode form: Sign In → Sign Up → Email Verification.

| Mode | Amplify API | Data Required |
|---|---|---|
| Sign In | `signIn({ username, password })` | username, password |
| Sign Up | `signUp({ username, password, options: { userAttributes: { email } } })` | username, email, password × 2 |
| Confirm | `confirmSignUp({ username, confirmationCode })` | 6-digit code from email |

On successful sign-in, calls `onAuthenticated()` which re-runs `checkAuth()` in `App.tsx`.

**Backend note:** No Lambda call needed. Auth is entirely handled by Cognito. The frontend only calls Amplify SDK methods.

---

### 8.2 OnboardingPage

**File:** [frontend/src/pages/OnboardingPage.tsx](frontend/src/pages/OnboardingPage.tsx)
**Activation:** Rendered by `App.tsx` when `status === 'onboarding'` (not a named route)

Shown once after first sign-in if the user's profile has no `address`. Collects:

| Field | Required | Purpose |
|---|---|---|
| Name | Yes | Display name throughout app |
| Home Address | No | Input to midpoint / venue algorithm |
| Transport Type | Yes | Affects travel time estimates in venue recommendation |
| Interests | No | Used for friend suggestion matching |

On submit, calls `updateUser(userId, { name, address, transportType, interests })`.

**Backend note:** Real endpoint: `PUT /users/{userId}`. After onboarding, the venue recommendation service needs `address` + `transportType` for every participant to recommend fair midpoint venues.

---

### 8.3 Dashboard

**File:** [frontend/src/pages/Dashboard.tsx](frontend/src/pages/Dashboard.tsx)
**Route:** `/`

Home screen showing two panels:

**Upcoming Events (left):** Top 3 events sorted by date where the user is actively participating. Navigation:
- FINALIZED event → `View Details →` → `/events/:id/details`
- All others → `Open Workspace →` → `/events/:id/workspace`

**Pending Invitations (right):** Events where user is invited but hasn't submitted availability. `Submit Availability →` links to `/events/:id/workspace`.

Data source: `fetchDashboardData()` from `api/eventService.ts`.

---

### 8.4 EventList (MyEvents)

**File:** [frontend/src/pages/EventList.tsx](frontend/src/pages/EventList.tsx)
**Route:** `/events`

Primary events hub. Five sections, each showing an `EventCard`:

| Section | Filter | Badge | CTA |
|---|---|---|---|
| **Pending Invitations** | `COLLECTING` + not in `availabilitySubmittedBy` | Orange "Awaiting Your Vote" | Submit → (workspace) |
| **In Progress** | `COLLECTING` (submitted) or `SELECTING_VENUE` | Status badge | Open → (workspace) |
| **Awaiting Confirmation** | `AWAITING_CONFIRMATION` + in `confirmedUserIds` | Violet badge | View → (workspace) |
| **Confirmed Events** | `FINALIZED` | Green badge | Details → (event details) |
| **Left — Can Rejoin** | In `pendingUserIds[]` | Amber "Pending" | Rejoin → |

Additional UI:
- **Filter bar:** text search, venue type dropdown, sort by time or distance.
- **Progress text** under Pending Invitations: e.g. `2/3 submitted · invited by Alice`.
- **Confirmation text** under Awaiting Confirmation: e.g. `1/3 confirmed`.
- **Rejoin flow:** `joinEvent(eventId)` re-adds user to `participants[]`, removes from `pendingUserIds[]`, navigates to workspace.

---

### 8.5 EventCreationWizard

**File:** [frontend/src/pages/EventCreationWizard.tsx](frontend/src/pages/EventCreationWizard.tsx)
**Route:** `/events/new`

Two-step flow:

**Step 1 — Invite Friends**
- Loads friend list via `fetchFriends()` (mock: 5 hardcoded users).
- Multi-select friend cards. At least one friend required to proceed.

**Step 2 — Event Details**

| Field | Required | Notes |
|---|---|---|
| Title | Yes | Free text |
| Description | No | Optional context for participants |
| Venue Type | Yes | Pill selector; determines venue search category |
| Availability Start | Yes | Must be before End |
| Availability End | Yes | Max 7 days shown in the workspace grid |

On "Create & Open Workspace" → calls `createFullEvent(input)`:
- Creates `EventDetail` with `status: 'COLLECTING_AVAILABILITY'`
- `availabilitySubmittedBy: []`, `slotCounts: {}`, `confirmedUserIds: []`, `declinedUserIds: []`
- Writes to store, returns new event
- Navigates to `/events/{newEventId}/workspace`

**All events are private** (`isPublic: false` hardcoded). The public/private toggle has been removed.

---

### 8.6 EventWorkspace

**File:** [frontend/src/pages/EventWorkspace.tsx](frontend/src/pages/EventWorkspace.tsx)
**Route:** `/events/:eventId/workspace`

The most complex page. Behavior is determined by `event.status` × `isCreator`.

#### Automatic redirect

If `event.status === 'FINALIZED'` → immediately navigate to `/events/:id/details`.

#### AWAITING_CONFIRMATION state

No tabs shown. Displays a violet banner with:
- Confirmed time and venue name
- Per-participant status chips: green `✓ confirmed` | red `✗ declined` | grey `… pending`
- Note directing participants to the Notifications page

#### COLLECTING_AVAILABILITY — Participant (not yet submitted)

**Tab: "🗓 Availability"** → `SelectionGrid` component.

- **Grid layout:** rows = hours 8 AM–9 PM (14 rows × 1 cell per day), columns = days in `dateRange` (max 7).
- **Interaction:** click-and-drag to paint slots green. First cell's action (add/remove) sets the drag mode for the entire gesture. `mouseup` anywhere stops drag.
- **Privacy guarantee:** Only own selections shown. No other participants' data rendered. No overlays.
- Submit button → `submitAvailability(eventId, userId, slots[])`.
- If after this submit all participants have now submitted → event auto-transitions to `SELECTING_VENUE`.

#### COLLECTING_AVAILABILITY — Already submitted

Green "submitted" banner shown instead of grid.

#### SELECTING_VENUE — Creator

**Tab: "🗳 Slot Voting"** → `VotingGrid` component.

- Same time grid layout, but cells show **vote counts** (number of participants who selected that slot).
- Color scale: white (0 votes) → `indigo-100` (partial) → `indigo-400` (all participants free) → `indigo-600` (selected as final).
- Creator clicks a highlighted cell to select `selectedFinalSlotKey`. Selection info shown above grid.
- Once a slot is selected, "Choose Venue →" button and the Venues tab unlock.

**Tab: "📍 Venues"** — unlocks only after creator picks a slot.

- Venue cards from `fetchVenues(eventId)`.
- Each card: name, address, star rating, distance (km), estimated travel time (min).
- Creator clicks "Select This Venue" → calls `finalizeEvent(eventId, slot, venueId)` → navigates to `/events/:id/details` with `{ event, selectedSlot, selectedVenue }` in `location.state`.

#### SELECTING_VENUE — Non-creator

Waiting message with ⏳ icon and creator's name.

#### Exit / Leave behaviour

- **Creator with unsaved selections:** "Exit without submitting?" confirmation dialog.
- **Non-creator:** "Leave this event?" confirmation. Choosing Leave → `leaveEvent(eventId)` → moves user to `pendingUserIds[]` → navigates to `/events`.

---

### 8.7 EventDetails

**File:** [frontend/src/pages/EventDetails.tsx](frontend/src/pages/EventDetails.tsx)
**Route:** `/events/:eventId/details`

Read-only view for finalized events.

**Detail rows displayed:**
- Date & Time (`selectedTime`, formatted with weekday + AM/PM)
- Venue (name, address, rating, distance, travel time)
- Attendees (all `participants[]`)
- Venue Type

**Navigation:**
- "← Back to Events" → `/events`
- "Exit & Revert" (creator only, `event.creatorId === CURRENT_USER_ID`): confirmation dialog → `unfinalizeEvent(eventId)` → navigate to workspace.

**Data sourcing:** Page checks `location.state` first (passed by `EventWorkspace` on finalization). Falls back to `fetchEventById(eventId)` + `event.selectedTime` / `event.selectedVenue` for direct URL access or page refresh.

---

### 8.8 NotificationsPage

**File:** [frontend/src/pages/NotificationsPage.tsx](frontend/src/pages/NotificationsPage.tsx)
**Route:** `/notifications`

Full notification list. Notifications are dynamically generated from the event store on each page load.

**Props from `App.tsx`:**
- `onRead()` — called on mount; sets `notifUnread = 0` in parent.
- `onActionComplete()` — called after confirm/decline; triggers badge count refresh.

**Notification kinds and UI:**

| Kind | Background Color | Action Element |
|---|---|---|
| `FRIEND_REQUEST` | `bg-purple-50` | None (informational) |
| `SUGGESTION` | `bg-amber-50` | None (informational) |
| `EVENT_UPDATE` | `bg-indigo-50` | None (informational) |
| `ALL_SUBMITTED` | `bg-blue-50` | "Select Time & Venue →" button → workspace |
| `ATTENDANCE_REQUEST` | `bg-violet-50` | "✓ Attend" / "✗ Decline" buttons |

After acting on `ATTENDANCE_REQUEST`, item dims to 50% opacity and shows "Response recorded." (`actioned` Set in local state).

---

### 8.9 ProfilePage

**File:** [frontend/src/pages/ProfilePage.tsx](frontend/src/pages/ProfilePage.tsx)
**Route:** `/profile`

**Tab 1: My Profile**

| Field | Required | Backend Impact |
|---|---|---|
| Email | Read-only | From Cognito; cannot change here |
| Name | Yes | Display name; synced to `App.tsx` header via `onNameChange` prop |
| Home Address | No | **Critical for midpoint algorithm** |
| Transport Type | Yes | Affects travel time estimates in venue recommendation |
| Interests | No | Used for friend matching / suggestions |

Save → `updateUser(userId, { name, address, transportType, interests })`.

**Tab 2: Friend Management**

Three sections:
1. **Incoming Requests:** Accept (`acceptFriendRequest`) / Decline (`declineFriendRequest`). After accept, request removed and new friend added — list refreshes.
2. **My Friends:** List with name, interests, "Friends since" date. Remove → `removeFriend(friendId)`.
3. **Add Friends:** Text search → `searchUsers(query)`. Results exclude existing friends + pending requesters. "Add Friend" → `sendFriendRequest(targetUserId, targetName)`. Button becomes "Sent ✓" immediately (optimistic UI).

---

## 9. API Layer & Mock Functions

All API functions use **mock data** stored in `localStorage`. They simulate network latency with `setTimeout`. The table below documents each function.

### 9.1 `api/Event.tsx` — Event CRUD & Lifecycle

#### Store Helpers

```typescript
const EVENT_STORE_KEY = 'midmeet-events-v3';

readEventStore(): EventDetail[]   // reads from localStorage or returns DEFAULT_EVENTS clone
writeEventStore(events): void     // serialises array to localStorage
```

The `DEFAULT_EVENTS` array contains 80+ seed events. Categories:

| Category | Count | Status |
|---|---|---|
| Pending Invitations (not submitted) | 10 | `COLLECTING_AVAILABILITY` |
| In Progress — creator, submitted | 10 | `COLLECTING_AVAILABILITY` |
| In Progress — participant, submitted | 10 | `COLLECTING_AVAILABILITY` |
| Selecting Venue — you're creator (generates bell notifications) | **10** | `SELECTING_VENUE` |
| Selecting Venue — you're participant | 10 | `SELECTING_VENUE` |
| Awaiting Confirmation — you haven't responded (generates notifications) | 10 | `AWAITING_CONFIRMATION` |
| Awaiting Confirmation — you've confirmed | 10 | `AWAITING_CONFIRMATION` |
| Finalized | 10 | `FINALIZED` |
| Left — can rejoin | 5 | mixed |

#### Function Reference

| Function | Signature | Mock Behavior | Latency |
|---|---|---|---|
| `fetchMyEvents` | `() → EventDetail[]` | Filters store by participation + status visibility rules | 300 ms |
| `fetchPendingInvitations` | `() → EventDetail[]` | `COLLECTING` events where user in `participants` but not `availabilitySubmittedBy` | 300 ms |
| `fetchPendingEvents` | `() → EventDetail[]` | Events where user in `pendingUserIds` | 300 ms |
| `fetchEventById` | `(eventId) → EventDetail` | Finds by `eventId` in store, rejects if not found | 300 ms |
| `createFullEvent` | `(input) → EventDetail` | Prepends new event to store | 400 ms |
| `submitAvailability` | `(eventId, userId, slots[]) → void` | Accumulates `slotCounts`; auto-advances to `SELECTING_VENUE` when all submit | 600 ms |
| `finalizeEvent` | `(eventId, slot, venueId) → void` | Sets `selectedTime`/`selectedVenue`; status → `AWAITING_CONFIRMATION` | 500 ms |
| `confirmAttendance` | `(eventId) → void` | Adds to `confirmedUserIds`; auto-advances to `FINALIZED` when all respond | 400 ms |
| `declineAttendance` | `(eventId) → void` | Adds to `declinedUserIds`; same auto-finalize logic | 400 ms |
| `joinEvent` | `(eventId) → void` | Moves user from `pendingUserIds` to `participants` | 300 ms |
| `leaveEvent` | `(eventId) → void` | Removes from `participants`, adds to `pendingUserIds`; creator blocked | 300 ms |
| `unfinalizeEvent` | `(eventId) → void` | Clears slot/venue; status → `SELECTING_VENUE` (creator only) | 300 ms |
| `fetchVenues` | `(eventId) → Venue[]` | Returns 6 hardcoded venues | 700 ms |
| `fetchCommonTimes` | `(eventId) → CommonTime[]` | Derives from `event.slotCounts`, returns sorted by date/hour | 400 ms |

---

### 9.2 `api/eventService.ts` — Dashboard, Notifications, Friends

| Function | Type | Mock Behavior |
|---|---|---|
| `fetchFriends` | `() → FriendProfile[]` | Returns 5 hardcoded friends (used in `EventCreationWizard`) |
| `fetchDashboardData` | `() → DashboardData` | Reads store; top 3 upcoming events + pending invites |
| `fetchNotifications` | `() → NotificationItem[]` | Scans store to generate dynamic notifications + appends static array |
| `countActionableNotifications` | `() → number` (sync) | Scans store synchronously; used for bell badge in `App.tsx` |

> **Name conflict:** Both `eventService.ts` and `User.tsx` export `fetchFriends`, but they return different types (`FriendProfile[]` vs `FriendEntry[]`). `EventCreationWizard` uses `eventService.ts` (lightweight friend list). `ProfilePage` uses `User.tsx` (full friend graph with email/since). When connecting to the backend, consolidate into one `/users/{id}/friends` endpoint and unify the types.

---

### 9.3 `api/User.tsx` — User Profile & Friend Graph

| Function | Mock Behavior |
|---|---|
| `createUser(userId, name, email)` | Writes to in-memory `mockUserStore` (resets on page refresh) |
| `fetchCurrentUser(userId)` | Reads from `mockUserStore` |
| `updateUser(userId, data)` | Upserts `mockUserStore[userId]` |
| `fetchFriends()` | Returns `mockFriends` array (3 default friends) |
| `fetchFriendRequests()` | Returns `mockFriendRequests` array (2 default requests) |
| `acceptFriendRequest(requestId)` | Moves from requests to friends list |
| `declineFriendRequest(requestId)` | Removes from requests |
| `removeFriend(friendUserId)` | Removes from `mockFriends` |
| `searchUsers(query)` | Filters hardcoded pool, excludes existing friends + pending requesters |
| `sendFriendRequest(targetUserId, targetName)` | `console.log` only — no state change |

---

## 10. Backend Integration Guide

This section provides the complete REST API contract the frontend expects. All endpoints should be implemented as AWS Lambda functions behind API Gateway (REST or HTTP).

### 10.1 Authentication Header

Every authenticated request must include the Cognito ID Token:

```
Authorization: <Cognito ID Token>
```

The backend Lambda should validate the JWT and extract `sub` as the canonical `userId`. The frontend currently uses the hardcoded constant `CURRENT_USER_ID = 'u-current'`. When integrating, replace this with `getCurrentUser().userId` from Amplify and pass it into all API call functions.

---

### 10.2 User & Profile Endpoints

#### `POST /users` — Create user profile

Called on first sign-in if `GET /users/{userId}` returns 404.

**Request body:**
```json
{
  "userId": "cognito-sub-uuid",
  "name": "Alice",
  "email": "alice@example.com"
}
```

**Response `201`:** Created `User` object.

---

#### `GET /users/{userId}` — Get user profile

**Response `200`:**
```json
{
  "userId": "string",
  "name": "string",
  "email": "string",
  "address": "string",
  "transportType": "Walking | Cycling | Public Transport | Car",
  "interests": ["string"]
}
```

**Response `404`:** User not found. The frontend uses this to trigger the onboarding flow.

**Frontend check for onboarding:** If `address === ""` (empty string), the app redirects to OnboardingPage even if the user record exists. The backend should store an empty string as the initial `address` value.

---

#### `PUT /users/{userId}` — Update profile

Called from both Onboarding and Profile → My Profile tab.

**Request body:**
```json
{
  "name": "string",
  "address": "string",
  "transportType": "string",
  "interests": ["string"]
}
```

**Response `200`:** Updated `User` object. Email is immutable and must be preserved from the existing record.

---

#### `GET /users/search?q={query}` — Search users

Search by name or email. Results must exclude:
1. The requesting user themselves
2. Users already in the requester's friends list
3. Users who have a pending friend request from the requester

**Response `200`:** Array of objects matching `FriendEntry` shape:
```json
[
  {
    "userId": "string",
    "name": "string",
    "email": "string",
    "interests": ["string"],
    "since": ""
  }
]
```

---

### 10.3 Friend Graph Endpoints

#### `GET /users/{userId}/friends` — Get friends list

**Response `200`:** Array of `FriendEntry`:
```json
[
  {
    "userId": "string",
    "name": "string",
    "email": "string",
    "interests": ["string"],
    "since": "YYYY-MM-DD"
  }
]
```

---

#### `GET /users/{userId}/friend-requests` — Get incoming requests

**Response `200`:** Array of `FriendRequest`:
```json
[
  {
    "requestId": "string",
    "fromUserId": "string",
    "fromName": "string",
    "fromInterests": ["string"],
    "sentAt": "ISO-8601"
  }
]
```

---

#### `POST /friend-requests` — Send friend request

**Request body:**
```json
{
  "fromUserId": "string",
  "toUserId": "string"
}
```

**Response `201`:** Created request object.

---

#### `POST /friend-requests/{requestId}/accept` — Accept request

Backend must:
1. Create a bidirectional friend relationship between both users.
2. Delete the request record.
3. Record `since` date as today.

**Response `200`**

---

#### `POST /friend-requests/{requestId}/decline` — Decline request

Backend must delete the request record.

**Response `200`**

---

#### `DELETE /users/{userId}/friends/{friendId}` — Remove friend

Backend must remove the bidirectional friendship record.

**Response `204`**

---

### 10.4 Event Endpoints

All endpoints that return event data should use the full `EventDetail` shape defined in Section 6.1.

---

#### `POST /events` — Create event

**Request body:**
```json
{
  "title": "string",
  "creatorId": "string",
  "participantIds": ["string"],
  "venueType": "Cafe | Park | Restaurant | Mall | Library | Sports Hall",
  "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },
  "isPublic": false,
  "description": "string (optional)"
}
```

Backend must:
1. Generate a unique `eventId`.
2. Fetch names for `participantIds` and build `participants[]` including the creator.
3. Initialize: `availabilitySubmittedBy: []`, `slotCounts: {}`, `confirmedUserIds: []`, `declinedUserIds: []`.
4. Set `status: 'COLLECTING_AVAILABILITY'`.
5. Send invitations to all `participantIds` (in-app notification or push).

**Response `201`:** New `EventDetail` object.

---

#### `GET /events?userId={userId}` — Get all user events

Returns all events where the user is in `participants[]` or `pendingUserIds[]`. The frontend applies additional client-side filtering by status; the backend does not need to pre-filter.

**Response `200`:** Array of `EventDetail`.

---

#### `GET /events/pending?userId={userId}` — Pending invitations

`COLLECTING_AVAILABILITY` events where `userId` is in `participants[]` but not in `availabilitySubmittedBy[]`.

**Response `200`:** Array of `EventDetail`.

---

#### `GET /events/left?userId={userId}` — Left / rejoinable events

Events where `userId` is in `pendingUserIds[]` but not in `participants[]`.

**Response `200`:** Array of `EventDetail`.

---

#### `GET /events/{eventId}` — Get single event

**Response `200`:** `EventDetail`
**Response `404`:** Event not found.

---

#### `POST /events/{eventId}/availability` — Submit availability slots

**Request body:**
```json
{
  "userId": "string",
  "slots": [
    { "date": "YYYY-MM-DD", "startHour": 14 }
  ]
}
```

Backend must:
1. Validate `userId` is in `participants[]`.
2. For each slot, increment `slotCounts["YYYY-MM-DD-HH"]` by 1. Key format: `date + "-" + startHour` (no zero-padding on hour).
3. Add `userId` to `availabilitySubmittedBy[]` (idempotent — ignore if already present).
4. **Transition check:** if `availabilitySubmittedBy.length >= participants.length`:
   - Set `status = 'SELECTING_VENUE'`.
   - Generate `ALL_SUBMITTED` notification for the creator.

**Response `200`:** Updated `EventDetail`.

---

#### `POST /events/{eventId}/finalize` — Creator selects time and venue

**Request body:**
```json
{
  "slot": { "date": "YYYY-MM-DD", "startHour": 14 },
  "venueId": "string"
}
```

Backend must:
1. Validate caller is `creatorId`.
2. Validate `status === 'SELECTING_VENUE'`.
3. Resolve venue details from `venueId` and store as `selectedVenue`.
4. Set `selectedTime` from `slot`.
5. Reset `confirmedUserIds: []`, `declinedUserIds: []`.
6. Set `status = 'AWAITING_CONFIRMATION'`.
7. Generate `ATTENDANCE_REQUEST` notification for **every participant** (including creator).

**Response `200`:** Updated `EventDetail`.

---

#### `POST /events/{eventId}/confirm` — Confirm attendance

**Request body:** *(empty or `{ "userId": "string" }`)*

Backend must:
1. Add caller's `userId` to `confirmedUserIds[]` (idempotent).
2. **Transition check:** if `confirmedUserIds.length + declinedUserIds.length >= participants.length`:
   - Set `status = 'FINALIZED'`.
   - Filter `participants[]` to only include `confirmedUserIds` (remove declined users).

**Response `200`:** Updated `EventDetail`.

---

#### `POST /events/{eventId}/decline` — Decline attendance

**Request body:** *(empty or `{ "userId": "string" }`)*

Backend must:
1. Add caller's `userId` to `declinedUserIds[]` (idempotent).
2. Apply same finalization transition check as `/confirm`.
3. When finalized: filter `participants[]` to only `confirmedUserIds`.

**Response `200`:** Updated `EventDetail`.

---

#### `POST /events/{eventId}/join` — Rejoin event

**Request body:** *(empty or `{ "userId": "string" }`)*

Backend must:
1. Validate `userId` is in `pendingUserIds[]`.
2. Remove `userId` from `pendingUserIds[]`.
3. Add `{ userId, name }` to `participants[]`.
4. Reject if event is `FINALIZED`.

**Response `200`:** Updated `EventDetail`.

---

#### `POST /events/{eventId}/leave` — Leave event

**Request body:** *(empty or `{ "userId": "string" }`)*

Backend must:
1. Validate caller is not `creatorId` (creator cannot leave).
2. Remove `userId` from `participants[]`.
3. Add `userId` to `pendingUserIds[]`.
4. Do **not** change `status`.

**Response `200`:** Updated `EventDetail`.
**Response `403`:** If caller is the creator.

---

#### `POST /events/{eventId}/unfinalize` — Revert finalized event

Creator-only. Reverts `FINALIZED` back to `SELECTING_VENUE`.

Backend must:
1. Validate caller is `creatorId`.
2. Validate `status === 'FINALIZED'`.
3. Clear `selectedTime` and `selectedVenue`.
4. Reset `confirmedUserIds: []`, `declinedUserIds: []`.
5. Set `status = 'SELECTING_VENUE'`.

**Response `200`:** Updated `EventDetail`.
**Response `403`:** If caller is not creator.

---

### 10.5 Venue Endpoints

#### `GET /venues?eventId={eventId}` — Get venue recommendations

Returns venues suitable for the event's `venueType`, optimized for the group's collective travel distance.

**Response `200`:** Array of `Venue`:
```json
[
  {
    "venueId": "string",
    "name": "string",
    "address": "string",
    "rating": 4.5,
    "distanceKm": 1.2,
    "estimatedMinutes": 18
  }
]
```

**Backend implementation guide for the midpoint algorithm:**
1. Fetch all `participants[]` from the event.
2. For each participant, fetch `{ address, transportType }` from the User service.
3. Geocode each address to `{ lat, lng }`.
4. Compute the geographic centroid (average of all lat/lng).
5. Query Google Places API (or equivalent) for venues of type `event.venueType` within ~2 km of centroid.
6. For each candidate venue, compute travel time from each participant using their `transportType`.
7. Sort by minimized maximum travel time (fairness criterion) or weighted average.
8. Return top 6–10 venues with `distanceKm` and `estimatedMinutes` representing the **per-participant average** (or worst case, depending on algorithm choice).

---

### 10.6 Notification Endpoints

The frontend currently generates notifications **client-side** from the event store. When the backend is connected, move this logic server-side.

#### `GET /notifications?userId={userId}` — Get notifications

**Response `200`:** Array of `NotificationItem`:
```json
[
  {
    "id": "string",
    "title": "string",
    "detail": "string",
    "createdAt": "ISO-8601",
    "kind": "ALL_SUBMITTED | ATTENDANCE_REQUEST | FRIEND_REQUEST | SUGGESTION | EVENT_UPDATE",
    "eventId": "string | null"
  }
]
```

**Backend generation rules:**
1. `ALL_SUBMITTED`: for each `SELECTING_VENUE` event where `creatorId === userId`.
2. `ATTENDANCE_REQUEST`: for each `AWAITING_CONFIRMATION` event where `userId` is in `participants[]` but not in `confirmedUserIds` or `declinedUserIds`.
3. `FRIEND_REQUEST`: one per pending incoming friend request for `userId`.
4. `SUGGESTION`: interest-based recommendations (optional feature).

---

## 11. Notification System Design

### Bell Badge

The notification bell in the global header shows a red badge with the count of **actionable** notifications. This is computed synchronously by `countActionableNotifications()` in `eventService.ts`:

```
actionable count =
  (number of SELECTING_VENUE events where creatorId === CURRENT_USER_ID)
  +
  (number of AWAITING_CONFIRMATION events where user is participant but hasn't responded)
```

### Badge Lifecycle

| Event | Handler | Effect |
|---|---|---|
| App mounts | `useState(() => countActionableNotifications())` | Badge initialized from store |
| User clicks bell icon / navigates to `/notifications` | `onNotifRead()` in `App.tsx` | Badge count set to 0 |
| User confirms/declines via notification | `onActionComplete()` in `App.tsx` | Badge count recalculated from store |

### Data Flow

```
localStorage (event store)
       │
       ├── countActionableNotifications() ──→ notifUnread state (App.tsx) ──→ bell badge
       │
       └── fetchNotifications() ──────────→ NotificationsPage renders list
```

### Future: Push Notifications

In production, consider SNS → Lambda → WebSocket or Server-Sent Events to push badge count updates without requiring page interaction. The current synchronous scan approach works in mock mode (all data local) but would require a polling API call in production.

---

## 12. localStorage Mock Store

The mock data layer uses `localStorage` as a shared mutable store:

| Key | Content |
|---|---|
| `midmeet-events-v3` | JSON array of `EventDetail[]` |

**Version bumping:** The key suffix is incremented when the schema or seed data changes significantly. Existing localStorage data under the old key is ignored, and the app starts fresh from `DEFAULT_EVENTS`. Current version: **v3**.

**Read/write pattern:**

```typescript
// Every API function follows this pattern:
function someApiFunction(args) {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();   // read current state
      // ... make changes ...
      writeEventStore(updatedEvents);    // persist
      resolve(result);
    }, LATENCY_MS);
  });
}
```

All reads and writes are synchronous within the `setTimeout` callback, preventing race conditions in mock mode.

**Reset to defaults:** Open DevTools → Application → Storage → Local Storage → delete `midmeet-events-v3`.

---

## 13. Known Limitations & TODO

### Critical — Must Fix Before Production

| # | Issue | File | Action |
|---|---|---|---|
| 1 | `CURRENT_USER_ID = 'u-current'` is hardcoded | `api/Event.tsx:3` | Replace with `getCurrentUser().userId` from Amplify in all API calls |
| 2 | All event data is in localStorage; no real backend | `api/Event.tsx` | Replace all mock functions with `fetch` calls to Lambda endpoints |
| 3 | User profile is in-memory only (resets on page refresh) | `api/User.tsx` | Implement `GET/PUT /users/{id}` Lambda backed by DynamoDB |
| 4 | Friend graph is in-memory only | `api/User.tsx` | Implement friend graph endpoints backed by DynamoDB |
| 5 | Venue recommendations are 6 hardcoded Singapore venues | `api/Event.tsx:MOCK_VENUES` | Implement midpoint algorithm + Google Places (see Section 10.5) |
| 6 | `EventDetails` page loses data on refresh (depends on `location.state`) | `pages/EventDetails.tsx:92` | With real backend, `fetchEventById` always works; state dependency unnecessary |
| 7 | Notification badge only updates on bell click or action; no real-time push | `api/eventService.ts` | Implement WebSocket / SSE for real-time count |
| 8 | `EventList` shows all events without server-side user filtering | `api/Event.tsx:fetchMyEvents` | Backend `GET /events?userId=` handles filtering |

### Medium Priority

| # | Issue | File |
|---|---|---|
| 9 | `CreateEvent.tsx` (legacy) and `createBaseEvent()` are dead code | `pages/CreateEvent.tsx`, `api/eventService.ts:180` |
| 10 | Friend list in `EventCreationWizard` is hardcoded (5 friends from `FRIENDS` const) | `api/eventService.ts:17` |
| 11 | `fetchFriends` name exported from both `eventService.ts` and `User.tsx` with different types | consolidate to single endpoint |
| 12 | `fetchDashboardData` duplicates filter logic from `fetchMyEvents` | `api/eventService.ts:127` |
| 13 | Venue tab tooltip on non-creators says "Submit your availability first" (misleading) | `pages/EventWorkspace.tsx:510` |
| 14 | No error handling on `fetchEventById` failure in workspace | `pages/EventWorkspace.tsx:248` |
| 15 | No pagination on event list | `pages/EventList.tsx` |

### Low Priority / Nice to Have

| # | Issue |
|---|---|
| 16 | Drag-to-select on availability grid doesn't work on touch devices (mobile) |
| 17 | No date validation — `dateRange.start` can be in the past |
| 18 | "Forgot password?" link on AuthPage is not implemented |
| 19 | "Resend code" button on ConfirmForm is not implemented |
| 20 | Friend suggestions (`SUGGESTION` notification kind) are static — not computed from real interest overlap |

---

*For questions about this document, contact Li Junxian or file a GitHub issue on the project repository.*
