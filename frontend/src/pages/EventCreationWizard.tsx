import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createBaseEvent, fetchFriends } from '../api/eventService';
import type { FriendProfile, VenueType } from '../types/event';

const VENUE_TYPES: VenueType[] = ['Cafe', 'Park', 'Restaurant', 'Mall', 'Library'];

export default function EventCreationWizard() {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [venueType, setVenueType] = useState<VenueType>('Cafe');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFriends().then(setFriends);
  }, []);

  const canGoNext = selectedFriendIds.length > 0;
  const canCreate = useMemo(() => {
    if (!dateStart || !dateEnd) return false;
    return new Date(dateStart).getTime() < new Date(dateEnd).getTime();
  }, [dateEnd, dateStart]);

  function toggleFriend(friendId: string) {
    setSelectedFriendIds((current) =>
      current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId],
    );
  }

  async function handleCreate() {
    if (!canCreate || selectedFriendIds.length === 0) return;

    try {
      setSubmitting(true);
      setError(null);
      await createBaseEvent({
        participantIds: selectedFriendIds,
        venueType,
        dateStart,
        dateEnd,
      });
      navigate('/');
    } catch {
      setError('Unable to create event. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold text-stone-800">Event Creation Wizard</h2>
        <p className="mt-2 text-sm text-stone-600">
          Step {step} of 2. Build a base event first, then availability and venue voting can happen in Event Workspace.
        </p>
      </header>

      {step === 1 && (
        <article className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-stone-800">Step 1: Select Friends</h3>
          <p className="mt-1 text-sm text-stone-600">Choose at least one friend for this event.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {friends.map((friend) => {
              const selected = selectedFriendIds.includes(friend.userId);
              return (
                <button
                  key={friend.userId}
                  type="button"
                  onClick={() => toggleFriend(friend.userId)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected ? 'border-amber-500 bg-amber-50' : 'border-stone-200 hover:border-stone-400'
                  }`}
                >
                  <p className="font-medium text-stone-800">{friend.name}</p>
                  <p className="mt-1 text-xs text-stone-600">{friend.interests.join(', ')}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => setStep(2)}
              className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </article>
      )}

      {step === 2 && (
        <article className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-stone-800">Step 2: Venue Type & Date Range</h3>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-stone-700">Venue Type</span>
              <select
                className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-amber-500"
                value={venueType}
                onChange={(e) => setVenueType(e.target.value as VenueType)}
              >
                {VENUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-stone-700">Date Start</span>
                <input
                  type="datetime-local"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-amber-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-stone-700">Date End</span>
                <input
                  type="datetime-local"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-amber-500"
                />
              </label>
            </div>
          </div>

          {!canCreate && (dateStart || dateEnd) && (
            <p className="mt-3 text-sm text-red-600">End time must be later than start time.</p>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-5 flex flex-wrap justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:border-stone-400"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canCreate || submitting}
              onClick={handleCreate}
              className="rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Base Event'}
            </button>
          </div>
        </article>
      )}
    </section>
  );
}


