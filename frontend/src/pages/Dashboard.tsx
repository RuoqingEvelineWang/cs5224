import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import { STATUS_LABELS, STATUS_COLORS } from '../api/Event.tsx';
import type { EventDetail } from '../api/Event.tsx';

const VENUE_ICONS: Record<string, string> = {
  'Sports Hall': '🏸',
  Cafe: '☕',
  Restaurant: '🍽',
  Park: '🌳',
  Mall: '🛍',
  Library: '📚',
};

// Formats an ISO string into a readable Singapore time
function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch (e) {
    return iso; // Fallback if date is malformed
  }
}

// Temporary interface for the mapped dashboard data
interface DashboardData {
  upcomingEvents: any[];
  pendingInvites: any[];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        const userId = session.tokens?.idToken?.payload?.sub as string;
        const apiUrl = import.meta.env.VITE_API_URL;

        if (!token || !apiUrl) {
          throw new Error('Missing Auth token or API URL');
        }

        // Fetch all events for this user
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

        const { data: responseData } = await response.json();
        const allEvents = responseData as EventDetail[];

        // 1. Extract Pending Invites
        const pending = allEvents
          .filter(e => 
            e.status === 'COLLECTING_AVAILABILITY' && 
            !e.availabilitySubmittedBy?.includes(userId) && 
            e.creatorId !== userId &&
            !e.declinedUserIds?.includes(userId)
          )
          .map(e => ({
            eventId: e.eventId,
            title: e.title,
            venueType: e.venueType,
            fromUser: e.creatorName || e.creatorId,
            dateRange: e.dateRange
          }));

        // 2. Extract Upcoming Events (Awaiting Confirmation or Finalized)
        const upcoming = allEvents
          .filter(e => 
            (e.status === 'FINALIZED' || e.status === 'AWAITING_CONFIRMATION') &&
            !e.declinedUserIds?.includes(userId)
          )
          .map(e => {
            // Convert the DB's selectedTime object into an ISO string for formatting
            let isoTime = '';
            if (e.selectedTime) {
              const hour = e.selectedTime.startHour.toString().padStart(2, '0');
              isoTime = `${e.selectedTime.date}T${hour}:00:00+08:00`;
            } else if (e.dateRange) {
              isoTime = `${e.dateRange.start}T00:00:00+08:00`;
            }

            return {
              eventId: e.eventId,
              title: e.title,
              status: e.status,
              venueType: e.venueType,
              selectedTime: isoTime,
              selectedVenue: e.selectedVenue?.name || 'Venue TBD'
            };
          })
          // Sort chronologically and take only the top 3
          .sort((a, b) => a.selectedTime.localeCompare(b.selectedTime))
          .slice(0, 3);

        setData({ upcomingEvents: upcoming, pendingInvites: pending });

      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }
  
  if (!data) {
    return <div className="rounded-xl bg-white p-6 shadow-sm text-sm text-gray-500">Unable to load dashboard.</div>;
  }

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-amber-200 via-yellow-100 to-orange-100 p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-stone-800">Dashboard</h2>
        <p className="mt-2 text-sm text-stone-700">Check your next plans and pending invites.</p>
        <Link
          to="/events/new"
          className="mt-4 inline-block rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-900"
        >
          Create New Event
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2">

        {/* ── Upcoming Events ── */}
        <article className="rounded-2xl bg-white p-5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-stone-800">Upcoming Events</h3>
            <Link to="/events" className="text-xs text-indigo-600 font-medium hover:underline">View More →</Link>
          </div>

          {data.upcomingEvents.length === 0 ? (
            <p className="text-sm text-stone-500">No upcoming events yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.upcomingEvents.map(event => {
                const icon = VENUE_ICONS[event.venueType] ?? '📅';
                const isFinalized = event.status === 'FINALIZED';
                return (
                  <li key={event.eventId} className="rounded-xl border border-stone-200 p-3 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base">{icon}</span>
                      <span className="font-medium text-stone-800 text-sm flex-1 min-w-0 truncate">{event.title}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[event.status as keyof typeof STATUS_COLORS]}`}>
                        {STATUS_LABELS[event.status as keyof typeof STATUS_LABELS]}
                      </span>
                    </div>
                    <p className="text-xs text-stone-500">{event.venueType}</p>
                    <p className="text-sm text-stone-600">{formatDate(event.selectedTime)}</p>
                    {event.selectedVenue !== 'Venue TBD' && (
                      <p className="text-sm text-stone-600">{event.selectedVenue}</p>
                    )}
                    <button
                      onClick={() => isFinalized
                        ? navigate(`/events/${event.eventId}/details`)
                        : navigate(`/events/${event.eventId}/workspace`)
                      }
                      className="mt-1 text-xs text-indigo-600 font-medium hover:underline"
                    >
                      {isFinalized ? 'View Details →' : 'Open Workspace →'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        {/* ── Pending Invitations ── */}
        <article className="rounded-2xl bg-white p-5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-stone-800">Pending Invitations</h3>
            {data.pendingInvites.length > 0 && (
              <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-2 py-0.5 rounded-full">
                {data.pendingInvites.length} new
              </span>
            )}
          </div>

          {data.pendingInvites.length === 0 ? (
            <p className="text-sm text-stone-500">No pending invitations.</p>
          ) : (
            <ul className="space-y-3">
              {data.pendingInvites.map(invite => (
                <li key={invite.eventId} className="rounded-xl border border-orange-100 bg-orange-50 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-lg shrink-0">{VENUE_ICONS[invite.venueType] ?? '📅'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-800 truncate">{invite.title}</p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {invite.venueType} · invited by <span className="font-medium">{invite.fromUser}</span>
                      </p>
                      <p className="text-xs text-stone-400">
                        {invite.dateRange?.start}
                        {invite.dateRange?.start !== invite.dateRange?.end ? ` – ${invite.dateRange?.end}` : ''}
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/events/${invite.eventId}/workspace`}
                    className="block w-full text-center py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors"
                  >
                    Submit Availability →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}