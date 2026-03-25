import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthenticator } from "@aws-amplify/ui-react";
import {
  fetchEventById,
  fetchCommonTimes,
  fetchVenues,
  submitAvailability,
  finalizeEvent,
} from "../api/Event.tsx";
import type { EventDetail, CommonTime, Venue, TimeSlot } from "../api/Event.tsx";

// ─── Constants ────────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 8 AM – 9 PM

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  while (current <= endDate && dates.length < 7) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

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
  const map = {
    COLLECTING_AVAILABILITY: { label: "Collecting Availability", cls: "bg-amber-100 text-amber-700" },
    SELECTING_VENUE: { label: "Selecting Venue", cls: "bg-blue-100 text-blue-700" },
    FINALIZED: { label: "Finalized", cls: "bg-green-100 text-green-700" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
      <span className="text-yellow-400">{"★".repeat(full)}{"☆".repeat(5 - full)}</span>
      <span className="text-gray-500">{rating.toFixed(1)}</span>
    </span>
  );
}

// ─── Availability Grid ────────────────────────────────────────────────────────

interface GridProps {
  dates: string[];
  hours: number[];
  selectedSlots: Set<string>;
  commonTimes: CommonTime[];
  totalParticipants: number;
  onMouseDown: (date: string, hour: number) => void;
  onMouseEnter: (date: string, hour: number) => void;
}

function AvailabilityGrid({
  dates,
  hours,
  selectedSlots,
  commonTimes,
  totalParticipants,
  onMouseDown,
  onMouseEnter,
}: GridProps) {
  function cellClass(date: string, hour: number): string {
    const key = slotKey(date, hour);
    const isSelected = selectedSlots.has(key);
    const common = commonTimes.find(c => c.date === date && c.startHour === hour);
    const isFullMatch = common?.count === totalParticipants;

    if (isSelected && isFullMatch) return "bg-emerald-500 border-emerald-600";
    if (isSelected && common)      return "bg-green-400 border-green-500";
    if (isSelected)                return "bg-green-400 border-green-500 hover:bg-green-500";
    if (isFullMatch)               return "bg-indigo-400 border-indigo-500";
    if (common)                    return "bg-indigo-100 border-indigo-200";
    return "bg-white border-gray-100 hover:bg-gray-50 cursor-pointer";
  }

  function cellTitle(date: string, hour: number): string {
    const common = commonTimes.find(c => c.date === date && c.startHour === hour);
    if (!common) return `${formatDayHeader(date).date} ${formatHour(hour)}`;
    return `${common.participantNames.join(", ")} available`;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 select-none">
      <div style={{ minWidth: 560 }}>
        {/* Header */}
        <div className="grid bg-gray-50 border-b border-gray-200" style={{ gridTemplateColumns: `56px repeat(${dates.length}, 1fr)` }}>
          <div /> {/* corner */}
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

        {/* Rows */}
        {hours.map((hour, hi) => (
          <div
            key={hour}
            className="grid"
            style={{ gridTemplateColumns: `56px repeat(${dates.length}, 1fr)` }}
          >
            {/* Time label */}
            <div className={`flex items-center justify-end pr-2 text-xs text-gray-400 ${hi % 2 === 0 ? "font-medium" : ""}`}
              style={{ height: 32 }}>
              {hi % 2 === 0 ? formatHour(hour) : ""}
            </div>

            {/* Cells */}
            {dates.map(date => (
              <div
                key={slotKey(date, hour)}
                title={cellTitle(date, hour)}
                className={`border-l border-t transition-colors ${cellClass(date, hour)}`}
                style={{ height: 32 }}
                onMouseDown={() => onMouseDown(date, hour)}
                onMouseEnter={() => onMouseEnter(date, hour)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Venue Card ───────────────────────────────────────────────────────────────

function VenueCard({
  venue,
  canSelect,
  onSelect,
}: {
  venue: Venue;
  canSelect: boolean;
  onSelect: (v: Venue) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-base leading-tight">{venue.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{venue.address}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 text-xl">
          📍
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600">
        <StarRating rating={venue.rating} />
        <span className="flex items-center gap-1">
          <span className="text-gray-400">🗺</span>
          {venue.distanceKm.toFixed(1)} km
        </span>
        <span className="flex items-center gap-1">
          <span className="text-gray-400">⏱</span>
          ~{venue.estimatedMinutes} min
        </span>
      </div>

      {canSelect && (
        <button
          onClick={() => onSelect(venue)}
          className="mt-1 w-full py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-medium transition-all"
        >
          Select This Venue
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EventWorkspace() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthenticator();

  const [activeTab, setActiveTab] = useState<"availability" | "venue">("availability");
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [commonTimes, setCommonTimes] = useState<CommonTime[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const isDragging = useRef(false);
  const dragMode = useRef<"add" | "remove">("add");

  // Load event + common times on mount
  useEffect(() => {
    if (!eventId) return;
    Promise.all([fetchEventById(eventId), fetchCommonTimes(eventId)]).then(
      ([detail, times]) => {
        setEvent(detail);
        setCommonTimes(times);
        setLoadingEvent(false);
      }
    );
  }, [eventId]);

  // Load venues lazily when tab switches
  useEffect(() => {
    if (activeTab !== "venue" || !eventId || venues.length > 0) return;
    setLoadingVenues(true);
    fetchVenues(eventId).then(v => {
      setVenues(v);
      setLoadingVenues(false);
    });
  }, [activeTab, eventId, venues.length]);

  // Stop drag on mouseup anywhere
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
      if (dragMode.current === "add") next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  async function handleSubmitAvailability() {
    if (!eventId || !user?.username) return;
    setSubmitting(true);
    // slotKey format: "YYYY-MM-DD-HH" — split on last dash
    const slots: TimeSlot[] = Array.from(selectedSlots).map(key => {
      const lastDash = key.lastIndexOf("-");
      return { date: key.slice(0, lastDash), startHour: parseInt(key.slice(lastDash + 1)) };
    });
    await submitAvailability(eventId, user.username, slots);
    setSubmitting(false);
    setSubmitted(true);
  }

  async function handleSelectVenue(venue: Venue) {
    if (!eventId || selectedSlots.size === 0) {
      // Use first common time as the selected slot for demo
      const slot = commonTimes[0]
        ? { date: commonTimes[0].date, startHour: commonTimes[0].startHour }
        : { date: "2026-03-31", startHour: 14 };
      setFinalizing(true);
      await finalizeEvent(eventId!, slot, venue.venueId);
      setFinalizing(false);
      navigate(`/events/${eventId}/details`, {
        state: { event, selectedSlot: slot, selectedVenue: venue },
      });
      return;
    }

    const firstKey = Array.from(selectedSlots)[0];
    const parts = firstKey.split("-");
    const slot: TimeSlot = {
      date: parts.slice(0, 3).join("-"),
      startHour: parseInt(parts[3]),
    };
    setFinalizing(true);
    await finalizeEvent(eventId!, slot, venue.venueId);
    setFinalizing(false);
    navigate(`/events/${eventId}/details`, {
      state: { event, selectedSlot: slot, selectedVenue: venue },
    });
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

  if (!event) {
    return (
      <div className="text-center py-16 text-gray-500">Event not found.</div>
    );
  }

  const dates = getDatesInRange(event.dateRange.start, event.dateRange.end);
  const totalParticipants = event.participants.length;
  const isCreator = true; // In production: user?.username === event.creatorId

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={event.status} />
            <span className="text-xs text-gray-400">{event.venueType}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {event.participants.map(p => (
              <span key={p.userId} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-semibold text-[10px]">
                  {p.name[0]}
                </span>
                {p.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {(["availability", "venue"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab === "availability" ? "🗓 Availability" : "📍 Venues"}
          </button>
        ))}
      </div>

      {/* ── Availability Tab ── */}
      {activeTab === "availability" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Click or drag to mark your available time slots.
          </p>

          <AvailabilityGrid
            dates={dates}
            hours={HOURS}
            selectedSlots={selectedSlots}
            commonTimes={commonTimes}
            totalParticipants={totalParticipants}
            onMouseDown={handleCellMouseDown}
            onMouseEnter={handleCellMouseEnter}
          />

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-green-400 border border-green-500" /> Your availability
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-indigo-100 border border-indigo-200" /> Partial overlap
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-indigo-400 border border-indigo-500" /> Full overlap (all {totalParticipants})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-emerald-500 border border-emerald-600" /> You + full overlap
            </span>
          </div>

          {/* Submit */}
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
              <button
                onClick={() => setSelectedSlots(new Set())}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Venue Tab ── */}
      {activeTab === "venue" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Recommended venues based on participants' locations.
            {isCreator ? " Select the final venue to confirm the event." : " Waiting for the organizer to select a venue."}
          </p>

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
