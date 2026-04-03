import { useCallback, useEffect, useState, type FormEvent } from "react";
import { fetchUserAttributes, getCurrentUser } from "aws-amplify/auth";
import { fetchCurrentUser } from "../api/User.tsx";
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchFriendSuggestions,
  fetchFriends,
  sendFriendRequest,
  type FriendListResponse,
  type FriendSuggestion,
} from "../api/friendService.ts";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function resolveRequesterName(
  userId: string,
  profileName?: string,
  cognitoName?: string,
  username?: string
): string {
  const profile = String(profileName || "").trim();
  if (profile) return profile;

  const name = String(cognitoName || "").trim();
  if (name) return name;

  const fallback = String(username || "").trim();
  if (fallback) return fallback;

  return userId;
}

export default function FriendsManagementPage() {
  const [userId, setUserId] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [searchUserId, setSearchUserId] = useState("");
  const [friendsData, setFriendsData] = useState<FriendListResponse | null>(null);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const loadData = useCallback(async (targetUserId: string, showLoader: boolean) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);

    try {
      const [friendList, suggestionList] = await Promise.all([
        fetchFriends(targetUserId),
        fetchFriendSuggestions(targetUserId),
      ]);
      setFriendsData(friendList);
      setSuggestions(suggestionList);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      if (showLoader) setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const currentUser = await getCurrentUser();
        const [attrs, profile] = await Promise.all([
          fetchUserAttributes().catch(
            () => ({} as Record<string, string>)
          ),
          fetchCurrentUser(currentUser.userId).catch(() => null),
        ]);
        if (cancelled) return;
        setUserId(currentUser.userId);
        setRequesterName(
          resolveRequesterName(currentUser.userId, profile?.name, attrs?.name, currentUser.username)
        );
        await loadData(currentUser.userId, true);
      } catch (bootstrapError) {
        if (cancelled) return;
        setError(getErrorMessage(bootstrapError));
        setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function handleSendRequest(targetUserId: string, targetName?: string) {
    const trimmed = targetUserId.trim();
    if (!trimmed) {
      setError("Please enter a target user ID.");
      return;
    }
    if (trimmed === userId) {
      setError("You cannot send a friend request to yourself.");
      return;
    }

    const key = `request-${trimmed}`;
    setActionKey(key);
    setError("");
    setInfo("");
    try {
      await sendFriendRequest(trimmed, {
        requesterName: requesterName || userId,
        ...(targetName ? { targetName } : {}),
      });
      setInfo(`Friend request sent to ${targetName || trimmed}.`);
      setSearchUserId("");
      await loadData(userId, false);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setActionKey(null);
    }
  }

  async function handleAcceptRequest(requesterUserId: string) {
    const key = `accept-${requesterUserId}`;
    setActionKey(key);
    setError("");
    setInfo("");
    try {
      await acceptFriendRequest(requesterUserId);
      setInfo(`You are now friends with ${requesterUserId}.`);
      await loadData(userId, false);
    } catch (acceptError) {
      setError(getErrorMessage(acceptError));
    } finally {
      setActionKey(null);
    }
  }

  async function handleDeclineRequest(requesterUserId: string) {
    const key = `decline-${requesterUserId}`;
    setActionKey(key);
    setError("");
    setInfo("");
    try {
      await declineFriendRequest(requesterUserId);
      setInfo(`Friend request from ${requesterUserId} declined.`);
      await loadData(userId, false);
    } catch (declineError) {
      setError(getErrorMessage(declineError));
    } finally {
      setActionKey(null);
    }
  }

  async function onSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await handleSendRequest(searchUserId);
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="rounded-2xl bg-white border border-gray-200 p-10 flex items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading friends management...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-500 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Friends Management</h1>
            <p className="mt-1 text-sm text-indigo-100">
              Search by user ID, manage pending requests, and discover compatible new friends.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setInfo("");
              void loadData(userId, false);
            }}
            disabled={refreshing}
            className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {info && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{info}</div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-900">Search by User ID</h2>
        <p className="mt-1 text-sm text-gray-500">Send a friend request directly if you know the user ID.</p>
        <form onSubmit={onSearchSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={searchUserId}
            onChange={(event) => setSearchUserId(event.target.value)}
            placeholder="e.g. 4d5d8a2e-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={actionKey === `request-${searchUserId.trim()}` || searchUserId.trim().length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionKey === `request-${searchUserId.trim()}` ? "Sending..." : "Send Request"}
          </button>
        </form>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Pending Requests</h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Incoming</p>
              <div className="mt-2 space-y-2">
                {(friendsData?.incomingRequests || []).length === 0 && (
                  <p className="text-sm text-gray-500">No incoming requests.</p>
                )}
                {(friendsData?.incomingRequests || []).map((request) => (
                  <div key={`incoming-${request.userId}`} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{request.name}</p>
                        <p className="text-xs text-gray-500">{request.userId}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void handleAcceptRequest(request.userId);
                          }}
                          disabled={actionKey === `accept-${request.userId}` || actionKey === `decline-${request.userId}`}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {actionKey === `accept-${request.userId}` ? "Accepting..." : "Accept"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeclineRequest(request.userId);
                          }}
                          disabled={actionKey === `accept-${request.userId}` || actionKey === `decline-${request.userId}`}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {actionKey === `decline-${request.userId}` ? "Declining..." : "Decline"}
                        </button>
                      </div>
                    </div>
                    {request.interests.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {request.interests.slice(0, 4).map((interest) => (
                          <span
                            key={`${request.userId}-${interest}`}
                            className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600"
                          >
                            {interest}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Outgoing</p>
              <div className="mt-2 space-y-2">
                {(friendsData?.outgoingRequests || []).length === 0 && (
                  <p className="text-sm text-gray-500">No outgoing requests.</p>
                )}
                {(friendsData?.outgoingRequests || []).map((request) => (
                  <div key={`outgoing-${request.userId}`} className="rounded-xl border border-gray-200 p-3">
                    <p className="text-sm font-semibold text-gray-900">{request.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{request.userId}</p>
                    <span className="inline-flex mt-2 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                      Waiting for response
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-900">Current Friends</h2>
          <div className="mt-4 space-y-2">
            {(friendsData?.friends || []).length === 0 && <p className="text-sm text-gray-500">No friends yet.</p>}
            {(friendsData?.friends || []).map((friend) => (
              <div key={`friend-${friend.userId}`} className="rounded-xl border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-900">{friend.name}</p>
                <p className="text-xs text-gray-500">{friend.userId}</p>
                {friend.interests.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {friend.interests.slice(0, 6).map((interest) => (
                      <span
                        key={`${friend.userId}-${interest}`}
                        className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-600"
                      >
                        {interest}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-900">Suggested Friends</h2>
        <p className="mt-1 text-sm text-gray-500">Recommendations are ranked by Jaccard similarity of interests.</p>

        {suggestions.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No suggestions available yet. Add more interests to improve matches.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((suggestion) => (
              <article key={`suggestion-${suggestion.userId}`} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{suggestion.name}</p>
                    <p className="text-xs text-gray-500">{suggestion.userId}</p>
                  </div>
                  <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">
                    {formatScore(suggestion.score)}
                  </span>
                </div>

                {suggestion.commonInterests.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Common Interests</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {suggestion.commonInterests.map((interest) => (
                        <span
                          key={`${suggestion.userId}-${interest}`}
                          className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    void handleSendRequest(suggestion.userId, suggestion.name);
                  }}
                  disabled={actionKey === `request-${suggestion.userId}`}
                  className="mt-4 w-full rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                >
                  {actionKey === `request-${suggestion.userId}` ? "Sending..." : "Add Friend"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
