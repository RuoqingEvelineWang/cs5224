import { useState, useEffect } from "react";
import {
  fetchCurrentUser, updateUser,
  fetchFriends, fetchFriendRequests,
  acceptFriendRequest, declineFriendRequest,
  removeFriend, searchUsers, sendFriendRequest,
} from "../api/User";
import type { User, FriendEntry, FriendRequest } from "../api/User";

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
  const [address, setAddress] = useState("");
  const [transportType, setTransportType] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCurrentUser(userId).then(p => {
      if (p) { setProfile(p); setName(p.name); setAddress(p.address); setTransportType(p.transportType); setInterests(p.interests); }
      setLoading(false);
    });
  }, [userId]);

  function toggleInterest(interest: string) {
    setInterests(prev => prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required."); return; }
    if (!transportType) { setError("Please select a transport type."); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      const updated = await updateUser(userId, { name: name.trim(), address: address.trim(), transportType, interests });
      setProfile(updated); onNameChange(updated.name); setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { setError("Something went wrong. Please try again."); }
    finally { setSaving(false); }
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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Name <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={e => { setName(e.target.value); setError(""); }} maxLength={50}
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Travel</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Home Address</label>
          <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. Bishan, Singapore"
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
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

function FriendManagementTab() {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchFriends(), fetchFriendRequests()]).then(([f, r]) => {
      setFriends(f); setRequests(r); setLoading(false);
    });
  }, []);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const results = await searchUsers(searchQuery);
    setSearchResults(results);
    setSearching(false);
  }

  async function handleAccept(req: FriendRequest) {
    setActioningId(req.requestId);
    await acceptFriendRequest(req.requestId);
    const [f, r] = await Promise.all([fetchFriends(), fetchFriendRequests()]);
    setFriends(f); setRequests(r);
    setActioningId(null);
  }

  async function handleDeclineReq(req: FriendRequest) {
    setActioningId(req.requestId);
    await declineFriendRequest(req.requestId);
    setRequests(r => r.filter(x => x.requestId !== req.requestId));
    setActioningId(null);
  }

  async function handleRemoveFriend(friendId: string) {
    setActioningId(friendId);
    await removeFriend(friendId);
    setFriends(f => f.filter(x => x.userId !== friendId));
    setActioningId(null);
  }

  async function handleSendRequest(user: FriendEntry) {
    setActioningId(user.userId);
    await sendFriendRequest(user.userId, user.name);
    setSentIds(prev => new Set([...prev, user.userId]));
    setActioningId(null);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">

      {/* ── Friend Requests ── */}
      {requests.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-700">Friend Requests</h3>
            <span className="text-xs bg-red-100 text-red-600 font-semibold px-1.5 py-0.5 rounded-full">{requests.length}</span>
          </div>
          <ul className="space-y-3">
            {requests.map(req => (
              <li key={req.requestId} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600 shrink-0">
                  {req.fromName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{req.fromName}</p>
                  <p className="text-xs text-gray-500 truncate">{req.fromInterests.join(', ')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleAccept(req)} disabled={actioningId === req.requestId}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {actioningId === req.requestId ? '…' : 'Accept'}
                  </button>
                  <button onClick={() => handleDeclineReq(req)} disabled={actioningId === req.requestId}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Current Friends ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">My Friends</h3>
          <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{friends.length}</span>
        </div>
        {friends.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No friends yet. Use the search below to add some!</p>
        ) : (
          <ul className="space-y-3">
            {friends.map(friend => (
              <li key={friend.userId} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600 shrink-0">
                  {friend.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{friend.name}</p>
                  <p className="text-xs text-gray-500 truncate">{friend.interests.join(', ')}</p>
                  {friend.since && <p className="text-xs text-gray-400 mt-0.5">Friends since {friend.since}</p>}
                </div>
                <button
                  onClick={() => handleRemoveFriend(friend.userId)}
                  disabled={actioningId === friend.userId}
                  className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                >
                  {actioningId === friend.userId ? '…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Search & Add ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Add Friends</h3>
        <div className="flex gap-2">
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name or email…"
            className="flex-1 px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {searching ? '…' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <ul className="space-y-2">
            {searchResults.map(user => {
              const sent = sentIds.has(user.userId);
              return (
                <li key={user.userId} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-sm font-bold text-stone-600 shrink-0">
                    {user.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{user.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user.interests.join(', ')}</p>
                  </div>
                  <button
                    onClick={() => handleSendRequest(user)}
                    disabled={sent || actioningId === user.userId}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      sent
                        ? 'bg-gray-100 text-gray-400 cursor-default'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'
                    }`}
                  >
                    {sent ? 'Sent ✓' : actioningId === user.userId ? '…' : 'Add Friend'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {searchResults.length === 0 && searchQuery && !searching && (
          <p className="text-sm text-gray-400 text-center py-2">No users found for "{searchQuery}".</p>
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
      {activeTab === 'friends' && <FriendManagementTab />}
    </div>
  );
}
