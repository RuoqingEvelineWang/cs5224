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

  if (loading) return <div>Loading events...</div>;

  return (
    <div>
      <h2>Events</h2>

      {events.length === 0 && <div>No events</div>}

      {events.map(e => (
        <div key={e.eventId}>{e.eventId}</div>
      ))}
    </div>
  );
}