import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchAuthSession } from "aws-amplify/auth";
import {
  fetchVenues,
  finalizeEvent,
  leaveEvent,
  getDatesInRange,
} from "../api/Event.tsx";
import type { EventDetail, Venue, TimeSlot } from "../api/Event.tsx";

// ─── Constants ────────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 8 AM – 9 PM

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHour(hour: number): string {
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function formatDayHeader(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return {
    day: d.toLocaleDateString("en-US", { weekday: "short" }),
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

function slotKey(date: string, hour: number) {
  return `${date}-${hour}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EventDetail["status"] }) {
  const map: Record<EventDetail["status"], { label: string; cls: string }> = {
    COLLECTING_AVAILABILITY: { label: "Collecting Availability", cls: "bg-amber-100 text-amber-700" },
    SCHEDULING:              { label: "Scheduling",              cls: "bg-blue-100 text-blue-700" },
    AWAITING_CONFIRMATION:   { label: "Awaiting Confirmation",   cls: "bg-violet-100 text-violet-700" },
    FINALIZED:               { label: "Confirmed",               cls: "bg-green-100 text-green-700" },
  };
  const { label, cls } = map[status] || { label: "Unknown", cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  if (rating == null) return null;
  const full = Math.round(rating);
  return (
    <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
      <span className="text-yellow-400">{"★".repeat(full)}{"☆".repeat(5 - full)}</span>
      <span className="text-gray-500">{rating.toFixed(1)}</span>
    </span>
  );
}

// ─── Availability Grid (own slots only — no others' data shown) ───────────────

interface SelectionGridProps {
  dates: string[];
  hours: number[];
  selectedSlots: Set<string>;
  onMouseDown: (date: string, hour: number) => void;
  onMouseEnter: (date: string, hour: number) => void;
}

function SelectionGrid({ dates, hours, selectedSlots, onMouseDown, onMouseEnter }: SelectionGridProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 select-none">
      <div style={{ minWidth: 560 }}>
        <div className="grid bg-gray-50 border-b border-gray-200" style={{ gridTemplateColumns: `56px repeat(${dates.length}, 1fr)` }}>
          <div />
          {dates.map(date => {
            const { day, date: d } = formatDayHeader(date);
            return (
              <div key={date} className="py-2 text-center border-l border-gray-200">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">{day}</div>
                <div className="text-sm font-semibold text-gray-800 mt-0.5">{d}</div>
              </div>
            );
          })}
        </div>
        {hours.map((hour, hi) => (
          <div key={hour} className="grid" style={{ gridTemplateColumns: `56px repeat(${dates.length}, 1fr)` }}>
            <div className={`flex items-center justify-end pr-2 text-xs text-gray-400 ${hi % 2 === 0 ? "font-medium" : ""}`} style={{ height: 32 }}>
              {hi % 2 === 0 ? formatHour(hour) : ""}
            </div>
            {dates.map(date => {
              const key = slotKey(date, hour);
              const selected = selectedSlots.has(key);
              return (
                <div
                  key={key}
                  title={`${formatDayHeader(date).date} ${formatHour(hour)}`}
                  className={`border-l border-t transition-colors ${
                    selected ? "bg-green-400 border-green-500" : "bg-white border-gray-100 hover:bg-gray-50 cursor-pointer"
                  }`}
                  style={{ height: 32 }}
                  onMouseDown={() => onMouseDown(date, hour)}
                  onMouseEnter={() => onMouseEnter(date, hour)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Voting Grid (creator in SCHEDULING — shows vote counts, click to pick) ─

interface VotingGridProps {
  dates: string[];
  hours: number[];
  slotCounts: Record<string, number>;
  totalParticipants: number;
  selectedSlot: string | null;
  onSelect: (date: string, hour: number) => void;
}

function VotingGrid({ dates, hours, slotCounts, totalParticipants, selectedSlot, onSelect }: VotingGridProps) {
  function cellStyle(date: string, hour: number): string {
    const key = slotKey(date, hour);
    const count = slotCounts[key] ?? 0;
    const isSelected = selectedSlot === key;
    if (isSelected) return "bg-indigo-600 border-indigo-700 cursor-pointer";
    if (count === 0) return "bg-white border-gray-100";
    if (count === totalParticipants) return "bg-indigo-400 border-indigo-500 cursor-pointer hover:bg-indigo-500";
    return "bg-indigo-100 border-indigo-200 cursor-pointer hover:bg-indigo-200";
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 select-none">
      <div style={{ minWidth: 560 }}>
        <div className="grid bg-gray-50 border-b border-gray-200" style={{ gridTemplateColumns: `56px repeat(${dates.length}, 1fr)` }}>
          <div />
          {dates.map(date => {
            const { day, date: d } = formatDayHeader(date);
            return (
              <div key={date} className="py-2 text-center border-l border-gray-200">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide">{day}</div>
                <div className="text-sm font-semibold text-gray-800 mt-0.5">{d}</div>
              </div>
            );
          })}
        </div>
        {hours.map((hour, hi) => (
          <div key={hour} className="grid" style={{ gridTemplateColumns: `56px repeat(${dates.length}, 1fr)` }}>
            <div className={`flex items-center justify-end pr-2 text-xs text-gray-400 ${hi % 2 === 0 ? "font-medium" : ""}`} style={{ height: 32 }}>
              {hi % 2 === 0 ? formatHour(hour) : ""}
            </div>
            {dates.map(date => {
              const key = slotKey(date, hour);
              const count = slotCounts[key] ?? 0;
              const isSelected = selectedSlot === key;
              return (
                <div
                  key={key}
                  title={count > 0 ? `${count}/${totalParticipants} participants available` : "No one selected this slot"}
                  className={`border-l border-t transition-colors flex items-center justify-center ${cellStyle(date, hour)}`}
                  style={{ height: 32 }}
                  onClick={() => count > 0 && onSelect(date, hour)}
                >
                  {count > 0 && (
                    <span className={`text-xs font-bold leading-none ${isSelected ? "text-white" : "text-indigo-700"}`}>
                      {count}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Venue Card ───────────────────────────────────────────────────────────────

function VenueCard({ venue, canSelect, onSelect }: { venue: Venue; canSelect: boolean; onSelect: (v: Venue) => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-base leading-tight">{venue.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{venue.address}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 text-xl">📍</div>
      </div>
      <div className="flex items-center gap-4 text-sm text-gray-600">
        <StarRating rating={venue.rating} />
        <span>🗺 {venue.distanceKm?.toFixed(1)} km</span>
        <span>⏱ ~{venue.estimatedMinutes} min</span>
      </div>
      {canSelect && (
        <button
          onClick={() => onSelect(venue)}
          className="mt-1 w-full py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-medium transition-all"
        >
          Select This Venue
        </button>
      )}
      {!canSelect && (
        <p className="text-xs text-gray-400 text-center">Only the organizer can select a venue</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EventWorkspace() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"availability" | "venue">("availability");
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingVenues, setLoadingVenues] = useState(false);
  
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Availability selection (own slots only)
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Creator slot voting selection
  const [selectedFinalSlotKey, setSelectedFinalSlotKey] = useState<string | null>(null);

  const [finalizing, setFinalizing] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const isDragging = useRef(false);
  const dragMode = useRef<"add" | "remove">("add");

  // Fetch real event data
  useEffect(() => {
    async function loadWorkspaceData() {
      if (!eventId) return;
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        const userId = session.tokens?.idToken?.payload?.sub as string;
        setCurrentUserId(userId);

        const apiUrl = import.meta.env.VITE_API_URL;
        if (!token || !apiUrl) throw new Error("Missing Auth token or API URL");

        const response = await fetch(`${apiUrl}/events/${eventId}`, {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) throw new Error("Event not found");

        const { data } = await response.json();
        setEvent(data);
        
        if (data.status === 'SCHEDULING') setActiveTab("availability");
      } catch (error) {
        console.error("Error loading workspace:", error);
      } finally {
        setLoadingEvent(false);
      }
    }
    loadWorkspaceData();
  }, [eventId]);

  useEffect(() => {
    if (activeTab !== "venue" || !eventId || venues.length > 0) return;
    setLoadingVenues(true);
    fetchVenues(eventId).then(v => { setVenues(v); setLoadingVenues(false); });
  }, [activeTab, eventId, venues.length]);

  useEffect(() => {
    const stop = () => { isDragging.current = false; };
    document.addEventListener("mouseup", stop);
    return () => document.removeEventListener("mouseup", stop);
  }, []);

  const handleCellMouseDown = useCallback((date: string, hour: number) => {
    isDragging.current = true;
    const key = slotKey(date, hour);
    setSelectedSlots(prev => {
      const next = new Set(prev);
      if (next.has(key)) { dragMode.current = "remove"; next.delete(key); }
      else { dragMode.current = "add"; next.add(key); }
      return next;
    });
  }, []);

  const handleCellMouseEnter = useCallback((date: string, hour: number) => {
    if (!isDragging.current) return;
    const key = slotKey(date, hour);
    setSelectedSlots(prev => {
      const next = new Set(prev);
      if (dragMode.current === "add") next.add(key); else next.delete(key);
      return next;
    });
  }, []);

  async function handleSubmitAvailability() {
    if (!eventId || !currentUserId) return;
    setSubmitting(true);
    const availableTimeSlots = Array.from(selectedSlots);

    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    const apiUrl = import.meta.env.VITE_API_URL;

    await fetch(`${apiUrl}/events/${eventId}/availability`, {
      method: 'POST',
      headers: {
        'Authorization': token || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ availableTimeSlots }),
    });

    // Re-fetch to get updated slot counts
    const response = await fetch(`${apiUrl}/events/${eventId}`, {
      headers: { 'Authorization': token || '' }
    });
    const { data: refreshed } = await response.json();

    setEvent(refreshed);
    setSubmitting(false);
    setSubmitted(true);
  }

  async function handleSelectVenue(venue: Venue) {
    if (!eventId || !selectedFinalSlotKey) return;
    const lastDash = selectedFinalSlotKey.lastIndexOf("-");
    const slot: TimeSlot = {
      date: selectedFinalSlotKey.slice(0, lastDash),
      startHour: parseInt(selectedFinalSlotKey.slice(lastDash + 1), 10),
    };
    setFinalizing(true);
    try {
      await finalizeEvent(eventId, slot, venue.venueId);
      
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const apiUrl = import.meta.env.VITE_API_URL;
      const response = await fetch(`${apiUrl}/events/${eventId}`, {
        headers: { 'Authorization': token || '' }
      });
      const { data: finalEvent } = await response.json();
      
      navigate(`/events/${eventId}/details`, {
        state: { event: finalEvent, selectedSlot: slot, selectedVenue: venue },
      });
    } catch (err) {
      console.error("Failed to finalize event:", err);
    } finally {
      setFinalizing(false);
    }
  }

  async function handleLeaveEvent() {
    if (!eventId) return;
    setLeaving(true);
    try {
      await leaveEvent(eventId);
      navigate("/events");
    } finally {
      setLeaving(false);
      setShowLeaveConfirm(false);
    }
  }

  if (loadingEvent) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading event…</span>
        </div>
      </div>
    );
  }

  if (!event || !currentUserId) {
    return <div className="text-center py-16 text-gray-500">Event not found.</div>;
  }

  if (event.status === 'FINALIZED') {
    navigate(`/events/${eventId}/details`, { replace: true });
    return null;
  }

  const dates = getDatesInRange(event.dateRange?.start || "", event.dateRange?.end || "");
  const totalParticipants = event.participants?.length || 0;
  const isCreator = event.creatorId === currentUserId;
  const alreadySubmitted = (event.availabilitySubmittedBy ?? []).includes(currentUserId);

  const venueUnlocked = isCreator && event.status === 'SCHEDULING' && selectedFinalSlotKey !== null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* ── Leave Event Dialog ── */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Leave this event?</h3>
            <p className="text-sm text-gray-500">
              You will be moved to Pending status. The event will remain in MyEvents so you can rejoin later.
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={handleLeaveEvent} disabled={leaving}
                className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {leaving ? "Leaving…" : "Leave Event"}
              </button>
              <button onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
                Stay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={event.status} />
            <span className="text-xs text-gray-400">{event.venueType}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {event.participants?.map(p => (
              <span key={p.userId} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-semibold text-[10px]">
                  {p.name?.[0] || '?'}
                </span>
                {p.name || 'Unknown'}
                {(event.availabilitySubmittedBy ?? []).includes(p.userId) && (
                  <span className="text-green-500 text-[10px]">✓</span>
                )}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => navigate("/events")}
            className="text-sm px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            ← Back to Events
          </button>
          {!isCreator && (
            <button onClick={() => setShowLeaveConfirm(true)}
              className="text-sm px-4 py-2 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
              Leave Event
            </button>
          )}
        </div>
      </div>

      {/* ── AWAITING_CONFIRMATION banner ── */}
      {event.status === 'AWAITING_CONFIRMATION' && (
        <div className="rounded-2xl bg-violet-50 border border-violet-200 p-5 space-y-2">
          <p className="text-sm font-semibold text-violet-800">
            📩 Event scheduled — waiting for participants to confirm
          </p>
          {event.selectedTime && event.selectedVenue && (
            <p className="text-sm text-violet-700">
              {event.selectedTime.date} at {formatHour(event.selectedTime.startHour)} · {event.selectedVenue.name}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-1">
            {event.participants?.map(p => {
              const confirmed = (event.confirmedUserIds ?? []).includes(p.userId);
              const declined = (event.declinedUserIds ?? []).includes(p.userId);
              return (
                <span key={p.userId} className={`text-xs px-2 py-0.5 rounded-full border ${
                  confirmed ? "bg-green-100 text-green-700 border-green-200" :
                  declined  ? "bg-red-100 text-red-700 border-red-200" :
                              "bg-gray-100 text-gray-500 border-gray-200"
                }`}>
                  {p.name} {confirmed ? "✓" : declined ? "✗" : "…"}
                </span>
              );
            })}
          </div>
          <p className="text-xs text-violet-500">
            Participants confirm or decline via their Notifications.
          </p>
        </div>
      )}

      {/* ── Tabs ── */}
      {event.status !== 'AWAITING_CONFIRMATION' && (
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("availability")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "availability" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {event.status === 'SCHEDULING' && isCreator ? "🗳 Slot Voting" : "🗓 Availability"}
          </button>
          <button
            onClick={() => venueUnlocked && setActiveTab("venue")}
            disabled={!venueUnlocked}
            title={!venueUnlocked ? (
              isCreator && event.status === 'SCHEDULING'
                ? "Select a time slot above first"
                : "Submit your availability first"
            ) : undefined}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              !venueUnlocked
                ? "text-gray-300 cursor-not-allowed"
                : activeTab === "venue"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            📍 Venues {!venueUnlocked && "🔒"}
          </button>
        </div>
      )}

      {/* ── Availability Tab: collect own slots ── */}
      {activeTab === "availability" && event.status === 'COLLECTING_AVAILABILITY' && (
        <div className="space-y-4">
          {alreadySubmitted ? (
            <div className="flex items-center gap-2 text-sm text-green-600 font-medium p-3 bg-green-50 rounded-xl border border-green-200">
              <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-xs">✓</span>
              Your availability has been submitted. Waiting for others to submit.
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Select your available time slots. Your selections are private — others cannot see them.
              </p>
              <SelectionGrid
                dates={dates}
                hours={HOURS}
                selectedSlots={selectedSlots}
                onMouseDown={handleCellMouseDown}
                onMouseEnter={handleCellMouseEnter}
              />
              <div className="flex items-center gap-3 pt-1">
                {submitted ? (
                  <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                    <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-xs">✓</span>
                    Availability submitted!
                  </div>
                ) : (
                  <button
                    onClick={handleSubmitAvailability}
                    disabled={submitting || selectedSlots.size === 0}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Submitting…" : `Submit Availability (${selectedSlots.size} slots)`}
                  </button>
                )}
                {selectedSlots.size > 0 && !submitted && (
                  <button onClick={() => setSelectedSlots(new Set())}
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                    Clear all
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Availability Tab: creator sees vote counts in SCHEDULING ── */}
      {activeTab === "availability" && event.status === 'SCHEDULING' && isCreator && (
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
            All {totalParticipants} participants have submitted. Click a highlighted slot to select it as the final time.
            {selectedFinalSlotKey && (
              <span className="ml-2 font-semibold text-indigo-700">
                Selected: {(() => {
                  const lastDash = selectedFinalSlotKey.lastIndexOf("-");
                  const date = selectedFinalSlotKey.slice(0, lastDash);
                  const hour = parseInt(selectedFinalSlotKey.slice(lastDash + 1));
                  return `${date} ${formatHour(hour)}`;
                })()}
              </span>
            )}
          </div>
          <VotingGrid
            dates={dates}
            hours={HOURS}
            slotCounts={event.slotCounts ?? {}}
            totalParticipants={totalParticipants}
            selectedSlot={selectedFinalSlotKey}
            onSelect={(date, hour) => setSelectedFinalSlotKey(slotKey(date, hour))}
          />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-indigo-100 border border-indigo-200 flex items-center justify-center text-[10px] font-bold text-indigo-600">N</span> Partial availability</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-indigo-400 border border-indigo-500" /> All participants available</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-indigo-600 border border-indigo-700" /> Selected as final time</span>
          </div>
          {selectedFinalSlotKey && (
            <button
              onClick={() => setActiveTab("venue")}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:scale-95 transition-all"
            >
              Choose Venue →
            </button>
          )}
        </div>
      )}

      {/* ── Availability Tab: non-creator waiting in SCHEDULING ── */}
      {activeTab === "availability" && event.status === 'SCHEDULING' && !isCreator && (
        <div className="flex flex-col items-center py-12 gap-3 text-center">
          <div className="text-4xl">⏳</div>
          <p className="text-gray-700 font-medium">All participants have submitted their availability.</p>
          <p className="text-gray-500 text-sm">The organizer ({event.creatorName || 'Creator'}) is selecting the final time and venue.</p>
        </div>
      )}

      {/* ── Venue Tab ── */}
      {activeTab === "venue" && (
        <div className="space-y-4">
          {isCreator && selectedFinalSlotKey && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800">
              ✅ Final time selected. Now choose a venue to confirm the event.
            </div>
          )}
          {!isCreator && (
            <p className="text-sm text-gray-500 p-3 bg-gray-50 rounded-xl border border-gray-200">
              Only the organizer can select a venue.
            </p>
          )}

          {loadingVenues ? (
            <div className="flex items-center gap-3 py-8">
              <div className="w-6 h-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Loading venues…</span>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {venues.map(venue => (
                <VenueCard
                  key={venue.venueId}
                  venue={venue}
                  canSelect={isCreator && !finalizing}
                  onSelect={handleSelectVenue}
                />
              ))}
            </div>
          )}

          {finalizing && (
            <div className="flex items-center gap-2 text-sm text-indigo-600">
              <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              Finalizing event…
            </div>
          )}
        </div>
      )}
    </div>
  );
}