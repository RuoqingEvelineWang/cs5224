# UI Testing (Playwright)

## Setup

### 1. Install dependencies

```bash
cd frontend
npm install -D @playwright/test @types/node dotenv
npx playwright install chromium
```

### 2. Configure test credentials

Create `frontend/.env.test` (this file is git-ignored):

```
TEST_EMAIL=your-test-account@email.com
TEST_PASSWORD=your-test-password
```

The test account must be a registered Cognito user with a completed profile (name, postal code, transport type saved).

### 3. Seed test data

The tests rely on seed data for friends, events, and notifications. Run the seed script once before testing:

```bash
cd backend/cdk
DEMO_USER_ID=<your-cognito-user-id> npm run seed
```

To find your Cognito user ID, go to AWS Console → Cognito → User Pools → Users, or read it from the JWT token after signing in.

To reset data:

```bash
npm run db:clear
DEMO_USER_ID=<your-cognito-user-id> npm run seed
```

### 4. Start the frontend

```bash
cd frontend
npm run dev
```

Leave this running before executing any tests.

---

## Running Tests

### Authenticate once (required before first run)

```bash
npx playwright test --project=setup
```

This logs in with the test account and saves the session to `tests/e2e/.auth/user.json`. Only needs to be re-run if the session expires.

### Run all tests

```bash
npx playwright test
```

### Run a specific test file

```bash
npx playwright test tests/e2e/auth.spec.ts
npx playwright test tests/e2e/dashboard.spec.ts
npx playwright test tests/e2e/profile.spec.ts
npx playwright test tests/e2e/friends.spec.ts
npx playwright test tests/e2e/events.spec.ts
npx playwright test tests/e2e/notifications.spec.ts
```

### View HTML report

```bash
npx playwright show-report
```

---

## Test Cases

### Authentication (`auth.spec.ts`)

| ID | Description |
|----|-------------|
| TC-AUTH-01 | Sign-in form renders with email, password fields and Sign In button |
| TC-AUTH-02 | Correct credentials navigate to the Dashboard |
| TC-AUTH-03 | Wrong password displays a red error banner |

### Profile (`profile.spec.ts`)

| ID | Description |
|----|-------------|
| TC-PROF-01 | Profile page loads with name, postal code, transport and interest fields |
| TC-PROF-02 | Entering a non-6-digit postal code and saving shows a validation error |

### Dashboard (`dashboard.spec.ts`)

| ID | Description |
|----|-------------|
| TC-DASH-01 | Dashboard renders Upcoming Events and Pending Invitations panels |
| TC-DASH-02 | Navigation bar links route correctly to Friends, Events, New Event, and Dashboard |

### Friends (`friends.spec.ts`)

| ID | Description |
|----|-------------|
| TC-FRND-01 | Friends page shows accepted friends (Bob and Charlie) from seed data |
| TC-FRND-02 | Incoming friend request from Evan shows Accept and Decline buttons |

### Event Creation (`events.spec.ts`)

| ID | Description |
|----|-------------|
| TC-EVT-01 | Continue button is disabled until at least one friend is selected |
| TC-EVT-02 | Selecting a friend enables Continue and navigates to Step 2 |
| TC-EVT-03 | Filling all required fields on Step 2 enables the Create & Open Workspace button |

### Notifications (`notifications.spec.ts`)

| ID | Description |
|----|-------------|
| TC-NOTIF-01 | Notifications page loads and displays the notification list |
| TC-NOTIF-02 | ATTENDANCE_REQUEST notification shows Attend and Decline buttons |
| TC-NOTIF-03 | ALL_SUBMITTED notification shows Select Time & Venue button |

### Friends — extended (`friends.spec.ts`)

| ID | Description |
|----|-------------|
| TC-FRND-03 | Send Request button is disabled when the user ID input is empty |
| TC-FRND-04 | Typing a user ID into the search field enables the Send Request button |
| TC-FRND-05 | Suggested Friends section renders with at least one recommendation (Fiona) |
| TC-FRND-06 | Accepting an incoming friend request shows a success message |

### Event creation — extended (`events.spec.ts`)

| ID | Description |
|----|-------------|
| TC-EVT-04 | Selecting a different venue type updates the active button style |

### Event workspace (`workspace.spec.ts`)

| ID | Description |
|----|-------------|
| TC-WS-01 | Availability grid renders when event is in COLLECTING_AVAILABILITY state |
| TC-WS-02 | Submit Availability button is disabled until at least one time slot is selected |
| TC-WS-03 | Creator sees the Slot Voting grid and all-submitted banner in SCHEDULING state |
| TC-WS-04 | Selecting a time slot in the voting grid reveals the Choose Venue button |
| TC-WS-05 | Navigating to the Venue tab shows recommended venue cards with Select This Venue buttons |

---

## Important notes on test data

- TC-FRND-06 modifies the database (accepts Evan's friend request). Re-seed before re-running:
  ```bash
  cd backend/cdk
  npm run db:clear
  DEMO_USER_ID=<your-cognito-user-id> npm run seed
  ```
- TC-WS-04 and TC-WS-05 depend on `evt-002` being in `SCHEDULING` status. If the event status has changed, re-seed before running workspace tests.
---

## Notes

- All tests use a saved Cognito session (`tests/e2e/.auth/user.json`) to avoid re-authenticating on every run.
- `auth.spec.ts` intentionally bypasses the saved session to test the login page directly.
- Test data is provided by the seed script. If notifications or friends appear missing, re-run the seed.
- `.env.test` and `tests/e2e/.auth/` are git-ignored and must be set up locally.