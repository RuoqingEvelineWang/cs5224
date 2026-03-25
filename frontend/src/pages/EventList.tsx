import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchEvents } from "../api/Event.tsx";
import type { Event } from "../api/Event.tsx";

const VENUE_ICONS: Record<string, string> = {
  "Sports Hall": "🏸",
  Cafe: "☕",
  Restaurant: "🍽",
  Park: "🌳",
};

const MOCK_VENUE_TYPES = ["Sports Hall", "Restaurant", "Cafe"];

export default function EventList() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents().then(data => {
      setEvents(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <span className="text-sm text-gray-500">Loading events…</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Your Events</h2>
        <Link
          to="/create"
          className="text-sm px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 active:scale-95 transition-all"
        >
          + New Event
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <span className="text-4xl">📅</span>
          <p className="text-gray-500 text-sm">No events yet. Create one to get started!</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((e, i) => {
            const venueType = MOCK_VENUE_TYPES[i % MOCK_VENUE_TYPES.length];
            const icon = VENUE_ICONS[venueType] ?? "📅";
            return (
              <li key={e.eventId}>
                <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
                  <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-xl shrink-0">
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {e.title ?? e.eventId}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{venueType}</p>
                  </div>
                  <Link
                    to={`/events/${e.eventId}/workspace`}
                    className="shrink-0 text-sm px-4 py-1.5 rounded-xl border border-indigo-200 text-indigo-600 font-medium hover:bg-indigo-50 transition-colors"
                  >
                    Open →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
