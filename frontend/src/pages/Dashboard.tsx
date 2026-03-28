import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDashboardData } from '../api/eventService';
import type { DashboardData } from '../types/event';

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData().then((dashboardData) => {
      setData(dashboardData);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="rounded-xl bg-white p-6 shadow-sm">Loading dashboard...</div>;
  }

  if (!data) {
    return <div className="rounded-xl bg-white p-6 shadow-sm">Unable to load dashboard.</div>;
  }

  return (
    <section className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-r from-amber-200 via-yellow-100 to-orange-100 p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-stone-800">Dashboard</h2>
        <p className="mt-2 text-sm text-stone-700">
          Check your next plans, pending invites, and activity updates.
        </p>
        <Link
          to="/events/new"
          className="mt-4 inline-block rounded-lg bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-900"
        >
          Create New Event
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-stone-800">Upcoming Events</h3>
          <ul className="mt-3 space-y-3">
            {data.upcomingEvents.length === 0 && <li className="text-sm text-stone-500">No upcoming events yet.</li>}
            {data.upcomingEvents.map((event) => (
              <li key={event.eventId} className="rounded-xl border border-stone-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-stone-800">{event.venueType}</span>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">{event.status}</span>
                </div>
                <p className="mt-1 text-sm text-stone-600">{formatDateTime(event.selectedTime)}</p>
                <p className="mt-1 text-sm text-stone-600">{event.selectedVenue}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-stone-800">Pending Invites</h3>
          <ul className="mt-3 space-y-3">
            {data.pendingInvites.length === 0 && <li className="text-sm text-stone-500">No pending invites.</li>}
            {data.pendingInvites.map((invite) => (
              <li key={invite.eventId} className="rounded-xl border border-stone-200 p-3">
                <p className="text-sm font-medium text-stone-800">
                  {invite.fromUser} invited you to a {invite.venueType} event.
                </p>
                <p className="mt-1 text-sm text-stone-600">{formatDateTime(invite.suggestedTime)}</p>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-stone-800">System Notifications</h3>
        <ul className="mt-3 space-y-3">
          {data.notifications.length === 0 && <li className="text-sm text-stone-500">No new notifications.</li>}
          {data.notifications.map((item) => (
            <li key={item.id} className="rounded-xl border border-stone-200 p-3">
              <p className="text-sm font-semibold text-stone-800">{item.title}</p>
              <p className="mt-1 text-sm text-stone-600">{item.detail}</p>
              <p className="mt-1 text-xs text-stone-500">{formatDateTime(item.createdAt)}</p>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}
