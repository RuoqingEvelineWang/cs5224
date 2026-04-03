import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  STATUS_LABELS,
  STATUS_COLORS,
} from '../api/Event.tsx';
import type { EventDetail } from '../api/Event.tsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const VENUE_ICONS: Record<string, string> = {
  'Sports Hall': '🏸',
  Cafe: '☕',
  Restaurant: '🍽',
  Park: '🌳',
  Mall: '🛍',
  Library: '📚',
};

const ALL_VENUE_TYPES = ['All', 'Cafe', 'Park', 'Restaurant', 'Mall', 'Library', 'Sports Hall'];

type SortKey = 'time' | 'distance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyFiltersAndSort(events: EventDetail[], search: string, venueType: string, sort: SortKey): EventDetail[] {
  const q = search.trim().toLowerCase();
  const filtered = events.filter(e => {
    if (q && !e.title.toLowerCase().includes(q) && !e.venueType.toLowerCase().includes(q)) return false;
    if (venueType !== 'All' && e.venueType !== venueType) return false;
    return true;
  });
  return [...filtered].sort((a, b) => {
    if (sort === 'time') {
      const aDate = a.selectedTime ? a.selectedTime.date : a.dateRange.start;
      const bDate = b.selectedTime ? b.selectedTime.date : b.dateRange.start;
      return aDate.localeCompare(bDate);
    }
    const aDist = a.selectedVenue?.distanceKm ?? Infinity;
    const bDist = b.selectedVenue?.distanceKm ?? Infinity;
    return aDist - bDist;
  });
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  search, onSearch, venueType, onVenueType, sort, onSort,
}: {
  search: string; onSearch: (v: string) => void;
  venueType: string; onVenueType: (v: string) => void;
  sort: SortKey; onSort: (v: SortKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <input
        type="search"
        placeholder="Search events…"
        value={search}
        onChange={e => onSearch(e.target.value)}
        className="flex-1 min-w-40 rounded-xl border border-stone-300 px-4 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
      <select
        value={venueType}
        onChange={e => onVenueType(e.target.value)}
        className="rounded-xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-indigo-400 bg-white"
      >
        {ALL_VENUE_TYPES.map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>)}
      </select>
      <div className="flex gap-1 p-1 bg-stone-100 rounded-xl">
        <button onClick={() => onSort('time')}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${sort === 'time' ? 'bg-white text-indigo-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
          By Time
        </button>
        <button onClick={() => onSort('distance')}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${sort === 'distance' ? 'bg-white text-indigo-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
          By Distance
        </button>
      </div>
    </div>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({
  event, action, badgeOverride, dimmed = false,
}: {
  event: EventDetail;
  action: React.ReactNode;
  badgeOverride?: React.ReactNode;
  dimmed?: boolean;
}) {
  const icon = VENUE_ICONS[event.venueType] ?? '📅';
  return (
    <div className={`bg-white rounded-2xl border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow ${dimmed ? 'border-amber-200 opacity-80' : 'border-stone-200'}`}>
      <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-xl shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-stone-900 truncate">{event.title}</p>
          {badgeOverride ?? (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[event.status]}`}>
              {STATUS_LABELS[event.status]}
            </span>
          )}
        </div>
        <p className="text-xs text-stone-500 mt-0.5">
          {event.venueType} · {event.dateRange?.start}
          {event.dateRange?.start !== event.dateRange?.end ? ` – ${event.dateRange?.end}` : ''}
          {event.selectedVenue && <span className="ml-1 text-stone-400">· {event.selectedVenue.distanceKm.toFixed(1)} km</span>}
        </p>
        <p className="text-xs text-stone-400 mt-0.5">
          {event.participants?.map(p => p.name || p.userId).join(', ')}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">{label}</p>
      {count !== undefined && count > 0 && (
        <span className="text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EventList() {
  const navigate = useNavigate();

  const [myEvents, setMyEvents] = useState<EventDetail[]>([]);
  const [pendingInvites, setPendingInvites] = useState<EventDetail[]>([]);
  const [pendingRejoin, setPendingRejoin] = useState<EventDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [venueType, setVenueType] = useState('All');
  const [sort, setSort] = useState<SortKey>('time');

  useEffect(() => {
    async function fetchAllData() {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        const userId = session.tokens?.idToken?.payload?.sub as string;
        const apiUrl = import.meta.env.VITE_API_URL;

        console.log("Debug - Token exists:", !!token);
        console.log("Debug - API URL is:", apiUrl);
        console.log("Debug - User ID is:", userId);

        if (!token || !apiUrl) {
          throw new Error('Missing Auth token or API URL');
        }

        // Fetch all events for this user from the single API endpoint
        const response = await fetch(`${apiUrl}/events`, {
          method: 'GET',
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.statusText}`);
        }

        const { data } = await response.json();
        const allEvents = data as EventDetail[];

        // Bucket the events based on the user's status within them
        const mine: EventDetail[] = [];
        const invites: EventDetail[] = [];
        const rejoin: EventDetail[] = [];

        allEvents.forEach((event) => {
          const hasDeclined = event.declinedUserIds?.includes(userId);
          const hasSubmitted = event.availabilitySubmittedBy?.includes(userId);
          const isCreator = event.creatorId === userId;

          if (hasDeclined) {
            rejoin.push(event);
          } else if (event.status === 'COLLECTING_AVAILABILITY' && !hasSubmitted && !isCreator) {
            invites.push(event);
          } else {
            mine.push(event);
          }
        });

        setMyEvents(mine);
        setPendingInvites(invites);
        setPendingRejoin(rejoin);

      } catch (error) {
        console.error('Failed to load events:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchAllData();
  }, []);

  async function handleRejoin(eventId: string) {
    setJoiningId(eventId);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const apiUrl = import.meta.env.VITE_API_URL;

      // Call the confirm endpoint to rejoin
      const response = await fetch(`${apiUrl}/events/${eventId}/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': token || '',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to rejoin event');
      
      setJoiningId(null);
      navigate(`/events/${eventId}/workspace`);
    } catch (error) {
      console.error('Error rejoining event:', error);
      setJoiningId(null);
    }
  }

  // Separate active events by group
  const activeEvents = applyFiltersAndSort(
    myEvents.filter(e => e.status === 'COLLECTING_AVAILABILITY' || e.status === 'SELECTING_VENUE'),
    search, venueType, sort
  );
  const awaitingEvents = applyFiltersAndSort(
    myEvents.filter(e => e.status === 'AWAITING_CONFIRMATION'),
    search, venueType, sort
  );
  const finalizedEvents = applyFiltersAndSort(
    myEvents.filter(e => e.status === 'FINALIZED'),
    search, venueType, sort
  );
  const filteredInvites = applyFiltersAndSort(pendingInvites, search, venueType, sort);
  const filteredRejoin = applyFiltersAndSort(pendingRejoin, search, venueType, sort);

  const totalCount = myEvents.length + pendingInvites.length + pendingRejoin.length;
  const hasAny = totalCount > 0;

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <span className="text-sm text-stone-500">Loading events…</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-stone-800">MyEvents</h2>
          {totalCount > 0 && (
            <p className="text-xs text-stone-400 mt-0.5">{totalCount} event{totalCount !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <FilterBar search={search} onSearch={setSearch} venueType={venueType} onVenueType={setVenueType} sort={sort} onSort={setSort} />

      {!hasAny ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <span className="text-4xl">📅</span>
          <p className="text-stone-500 text-sm">No events yet. Use <strong>New Event</strong> in the top nav to get started!</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── Pending Invitations: invited but haven't submitted ── */}
          {filteredInvites.length > 0 && (
            <section className="space-y-3">
              <SectionHeader label="Pending Invitations" count={filteredInvites.length} />
              <ul className="space-y-3">
                {filteredInvites.map(event => {
                  const submitted = event.availabilitySubmittedBy ?? [];
                  const total = event.participants?.length || 0;
                  return (
                    <li key={event.eventId}>
                      <EventCard
                        event={event}
                        badgeOverride={
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                            Awaiting Your Vote
                          </span>
                        }
                        action={
                          <Link
                            to={`/events/${event.eventId}/workspace`}
                            className="text-sm px-4 py-1.5 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 active:scale-95 transition-all whitespace-nowrap"
                          >
                            Submit →
                          </Link>
                        }
                      />
                      <p className="text-xs text-stone-400 mt-1 ml-1">
                        {submitted.length}/{total} submitted · invited by {event.creatorName || 'Creator'}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── Active: collecting / selecting ── */}
          {activeEvents.length > 0 && (
            <section className="space-y-3">
              <SectionHeader label="In Progress" count={activeEvents.length} />
              <ul className="space-y-3">
                {activeEvents.map(event => (
                  <li key={event.eventId}>
                    <EventCard
                      event={event}
                      action={
                        <Link
                          to={`/events/${event.eventId}/workspace`}
                          className="text-sm px-4 py-1.5 rounded-xl border border-indigo-200 text-indigo-600 font-medium hover:bg-indigo-50 transition-colors whitespace-nowrap"
                        >
                          Open →
                        </Link>
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Awaiting confirmation (you've confirmed) ── */}
          {awaitingEvents.length > 0 && (
            <section className="space-y-3">
              <SectionHeader label="Awaiting Confirmation" count={awaitingEvents.length} />
              <ul className="space-y-3">
                {awaitingEvents.map(event => {
                  const confirmed = event.confirmedUserIds ?? [];
                  const total = event.participants?.length || 0;
                  return (
                    <li key={event.eventId}>
                      <EventCard
                        event={event}
                        action={
                          <Link
                            to={`/events/${event.eventId}/workspace`}
                            className="text-sm px-4 py-1.5 rounded-xl border border-violet-200 text-violet-600 font-medium hover:bg-violet-50 transition-colors whitespace-nowrap"
                          >
                            View →
                          </Link>
                        }
                      />
                      <p className="text-xs text-stone-400 mt-1 ml-1">
                        {confirmed.length}/{total} confirmed
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── Finalized / Confirmed ── */}
          {finalizedEvents.length > 0 && (
            <section className="space-y-3">
              <SectionHeader label="Confirmed Events" count={finalizedEvents.length} />
              <ul className="space-y-3">
                {finalizedEvents.map(event => (
                  <li key={event.eventId}>
                    <EventCard
                      event={event}
                      action={
                        <Link
                          to={`/events/${event.eventId}/details`}
                          className="text-sm px-4 py-1.5 rounded-xl border border-green-200 text-green-700 font-medium hover:bg-green-50 transition-colors whitespace-nowrap"
                        >
                          Details →
                        </Link>
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Pending Rejoin: left events ── */}
          {filteredRejoin.length > 0 && (
            <section className="space-y-3">
              <SectionHeader label="Left — Can Rejoin" count={filteredRejoin.length} />
              <ul className="space-y-3">
                {filteredRejoin.map(event => (
                  <li key={event.eventId}>
                    <EventCard
                      event={event}
                      dimmed
                      badgeOverride={
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          Pending
                        </span>
                      }
                      action={
                        <button
                          onClick={() => handleRejoin(event.eventId)}
                          disabled={joiningId === event.eventId}
                          className="text-sm px-4 py-1.5 rounded-xl border border-amber-300 text-amber-700 font-medium hover:bg-amber-50 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
                        >
                          {joiningId === event.eventId ? 'Rejoining…' : 'Rejoin →'}
                        </button>
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}