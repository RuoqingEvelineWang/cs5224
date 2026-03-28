import { fetchAuthSession } from "aws-amplify/auth";

export type FriendRow = {
  userId: string;
  name: string;
  interests: string[];
  status: "PENDING" | "ACCEPTED";
  requestedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type FriendListResponse = {
  userId: string;
  friends: FriendRow[];
  incomingRequests: FriendRow[];
  outgoingRequests: FriendRow[];
};

export type FriendSuggestion = {
  userId: string;
  name: string;
  interests: string[];
  score: number;
  commonInterests: string[];
};

type SuggestionResponse = {
  userId: string;
  suggestions: FriendSuggestion[];
};

const API_BASE_URL = String(import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

async function getIdToken(): Promise<string> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) {
    throw new Error("Unable to get auth token. Please sign in again.");
  }
  return token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_URL is missing. Please configure frontend/.env.");
  }

  const token = await getIdToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const raw = await response.text();
  let payload: unknown = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { message: raw };
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}

export async function fetchFriends(userId: string): Promise<FriendListResponse> {
  return request<FriendListResponse>(`/friends/${encodeURIComponent(userId)}`, {
    method: "GET",
  });
}

export async function fetchFriendSuggestions(userId: string): Promise<FriendSuggestion[]> {
  const response = await request<SuggestionResponse>(`/friends/suggestions/${encodeURIComponent(userId)}`, {
    method: "GET",
  });
  return response.suggestions;
}

export async function sendFriendRequest(targetUserId: string): Promise<void> {
  await request<{ message: string }>("/friends/request", {
    method: "POST",
    body: JSON.stringify({ targetUserId }),
  });
}

export async function acceptFriendRequest(requesterUserId: string): Promise<void> {
  await request<{ message: string }>("/friends/accept", {
    method: "PUT",
    body: JSON.stringify({ requesterUserId }),
  });
}
