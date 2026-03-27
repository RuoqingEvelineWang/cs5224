// ─── User API ─────────────────────────────────────────────────────────────────
//
// Currently using an in-memory mock store (no backend required).
//
// TODO: When the backend is ready, replace fetchCurrentUser and updateUser with
// real fetch calls to API Gateway:
//   GET /users/{userId}           → fetchCurrentUser
//   PUT /users/{userId}           → updateUser (body: name, address, transportType, interests)
//
// Note: email is set once by the Cognito Post-Confirmation trigger (POST /users)
// and is not updatable via PUT /users/{userId}.
// name IS updatable via PUT — backend informed to support this.
//
// Use fetchAuthSession() from "aws-amplify/auth" to get the Cognito ID token
// and pass it as the Authorization header. Remove the mock store and setTimeout
// wrappers. Function signatures stay the same — no other files need to change.
//
// ─── Types ────────────────────────────────────────────────────────────────────

export type User = {
  userId: string;
  name: string;
  email: string;
  address: string;
  transportType: string;
  interests: string[];
};

// ─── Mock Store ───────────────────────────────────────────────────────────────

const mockUserStore: Record<string, User> = {};

// ─── Mock API Functions ───────────────────────────────────────────────────────

// Simulates the Cognito Post-Confirmation trigger (POST /users).
// In production this is called by the backend Lambda, not the frontend.
export async function createUser(userId: string, name: string, email: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      if (!mockUserStore[userId]) {
        mockUserStore[userId] = { userId, name, email, address: "", transportType: "", interests: [] };
      }
      resolve();
    }, 300);
  });
}

export async function fetchCurrentUser(userId: string): Promise<User | null> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(mockUserStore[userId] ?? null);
    }, 300);
  });
}

export async function updateUser(
  userId: string,
  data: Pick<User, "name" | "address" | "transportType" | "interests">
): Promise<User> {
  return new Promise(resolve => {
    setTimeout(() => {
      const existing = mockUserStore[userId];
      const updated: User = {
        userId,
        name: data.name,
        email: existing?.email ?? "",
        address: data.address,
        transportType: data.transportType,
        interests: data.interests,
      };
      mockUserStore[userId] = updated;
      resolve(updated);
    }, 400);
  });
}
