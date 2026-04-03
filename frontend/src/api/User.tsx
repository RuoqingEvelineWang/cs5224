// ─── User & Friend API ────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = {
  userId: string;
  name: string;
  email: string;
  address: string;
  transportType: string;
  interests: string[];
};

export type FriendEntry = {
  userId: string;
  name: string;
  email: string;
  interests: string[];
  since: string; // ISO date
};

export type FriendRequest = {
  requestId: string;
  fromUserId: string;
  fromName: string;
  fromInterests: string[];
  sentAt: string;
};

// ─── Mock Stores ──────────────────────────────────────────────────────────────

const mockUserStore: Record<string, User> = {};

// Mock friend relationships for current user
let mockFriends: FriendEntry[] = [
  { userId: 'u-alice',   name: 'Alice',   email: 'alice@example.com',   interests: ['Food', 'Cafe', 'Board Games'], since: '2025-11-10' },
  { userId: 'u-bob',     name: 'Bob',     email: 'bob@example.com',     interests: ['Hiking', 'Photography', 'Park'], since: '2025-12-01' },
  { userId: 'u-charlie', name: 'Charlie', email: 'charlie@example.com', interests: ['Music', 'Brunch', 'Cafe'], since: '2026-01-15' },
];

// Mock incoming friend requests
let mockFriendRequests: FriendRequest[] = [
  {
    requestId: 'req-1',
    fromUserId: 'u-ethan',
    fromName: 'Ethan',
    fromInterests: ['Movies', 'Mall', 'Restaurant'],
    sentAt: '2026-03-24T08:00:00Z',
  },
  {
    requestId: 'req-2',
    fromUserId: 'u-daisy',
    fromName: 'Daisy',
    fromInterests: ['Books', 'Library', 'Tea'],
    sentAt: '2026-03-26T12:30:00Z',
  },
];

// ─── User API ─────────────────────────────────────────────────────────────────

export async function createUser(userId: string, name: string, email: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      if (!mockUserStore[userId]) {
        mockUserStore[userId] = { userId, name, email, address: '', transportType: '', interests: [] };
      }
      resolve();
    }, 300);
  });
}

export async function fetchCurrentUser(userId: string): Promise<User | null> {
  return new Promise(resolve => {
    setTimeout(() => resolve(mockUserStore[userId] ?? null), 300);
  });
}

export async function updateUser(
  userId: string,
  data: Pick<User, 'name' | 'address' | 'transportType' | 'interests'>
): Promise<User> {
  return new Promise(resolve => {
    setTimeout(() => {
      const existing = mockUserStore[userId];
      const updated: User = {
        userId,
        name: data.name,
        email: existing?.email ?? '',
        address: data.address,
        transportType: data.transportType,
        interests: data.interests,
      };
      mockUserStore[userId] = updated;
      resolve(updated);
    }, 400);
  });
}

// ─── Friend API ───────────────────────────────────────────────────────────────

/** Get all friends of the current user */
export async function fetchFriends(): Promise<FriendEntry[]> {
  return new Promise(resolve => setTimeout(() => resolve([...mockFriends]), 350));
}

/** Get pending incoming friend requests */
export async function fetchFriendRequests(): Promise<FriendRequest[]> {
  return new Promise(resolve => setTimeout(() => resolve([...mockFriendRequests]), 300));
}

/** Accept a friend request — adds to friends list, removes from requests */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const req = mockFriendRequests.find(r => r.requestId === requestId);
      if (req) {
        mockFriends = [
          ...mockFriends,
          {
            userId: req.fromUserId,
            name: req.fromName,
            email: `${req.fromName.toLowerCase()}@example.com`,
            interests: req.fromInterests,
            since: new Date().toISOString().slice(0, 10),
          },
        ];
        mockFriendRequests = mockFriendRequests.filter(r => r.requestId !== requestId);
      }
      resolve();
    }, 400);
  });
}

/** Decline / ignore a friend request */
export async function declineFriendRequest(requestId: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      mockFriendRequests = mockFriendRequests.filter(r => r.requestId !== requestId);
      resolve();
    }, 300);
  });
}

/** Remove a friend */
export async function removeFriend(friendUserId: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      mockFriends = mockFriends.filter(f => f.userId !== friendUserId);
      resolve();
    }, 350);
  });
}

/** Search for users to add as friends (mock: returns non-friend users) */
export async function searchUsers(query: string): Promise<FriendEntry[]> {
  const allMockUsers: FriendEntry[] = [
    { userId: 'u-daisy',  name: 'Daisy',  email: 'daisy@example.com',  interests: ['Books', 'Library', 'Tea'],          since: '' },
    { userId: 'u-ethan',  name: 'Ethan',  email: 'ethan@example.com',  interests: ['Movies', 'Mall', 'Restaurant'],      since: '' },
    { userId: 'u-fiona',  name: 'Fiona',  email: 'fiona@example.com',  interests: ['Yoga', 'Swimming', 'Cafe'],          since: '' },
    { userId: 'u-george', name: 'George', email: 'george@example.com', interests: ['Gym', 'Basketball', 'Sports Hall'],  since: '' },
    { userId: 'u-hannah', name: 'Hannah', email: 'hannah@example.com', interests: ['Running', 'Park', 'Cycling'],        since: '' },
  ];
  return new Promise(resolve => {
    setTimeout(() => {
      const q = query.trim().toLowerCase();
      const friendIds = new Set(mockFriends.map(f => f.userId));
      const reqIds = new Set(mockFriendRequests.map(r => r.fromUserId));
      const results = allMockUsers.filter(u =>
        !friendIds.has(u.userId) &&
        !reqIds.has(u.userId) &&
        (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      );
      resolve(results);
    }, 400);
  });
}

/** Send a friend request to a user */
export async function sendFriendRequest(targetUserId: string, targetName: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      // In real app this would create a server-side request for the target user
      console.log(`Friend request sent to ${targetName} (${targetUserId})`);
      resolve();
    }, 300);
  });
}
