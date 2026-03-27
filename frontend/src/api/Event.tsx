// ─── Types ────────────────────────────────────────────────────────────────────

export type Event = {
  eventId: string;
  title?: string;
};

export type TimeSlot = {
  date: string;      // "YYYY-MM-DD"
  startHour: number; // 0–23
};

export type Participant = {
  userId: string;
  name: string;
};

export type EventDetail = {
  eventId: string;
  title: string;
  status: 'COLLECTING_AVAILABILITY' | 'SELECTING_VENUE' | 'FINALIZED';
  creatorId: string;
  participants: Participant[];
  venueType: string;
  dateRange: { start: string; end: string };
  selectedTime?: TimeSlot;
  selectedVenue?: Venue;
};

export type CommonTime = {
  date: string;
  startHour: number;
  count: number;
  participantNames: string[];
};

export type Venue = {
  venueId: string;
  name: string;
  address: string;
  rating: number;
  distanceKm: number;
  estimatedMinutes: number;
};

// ─── Mock API Functions ───────────────────────────────────────────────────────

export async function fetchEvents(): Promise<Event[]> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve([
        { eventId: "event-1", title: "Badminton Meetup" },
        { eventId: "event-2", title: "Lunch at Orchard" },
        { eventId: "event-3", title: "Weekend Hiking Trip" },
      ]);
    }, 500);
  });
}

export async function createEvent(friendIds: string[]) {
  console.log("Creating event with friends:", friendIds);
}

export async function fetchEventById(eventId: string): Promise<EventDetail> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        eventId,
        title: "Badminton Meetup",
        status: "COLLECTING_AVAILABILITY",
        creatorId: "user-alice",
        participants: [
          { userId: "user-alice", name: "Alice" },
          { userId: "user-bob", name: "Bob" },
          { userId: "user-charlie", name: "Charlie" },
        ],
        venueType: "Sports Hall",
        dateRange: { start: "2026-03-30", end: "2026-04-05" },
      });
    }, 400);
  });
}

export async function submitAvailability(
  eventId: string,
  userId: string,
  slots: TimeSlot[]
): Promise<void> {
  console.log("Submitting availability:", { eventId, userId, slotCount: slots.length });
  return new Promise(resolve => setTimeout(resolve, 600));
}

export async function fetchCommonTimes(_eventId: string): Promise<CommonTime[]> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve([
        { date: "2026-03-30", startHour: 10, count: 2, participantNames: ["Alice", "Bob"] },
        { date: "2026-03-31", startHour: 14, count: 3, participantNames: ["Alice", "Bob", "Charlie"] },
        { date: "2026-03-31", startHour: 15, count: 3, participantNames: ["Alice", "Bob", "Charlie"] },
        { date: "2026-03-31", startHour: 16, count: 2, participantNames: ["Alice", "Charlie"] },
        { date: "2026-04-01", startHour: 19, count: 2, participantNames: ["Bob", "Charlie"] },
        { date: "2026-04-02", startHour: 10, count: 2, participantNames: ["Alice", "Charlie"] },
        { date: "2026-04-02", startHour: 11, count: 3, participantNames: ["Alice", "Bob", "Charlie"] },
        { date: "2026-04-02", startHour: 12, count: 3, participantNames: ["Alice", "Bob", "Charlie"] },
        { date: "2026-04-04", startHour: 9,  count: 2, participantNames: ["Alice", "Bob"] },
      ]);
    }, 600);
  });
}

export async function fetchVenues(_eventId: string): Promise<Venue[]> {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve([
        {
          venueId: "venue-1",
          name: "ActiveSG Bishan Sports Hall",
          address: "513 Bishan St 13, Singapore 570513",
          rating: 4.5,
          distanceKm: 1.2,
          estimatedMinutes: 18,
        },
        {
          venueId: "venue-2",
          name: "OCBC Arena",
          address: "1 Stadium Dr, Singapore 397629",
          rating: 4.3,
          distanceKm: 2.8,
          estimatedMinutes: 32,
        },
        {
          venueId: "venue-3",
          name: "Kallang Leisure Park Badminton",
          address: "5 Stadium Walk, Singapore 397693",
          rating: 4.1,
          distanceKm: 3.5,
          estimatedMinutes: 41,
        },
      ]);
    }, 700);
  });
}

export async function finalizeEvent(
  eventId: string,
  slot: TimeSlot,
  venueId: string
): Promise<void> {
  console.log("Finalizing event:", { eventId, slot, venueId });
  return new Promise(resolve => setTimeout(resolve, 500));
}
