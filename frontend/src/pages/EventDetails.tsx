import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchAuthSession } from "aws-amplify/auth";
import type { EventDetail, TimeSlot, Venue } from "../api/Event.tsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(slot: TimeSlot): string {
  if (!slot?.date) return "Time TBD";
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

  const [event, setEvent] = useState<EventDetail | null>(state?.event ?? null);
  const [loading, setLoading] = useState(!state?.event);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadEvent() {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        const userId = session.tokens?.idToken?.payload?.sub as string;
        setCurrentUserId(userId);

        if (state?.event || !eventId) {
          setLoading(false);
          return;
        }

        const apiUrl = import.meta.env.VITE_API_URL;
        if (!token || !apiUrl) throw new Error("Missing Auth token or API URL");

        // NEW: Hit the specific event API endpoint
        const response = await fetch(`${apiUrl}/events/${eventId}`, {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          if (response.status === 404) {
             setEvent(null);
             return;
          }
          throw new Error("Failed to fetch event");
        }
        
        // The data is now a single object instead of an array
        const { data } = await response.json();
        setEvent(data);

      } catch (err) {
        console.error("Error loading event details:", err);
      } finally {
        setLoading(false);
      }
    }

    loadEvent();
  }, [eventId, state?.event]);

  async function handleRevertAndExit() {
    if (!eventId) return;
    setReverting(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const apiUrl = import.meta.env.VITE_API_URL;

      // Note: You will need to build this API endpoint in your Lambda later!
      const response = await fetch(`${apiUrl}/events/${eventId}/unfinalize`, {
        method: 'POST',
        headers: {
          'Authorization': token || '',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error("Failed to revert event");

      navigate(`/events/${eventId}/workspace`, { replace: true });
    } catch (err) {
      console.error("Error reverting event:", err);
      alert("Failed to revert event. Check console for details.");
    } finally {
      setReverting(false);
      setShowRevertConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading details…</span>
        </div>
      </div>
    );
  }

  // Derive slot and venue: prefer navigation state, fall back to event's stored data
  const selectedSlot = state?.selectedSlot ?? event?.selectedTime;
  const selectedVenue = state?.selectedVenue ?? event?.selectedVenue;

  if (!event || !selectedSlot || !selectedVenue) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <div className="text-5xl">🔍</div>
        <h2 className="text-xl font-semibold text-gray-800">Details Unavailable</h2>
        <p className="text-gray-500 text-sm">
          This event hasn't been finalized yet, or the details could not be loaded.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="mt-2 px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">

      {/* ── Revert Confirmation Dialog ── */}
      {showRevertConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Revert this event?</h3>
            <p className="text-sm text-gray-500">
              The selected venue and time will be cleared. The event will return to venue selection so a different venue can be chosen.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleRevertAndExit}
                disabled={reverting}
                className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {reverting ? "Reverting…" : "Revert & Edit"}
              </button>
              <button
                onClick={() => setShowRevertConfirm(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Keep Confirmed
              </button>
            </div>
          </div>
        </div>
      )}

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
          {event.participants?.map(p => (
            <span
              key={p.userId}
              className="inline-flex items-center gap-1 text-xs bg-white/20 text-white px-2.5 py-1 rounded-full"
            >
              <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center font-bold text-[10px]">
                {p.name?.[0] || '?'}
              </span>
              {p.name || 'Unknown'}
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
          <p className="text-sm text-gray-500 mt-0.5">{selectedVenue.address || 'Address not available'}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span>⭐ {selectedVenue.rating?.toFixed(1) || 'N/A'}</span>
            <span>🗺 {selectedVenue.distanceKm?.toFixed(1) || '?'} km</span>
            <span>⏱ ~{selectedVenue.estimatedMinutes || '?'} min</span>
          </div>
        </DetailRow>

        <DetailRow icon="👥" label="Attendees">
          <ul className="space-y-1.5">
            {event.participants?.map(p => (
              <li key={p.userId} className="flex items-center gap-2 text-sm">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-semibold text-[11px]">
                  {p.name?.[0] || '?'}
                </span>
                <span className="text-gray-800">{p.name || 'Unknown User'}</span>
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
          onClick={() => navigate("/events")}
          className="flex-1 py-2.5 px-5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 active:scale-95 transition-all text-center"
        >
          ← Back to Events
        </button>
        {event.creatorId === currentUserId && (
          <button
            onClick={() => setShowRevertConfirm(true)}
            className="flex-1 py-2.5 px-5 rounded-xl border border-amber-200 text-amber-600 text-sm font-medium hover:bg-amber-50 active:scale-95 transition-all text-center"
          >
            Exit &amp; Revert
          </button>
        )}
      </div>

    </div>
  );
}