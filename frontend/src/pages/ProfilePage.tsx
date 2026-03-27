import { useState, useEffect } from "react";
import { fetchCurrentUser, updateUser } from "../api/User";
import type { User } from "../api/User";

const TRANSPORT_OPTIONS = ["Walking", "Cycling", "Public Transport", "Car"];

const INTEREST_OPTIONS = [
  "Badminton", "Basketball", "Football", "Tennis", "Swimming",
  "Hiking", "Cycling", "Gym", "Yoga", "Running",
];

export default function ProfilePage({
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
      if (p) {
        setProfile(p);
        setName(p.name);
        setAddress(p.address);
        setTransportType(p.transportType);
        setInterests(p.interests);
      }
      setLoading(false);
    });
  }, [userId]);

  function toggleInterest(interest: string) {
    setInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required."); return; }
    if (!transportType) { setError("Please select a transport type."); return; }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await updateUser(userId, {
        name: name.trim(),
        address: address.trim(),
        transportType,
        interests,
      });
      setProfile(updated);
      onNameChange(updated.name);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your personal details and preferences.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {/* Account info card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Account</h2>

          {/* Email — read only */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <div className="px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500 select-none">
              {profile?.email}
            </div>
            <p className="mt-1 text-xs text-gray-400">Email cannot be changed here.</p>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
              maxLength={50}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>
        </div>

        {/* Travel info card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Travel</h2>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Home Address</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="e.g. Bishan, Singapore"
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          {/* Transport Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Transport Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TRANSPORT_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => { setTransportType(opt); setError(""); }}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    transportType === opt
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "border-gray-300 text-gray-700 hover:border-indigo-400 hover:text-indigo-600"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Interests card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Interests</h2>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => toggleInterest(opt)}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  interests.includes(opt)
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          {saved && (
            <span className="text-sm text-emerald-600 font-medium">Saved!</span>
          )}
        </div>

      </form>
    </div>
  );
}
