import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { fetchUserAttributes } from "aws-amplify/auth";
import { fetchCurrentUser, lookupPostalCode, updateUser } from "../api/User";
import type { User } from "../api/User";
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchFriends,
  sendFriendRequest,
  type FriendListResponse,
} from "../api/friendService";

const TRANSPORT_OPTIONS = ["Walking", "Cycling", "Public Transport", "Car"];
const INTEREST_OPTIONS = [
  "Badminton", "Basketball", "Football", "Tennis", "Swimming",
  "Hiking", "Cycling", "Gym", "Yoga", "Running",
];

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({
  userId,
  onNameChange,
}: {
  userId: string;
  onNameChange: (name: string) => void;
}) {
  const [profile, setProfile] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [transportType, setTransportType] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState(false);
  const [error, setError] = useState("");
  const lookupRef = useRef(0);

  useEffect(() => {
    fetchCurrentUser(userId).then(p => {
      if (p) { setProfile(p); setName(p.name); setPostalCode(p.postalCode || ""); setResolvedAddress(p.address || ""); setTransportType(p.transportType); setInterests(p.interests); }
      setLoading(false);
    });
  }, [userId]);

  async function handlePostalCodeChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setPostalCode(digits);
    if (digits.length < 6) {
      setResolvedAddress("");
      return;
    }
    const id = ++lookupRef.current;
    setLookingUp(true);
    try {
      const result = await lookupPostalCode(digits);
      if (id === lookupRef.current) {
        setResolvedAddress(result.address);
        setError("");
      }
    } catch {
      if (id === lookupRef.current) {
        setResolvedAddress("");
        setError("No address found for this postal code.");
      }
    } finally {
      if (id === lookupRef.current) setLookingUp(false);
    }
  }

  function toggleInterest(interest: string) {
    setInterests(prev => prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required."); return; }
    if (postalCode && postalCode.length !== 6) { setError("Please enter a valid 6-digit postal code."); return; }
    if (!transportType) { setError("Please select a transport type."); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      const updated = await updateUser(userId, { name: name.trim(), postalCode, transportType, interests });
      setProfile(updated); setResolvedAddress(updated.address); onNameChange(updated.name); setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg.includes("No address found") ? "Invalid postal code. Please check and try again." : msg);
    }
    finally { setSaving(false); }
  }

  async function handleCopyUserId() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(userId);
      } else {
        const tempInput = document.createElement("input");
        tempInput.value = userId;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
      }
      setCopiedUserId(true);
      setTimeout(() => setCopiedUserId(false), 1800);
    } catch {
      setError("Unable to copy user ID. Please copy manually.");
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[40vh]"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Account</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <div className="px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">{profile?.email}</div>
          <p className="mt-1 text-xs text-gray-400">Email cannot be changed here.</p>
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <label className="block text-sm font-medium text-gray-700">User ID</label>
            <button
              type="button"
              onClick={handleCopyUserId}
              className="px-2.5 py-1 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              {copiedUserId ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600 break-all">{userId}</div>
          <p className="mt-1 text-xs text-gray-400">Use this ID in the Friends page to send requests.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Name <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={e => { setName(e.target.value); setError(""); }} maxLength={50}
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Travel</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Postal Code</label>
          <input type="text" inputMode="numeric" value={postalCode} onChange={e => handlePostalCodeChange(e.target.value)} placeholder="e.g. 530111" maxLength={6}
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
          <p className="mt-1 text-xs text-gray-400">Your 6-digit Singapore postal code.</p>
          {lookingUp && (
            <p className="mt-1.5 text-xs text-gray-400">Looking up address...</p>
          )}
          {!lookingUp && resolvedAddress && (
            <p className="mt-1.5 text-xs text-emerald-600 font-medium">{resolvedAddress}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Transport Type <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {TRANSPORT_OPTIONS.map(opt => (
              <button key={opt} type="button" onClick={() => { setTransportType(opt); setError(""); }}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${transportType === opt ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 text-gray-700 hover:border-indigo-400"}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Interests</h2>
        <div className="flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map(opt => (
            <button key={opt} type="button" onClick={() => toggleInterest(opt)}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${interests.includes(opt) ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 text-gray-600 hover:border-indigo-400"}`}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
          {saving ? "Saving…" : "Save Changes"}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium">Saved!</span>}
      </div>
    </form>
  );
}

// ─── Friend Management Tab ────────────────────────────────────────────────────

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

function resolveRequesterName(userId: string, profileName?: string, cognitoName?: string): string {
  const profile = String(profileName || "").trim();
  if (profile) return profile;

  const name = String(cognitoName || "").trim();
  return name || userId;
}

function FriendManagementTab({ userId }: { userId: string }) {
  const [friendsData, setFriendsData] = useState<FriendListResponse | null>(null);
  const [targetUserId, setTargetUserId] = useState("");
  const [requesterName, setRequesterName] = useState(userId);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const loadData = useCallback(async (showLoader: boolean) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);

    try {
      const data = await fetchFriends(userId);
      setFriendsData(data);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      if (showLoader) setLoading(false);
      else setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [attrs, profile] = await Promise.all([
          fetchUserAttributes().catch(
            () => ({} as Record<string, string>)
          ),
          fetchCurrentUser(userId).catch(() => null),
        ]);
        if (!cancelled) {
          setRequesterName(resolveRequesterName(userId, profile?.name, attrs?.name));
        }
      } catch {
        if (!cancelled) {
          setRequesterName(userId);
        }
      }

      if (!cancelled) {
        await loadData(true);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadData, userId]);

  async function handleSendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = targetUserId.trim();

    if (!trimmed) {
      setError("Please enter a target user ID.");
      return;
    }

    if (trimmed === userId) {
      setError("You cannot send a friend request to yourself.");
      return;
    }

    setActionKey(`request-${trimmed}`);
    setError("");
    setInfo("");
    try {
      await sendFriendRequest(trimmed, {
        requesterName: requesterName || userId,
      });
      setInfo(`Friend request sent to ${trimmed}.`);
      setTargetUserId("");
      await loadData(false);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setActionKey(null);
    }
  }

  async function handleAccept(requesterUserId: string) {
    setActionKey(`accept-${requesterUserId}`);
    setError("");
    setInfo("");
    try {
      await acceptFriendRequest(requesterUserId);
      setInfo(`You are now friends with ${requesterUserId}.`);
      await loadData(false);
    } catch (acceptError) {
      setError(getErrorMessage(acceptError));
    } finally {
      setActionKey(null);
    }
  }

  async function handleDecline(requesterUserId: string) {
    setActionKey(`decline-${requesterUserId}`);
    setError("");
    setInfo("");
    try {
      await declineFriendRequest(requesterUserId);
      setInfo(`Friend request from ${requesterUserId} declined.`);
      await loadData(false);
    } catch (declineError) {
      setError(getErrorMessage(declineError));
    } finally {
      setActionKey(null);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {error && <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      {info && <div className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">{info}</div>}

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-700">Add Friend by User ID</h3>
          <button
            type="button"
            onClick={() => {
              setInfo("");
              void loadData(false);
            }}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <form onSubmit={handleSendRequest} className="flex gap-2">
          <input
            type="text"
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
            placeholder="Enter target user ID"
            className="flex-1 px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={targetUserId.trim().length === 0 || actionKey === `request-${targetUserId.trim()}`}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {actionKey === `request-${targetUserId.trim()}` ? "Sending..." : "Send"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Incoming Requests</h3>
          <span className="text-xs bg-red-100 text-red-600 font-semibold px-1.5 py-0.5 rounded-full">
            {friendsData?.incomingRequests.length || 0}
          </span>
        </div>
        {(friendsData?.incomingRequests || []).length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No incoming friend requests.</p>
        ) : (
          <ul className="space-y-3">
            {(friendsData?.incomingRequests || []).map((request) => (
              <li key={request.userId} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600 shrink-0">
                  {(request.name || request.userId)[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{request.name}</p>
                  <p className="text-xs text-gray-500 break-all">{request.userId}</p>
                  {request.interests.length > 0 && (
                    <p className="text-xs text-gray-500 truncate">{request.interests.join(", ")}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      void handleAccept(request.userId);
                    }}
                    disabled={actionKey === `accept-${request.userId}` || actionKey === `decline-${request.userId}`}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {actionKey === `accept-${request.userId}` ? "..." : "Accept"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDecline(request.userId);
                    }}
                    disabled={actionKey === `accept-${request.userId}` || actionKey === `decline-${request.userId}`}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                  >
                    {actionKey === `decline-${request.userId}` ? "..." : "Decline"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Outgoing Requests</h3>
          <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-full">
            {friendsData?.outgoingRequests.length || 0}
          </span>
        </div>
        {(friendsData?.outgoingRequests || []).length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No outgoing requests.</p>
        ) : (
          <ul className="space-y-2">
            {(friendsData?.outgoingRequests || []).map((request) => (
              <li key={request.userId} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <p className="text-sm font-semibold text-gray-800">{request.name}</p>
                <p className="text-xs text-gray-500 break-all">{request.userId}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">My Friends</h3>
          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
            {friendsData?.friends.length || 0}
          </span>
        </div>
        {(friendsData?.friends || []).length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No friends yet.</p>
        ) : (
          <ul className="space-y-3">
            {(friendsData?.friends || []).map((friend) => (
              <li key={friend.userId} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600 shrink-0">
                  {(friend.name || friend.userId)[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{friend.name}</p>
                  <p className="text-xs text-gray-500 break-all">{friend.userId}</p>
                  {friend.interests.length > 0 && (
                    <p className="text-xs text-gray-500 truncate">{friend.interests.join(", ")}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfilePage({
  userId,
  onNameChange,
}: {
  userId: string;
  onNameChange: (name: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<'profile' | 'friends'>('profile');

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your details and friends.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'profile' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          My Profile
        </button>
        <button
          onClick={() => setActiveTab('friends')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'friends' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Friend Management
        </button>
      </div>

      {activeTab === 'profile' && <ProfileTab userId={userId} onNameChange={onNameChange} />}
      {activeTab === 'friends' && <FriendManagementTab userId={userId} />}
    </div>
  );
}
