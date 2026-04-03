import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';

interface FriendProfile {
  userId: string;
  name: string;
  email?: string;
  interests: string[];
}

const VENUE_TYPES = ['Cafe', 'Park', 'Restaurant', 'Mall', 'Library', 'Sports Hall'] as const;

export default function EventCreationWizard() {
  const navigate = useNavigate();

  // Step 1 — invite friends
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);

  // Step 2 — event details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venueType, setVenueType] = useState<string>('Cafe');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFriends() {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        const apiUrl = import.meta.env.VITE_API_URL;

        if (!token || !apiUrl) throw new Error("Missing Auth token or API URL");

        const response = await fetch(`${apiUrl}/friends`, {
          method: 'GET',
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) throw new Error("Failed to fetch friends");

        const { data } = await response.json();
        
        const mappedFriends: FriendProfile[] = data.map((f: any) => ({
          userId: f.id,
          name: f.name,
          email: f.email,
          interests: f.hobbies || [] // Map the DB 'hobbies' array to 'interests'
        }));
        
        setFriends(mappedFriends);
      } catch (err) {
        console.error("Error loading friends:", err);
      } finally {
        setLoadingFriends(false);
      }
    }

    loadFriends();
  }, []);

  const canGoNext = selectedFriendIds.length > 0;

  const canCreate = useMemo(() => {
    if (!title.trim() || !dateStart || !dateEnd) return false;
    return new Date(dateStart) < new Date(dateEnd);
  }, [title, dateStart, dateEnd]);

  function toggleFriend(friendId: string) {
    setSelectedFriendIds(current =>
      current.includes(friendId)
        ? current.filter(id => id !== friendId)
        : [...current, friendId]
    );
  }

async function handleCreate() {
    if (!canCreate) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const apiUrl = import.meta.env.VITE_API_URL;

      if (!token || !apiUrl) throw new Error("Missing Auth token or API URL");

      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        venueType,
        dateRange: { start: dateStart, end: dateEnd },
        participantIds: selectedFriendIds,
      };

      const response = await fetch(`${apiUrl}/events`, {
        method: 'POST',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Failed to create event in database");
      }

      const { data: newEvent } = await response.json();
      
      navigate(`/events/${newEvent.eventId}/workspace`);
      
    } catch (err) {
      console.error(err);
      setError('Unable to create event. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm">
        <button
          onClick={() => step === 1 ? navigate(-1) : setStep(1)}
          className="mb-3 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          ← {step === 1 ? 'Back' : 'Back to Step 1'}
        </button>
        <h2 className="text-2xl font-bold text-stone-800">New Event</h2>
        <p className="mt-1 text-sm text-stone-500">
          Step {step} of 2 —{' '}
          {step === 1 ? 'Invite friends to this event' : 'Set event details & availability window'}
        </p>
        {/* Step indicator */}
        <div className="mt-3 flex gap-1.5">
          {[1, 2].map(s => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-indigo-600' : 'bg-stone-200'
              }`}
            />
          ))}
        </div>
      </header>

      {/* ── Step 1: Select Friends ── */}
      {step === 1 && (
        <article className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-stone-800">Invite Friends</h3>
          <p className="mt-1 text-sm text-stone-500">Select at least one friend to invite.</p>
          
          {loadingFriends ? (
             <div className="flex items-center gap-2 text-sm text-stone-500 py-6">
               <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
               Loading friends list...
             </div>
          ) : friends.length === 0 ? (
             <p className="text-sm text-stone-500 py-6">You don't have any friends added yet.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {friends.map(friend => {
                const selected = selectedFriendIds.includes(friend.userId);
                return (
                  <button
                    key={friend.userId}
                    type="button"
                    onClick={() => toggleFriend(friend.userId)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300'
                        : 'border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        selected ? 'bg-indigo-600 text-white' : 'bg-stone-100 text-stone-600'
                      }`}>
                        {friend.name[0]}
                      </div>
                      <div>
                        <p className="font-medium text-stone-800 text-sm">{friend.name}</p>
                        {friend.interests.length > 0 && (
                          <p className="text-xs text-stone-500 mt-0.5">
                            {friend.interests.slice(0, 2).join(', ')}
                            {friend.interests.length > 2 && ' +'}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => setStep(2)}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue →
            </button>
          </div>
        </article>
      )}

      {/* ── Step 2: Event Details ── */}
      {step === 2 && (
        <article className="rounded-2xl bg-white p-5 shadow-sm space-y-5">
          <h3 className="text-lg font-semibold text-stone-800">Event Details</h3>

          {/* Title */}
          <label className="block">
            <span className="text-sm font-medium text-stone-700">Event Title <span className="text-red-400">*</span></span>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Badminton Meetup, Sunday Brunch"
              className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          {/* Description */}
          <label className="block">
            <span className="text-sm font-medium text-stone-700">Description <span className="text-gray-400 font-normal">(optional)</span></span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Tell participants what this event is about..."
              rows={2}
              className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </label>

          {/* Venue Type */}
          <label className="block">
            <span className="text-sm font-medium text-stone-700">Venue Type</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {VENUE_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setVenueType(type)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    venueType === type
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'border-stone-200 text-stone-600 hover:border-stone-400'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </label>

          {/* Date Range */}
          {/* Date Range */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-stone-700">Availability Start <span className="text-red-400">*</span></span>
              <input
                type="date"
                value={dateStart}
                min={new Date().toLocaleDateString('en-CA')} // 'en-CA' outputs YYYY-MM-DD precisely
                onChange={e => {
                  setDateStart(e.target.value);
                  // Auto-update end date if it's now earlier than the new start date
                  if (dateEnd && e.target.value > dateEnd) {
                    setDateEnd(e.target.value);
                  }
                }}
                className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-stone-700">Availability End <span className="text-red-400">*</span></span>
              <input
                type="date"
                value={dateEnd}
                min={dateStart || new Date().toLocaleDateString('en-CA')} // End date cannot be before start date
                onChange={e => setDateEnd(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          </div>

          {/* Invited summary */}
          <div className="flex flex-wrap gap-1.5 p-3 bg-indigo-50 rounded-xl">
            <span className="text-xs text-indigo-700 font-medium">Invited:</span>
            {friends
              .filter(f => selectedFriendIds.includes(f.userId))
              .map(f => (
                <span key={f.userId} className="text-xs bg-white text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                  {f.name}
                </span>
              ))}
          </div>

          {!canCreate && (dateStart || dateEnd) && (
            <p className="text-sm text-red-500">End date must be after start date.</p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex flex-wrap justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-stone-300 px-5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-all"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!canCreate || submitting}
              onClick={handleCreate}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creating…' : '🚀 Create & Open Workspace'}
            </button>
          </div>
        </article>
      )}
    </section>
  );
}