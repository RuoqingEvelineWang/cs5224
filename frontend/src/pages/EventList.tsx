import { useEffect, useState } from "react";
import { fetchEvents } from "../api/Event.tsx";
import type { Event } from "../api/Event.tsx";

export default function EventList() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents().then(data => {
      setEvents(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-gray-500">Loading events...</div>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Events</h2>

      {events.length === 0 && <div className="text-gray-500">No events</div>}

      {events.map(e => (
        <div key={e.eventId} className="py-2 border-b border-gray-200 text-gray-800">{e.eventId}</div>
      ))}
    </div>
  );
}