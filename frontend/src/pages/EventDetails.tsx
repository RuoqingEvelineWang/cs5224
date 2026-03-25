import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { EventDetail, TimeSlot, Venue } from "../api/Event.tsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(slot: TimeSlot): string {
  const d = new Date(slot.date + "T00:00:00");
  const dayStr = d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const hour = slot.startHour;
  const timeStr = hour < 12
    ? `${hour}:00 AM`
    : hour === 12
    ? "12:00 PM"
    : `${hour - 12}:00 PM`;
  return `${dayStr}, ${timeStr}`;
}

// ─── Detail Row ───────────────────────────────────────────────────────────────

function DetailRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-4 border-b border-gray-100 last:border-0">
      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-lg shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
        <div className="text-gray-900">{children}</div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface LocationState {
  event: EventDetail;
  selectedSlot: TimeSlot;
  selectedVenue: Venue;
}

export default function EventDetails() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  // If navigated directly without state (e.g. refresh), show a fallback
  if (!state?.event || !state?.selectedSlot || !state?.selectedVenue) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <div className="text-5xl">🔍</div>
        <h2 className="text-xl font-semibold text-gray-800">Details Unavailable</h2>
        <p className="text-gray-500 text-sm">
          We couldn't load the event details. This can happen after a page refresh.
        </p>
        <button
          onClick={() => navigate("/")}
          className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Back to Events
        </button>
      </div>
    );
  }

  const { event, selectedSlot, selectedVenue } = state;

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">

      {/* ── Success Banner ── */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">
            🎉
          </div>
          <div>
            <p className="text-indigo-100 text-sm font-medium">Event Confirmed</p>
            <h1 className="text-xl font-bold leading-tight">{event.title}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {event.participants.map(p => (
            <span
              key={p.userId}
              className="inline-flex items-center gap-1 text-xs bg-white/20 text-white px-2.5 py-1 rounded-full"
            >
              <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center font-bold text-[10px]">
                {p.name[0]}
              </span>
              {p.name}
            </span>
          ))}
        </div>
      </div>

      {/* ── Details Card ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5">
        <DetailRow icon="📅" label="Date & Time">
          <p className="font-medium text-gray-900">{formatDateTime(selectedSlot)}</p>
        </DetailRow>

        <DetailRow icon="📍" label="Venue">
          <p className="font-medium text-gray-900">{selectedVenue.name}</p>
          <p className="text-sm text-gray-500 mt-0.5">{selectedVenue.address}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span>⭐ {selectedVenue.rating.toFixed(1)}</span>
            <span>🗺 {selectedVenue.distanceKm.toFixed(1)} km</span>
            <span>⏱ ~{selectedVenue.estimatedMinutes} min</span>
          </div>
        </DetailRow>

        <DetailRow icon="👥" label="Attendees">
          <ul className="space-y-1.5">
            {event.participants.map(p => (
              <li key={p.userId} className="flex items-center gap-2 text-sm">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-semibold text-[11px]">
                  {p.name[0]}
                </span>
                <span className="text-gray-800">{p.name}</span>
              </li>
            ))}
          </ul>
        </DetailRow>

        <DetailRow icon="🏷" label="Venue Type">
          <p className="text-gray-800">{event.venueType}</p>
        </DetailRow>
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => navigate("/")}
          className="flex-1 py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-medium transition-all text-center"
        >
          Back to Home
        </button>
        <button
          onClick={() => navigate(`/events/${eventId}/workspace`)}
          className="flex-1 py-2.5 px-5 rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-95 text-gray-600 text-sm font-medium transition-all text-center"
        >
          View Workspace
        </button>
      </div>

    </div>
  );
}
