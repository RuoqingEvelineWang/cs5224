import { useEffect, useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { useNavigate } from "react-router-dom";

export default function EventList() {
  const [events, setEvents] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    const session = await fetchAuthSession();
    const token = session.tokens.idToken.toString();

    const res = await fetch("YOUR_API/events", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    setEvents(data);
  };

  return (
    <div>
      <h2>Your Events</h2>
      {events.map(e => (
        <div key={e.eventId}>{e.eventId}</div>
      ))}
      <button onClick={() => navigate("/create")}>
        Create New Event
      </button>
    </div>
  );
}