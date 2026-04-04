import { useRef, useState } from 'react';
import { lookupPostalCode, updateUser } from '../api/User';

const TRANSPORT_OPTIONS = ['Walking', 'Cycling', 'Public Transport', 'Car'];

const INTEREST_OPTIONS = [
  'Badminton',
  'Basketball',
  'Football',
  'Tennis',
  'Swimming',
  'Hiking',
  'Cycling',
  'Gym',
  'Yoga',
  'Running',
];

export default function OnboardingPage({
  userId,
  email,
  onComplete,
}: {
  userId: string;
  email: string;
  onComplete: () => void;
}) {
  const [name, setName] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [transportType, setTransportType] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lookupRef = useRef(0);

  async function handlePostalCodeChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setPostalCode(digits);
    if (digits.length < 6) {
      setResolvedAddress('');
      return;
    }
    const id = ++lookupRef.current;
    setLookingUp(true);
    try {
      const result = await lookupPostalCode(digits);
      if (id === lookupRef.current) {
        setResolvedAddress(result.address);
        setError('');
      }
    } catch {
      if (id === lookupRef.current) {
        setResolvedAddress('');
        setError('No address found for this postal code.');
      }
    } finally {
      if (id === lookupRef.current) setLookingUp(false);
    }
  }

  function toggleInterest(interest: string) {
    setInterests((prev) => (prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (postalCode.length !== 6) {
      setError('Please enter a valid 6-digit Singapore postal code.');
      return;
    }
    if (!transportType) {
      setError('Please select a transport type.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const updated = await updateUser(userId, {
        name: name.trim(),
        postalCode,
        transportType,
        interests,
      });
      setResolvedAddress(updated.address);
      onComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg.includes('No address found') ? 'Invalid postal code. Please check and try again.' : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-base tracking-tight">MidMeet</span>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-1">Set up your profile</h1>
        <p className="text-sm text-gray-500 mb-2">Help your friends find the best meeting point.</p>
        <p className="text-xs text-gray-400 mb-6">Signed in as {email}</p>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alice"
              maxLength={50}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Postal Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={postalCode}
              onChange={(e) => handlePostalCodeChange(e.target.value)}
              placeholder="e.g. 530111"
              maxLength={6}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
            <p className="mt-1 text-xs text-gray-400">Your 6-digit Singapore postal code for finding meeting points.</p>
            {lookingUp && (
              <p className="mt-1.5 text-xs text-gray-400">Looking up address...</p>
            )}
            {!lookingUp && resolvedAddress && (
              <p className="mt-1.5 text-xs text-emerald-600 font-medium">{resolvedAddress}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              How do you usually travel? <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TRANSPORT_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setTransportType(opt)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    transportType === opt
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-gray-300 text-gray-700 hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Interests</label>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleInterest(opt)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                    interests.includes(opt)
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Saving...' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  );
}
