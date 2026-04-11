# MidMeet Unit Testing

## Setup

Run the following commands inside the `backend/lambda/` directory:

```bash
npm install --save-dev jest babel-jest @babel/core @babel/preset-env
```

Create `babel.config.json` in `backend/lambda/`:

```json
{
  "presets": [["@babel/preset-env", { "targets": { "node": "current" } }]]
}
```

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage
```

Coverage reports are generated in `coverage/lcov-report/index.html`.

## Notes

- No AWS credentials or running backend required — all DynamoDB and external API calls are mocked.
- Test files are co-located with their source files in `handlers/` and follow the `*.test.js` naming convention.
- If a new handler is added, create a corresponding `handlerName.test.js` in the same directory.
- If a test fails after updating source code, check whether the failure is due to a logic change in the source (update the expected value) or an actual bug (fix the source first).

## Unit Test Results

### Summary

| Metric | Result |
|---|---|
| Test Suites | 9 passed, 9 total |
| Test Cases | 236 passed, 236 total |
| Statement Coverage | 96.74% |
| Branch Coverage | 87.23% |
| Function Coverage | 97.90% |
| Line Coverage | 98.51% |

All 236 tests pass with zero failures. The suite runs fully offline — no AWS credentials or deployed backend required.

---

### Coverage by Handler

| File | Stmts (%) | Branch (%) | Funcs (%) | Lines (%) |
|---|---|---|---|---|
| confirmAttendance.js | 97.43 | 88.46 | 100.00 | 100.00 |
| createEvent.js | 100.00 | 100.00 | 100.00 | 100.00 |
| declineAttendance.js | 94.87 | 84.61 | 100.00 | 100.00 |
| finalizeEvent.js | 94.28 | 81.81 | 100.00 | 100.00 |
| friendHandlers.js | 97.29 | 88.88 | 100.00 | 97.71 |
| getEventById.js | 92.50 | 83.33 | 88.23 | 96.55 |
| getEvents.js | 97.95 | 87.17 | 95.23 | 100.00 |
| getFriends.js | 97.61 | 80.00 | 100.00 | 97.22 |
| getNotifications.js | 100.00 | 94.44 | 100.00 | 100.00 |
| getRecommendations.js | 94.94 | 80.39 | 94.11 | 97.77 |
| getTimeRecommendations.js | 93.75 | 80.00 | 100.00 | 93.33 |
| getVenues.js | 98.60 | 93.33 | 100.00 | 100.00 |
| leaveEvent.js | 96.07 | 81.57 | 100.00 | 100.00 |
| submitAvailability.js | 95.55 | 87.50 | 100.00 | 97.50 |
| unfinalizeEvent.js | 95.83 | 85.71 | 100.00 | 100.00 |
| userHandlers.js | 98.33 | 93.93 | 100.00 | 98.27 |
| **All files** | **96.74** | **87.23** | **97.90** | **98.51** |

---

### Test Files

| Test File | Handlers Covered | Cases |
|---|---|---|
| `userHandlers.test.js` | userHandlers | 25 |
| `friendHandlers.test.js` | friendHandlers | 30 |
| `createEvent.test.js` | createEvent | 8 |
| `getEvents_getEventById.test.js` | getEvents, getEventById | 20 |
| `getFriends_getRecommendations.test.js` | getFriends, getRecommendations | 25 |
| `confirmAttendance_declineAttendance.test.js` | confirmAttendance, declineAttendance | 18 |
| `finalizeEvent_unfinalizeEvent_submitAvailability.test.js` | finalizeEvent, unfinalizeEvent, submitAvailability | 28 |
| `leaveEvent_getNotifications_getTimeRecommendations.test.js` | leaveEvent, getNotifications, getTimeRecommendations | 38 |
| `getVenues.test.js` | getVenues | 14 |

---

### What Is Tested

Each handler is tested across four dimensions:

**Functional correctness** — happy-path scenarios verify that the correct data shape is returned and the right DynamoDB commands are issued with the correct keys, expressions, and values.

**Input validation** — missing or malformed inputs (empty arrays, wrong formats, null fields) are verified to produce the correct HTTP status code and error message.

**Error propagation** — unexpected DynamoDB failures are verified to surface to the caller rather than being silently swallowed.

**Boundary and edge conditions** — includes DynamoDB pagination (BatchGet chunking over 100 items), concurrent conditional writes (ConditionalCheckFailedException handling), external API retry logic (OSM Overpass mirrors), token caching expiry, and LEFT-member exclusion in attendance flows.

---

### Mock Strategy

| Dependency | Mock Approach |
|---|---|
| DynamoDB (`docClient`) | Dependency injection — each handler accepts `docClient` as a parameter; tests pass a `jest.fn()` stub |
| OneMap / Google Places / OSM APIs | `jest.spyOn(global, "fetch")` per test |
| AWS SSM (credentials) | `jest.mock("@aws-sdk/client-ssm")` at module level |
| `getNotifications.createNotification` | `jest.mock("./getNotifications.js")` in handlers that import it |

---

### How to Run

```bash
cd backend/lambda

# Run all tests
npm test

# Run with coverage report
npm run test:coverage
```

The HTML coverage report is generated at `coverage/lcov-report/index.html`.