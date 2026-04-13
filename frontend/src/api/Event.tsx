import { fetchAuthSession } from "aws-amplify/auth";

// ─── Constants ─────────────────────────────────────────────────────────────────

export const CURRENT_USER_ID = 'u-current';
export const CURRENT_USER_NAME = 'You';

const EVENT_STORE_KEY = 'midmeet-events-v3';

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

/** Master event type — used by all pages */
export type EventDetail = {
  eventId: string;
  title: string;
  status: 'COLLECTING_AVAILABILITY' | 'SCHEDULING' | 'AWAITING_CONFIRMATION' | 'FINALIZED';
  creatorId: string;
  creatorName: string;
  participants: Participant[];
  /** UserIds who have submitted their availability */
  availabilitySubmittedBy?: string[];
  /** Slot vote counts: key = "YYYY-MM-DD-HH", value = number of participants who picked that slot */
  slotCounts?: Record<string, number>;
  /** UserIds who confirmed attendance (AWAITING_CONFIRMATION / FINALIZED) */
  confirmedUserIds?: string[];
  /** UserIds who declined attendance */
  declinedUserIds?: string[];
  /** UserIds who left a private event and can rejoin */
  pendingUserIds?: string[];
  venueType: string;
  dateRange: { start: string; end: string };
  isPublic: boolean;
  description?: string;
  selectedTime?: TimeSlot;
  selectedVenue?: Venue;
};

export type CommonTime = {
  date: string;
  startHour: number;
  count: number;
  participantNames: string[];
};

export type ParticipantTravel = {
  userId: string;
  name: string;
  estimatedMinutes: number;
};

export type Venue = {
  venueId: string;
  name: string;
  address: string;
  rating: number | null;
  distanceKm: number;
  estimatedMinutes: number;
  /** Only present on venues returned from the recommendations API (not on stored selectedVenue). */
  fairnessScore?: number;
  participantTravel?: ParticipantTravel[];
};

export type CreateEventInput = {
  title: string;
  participantIds: string[];
  participantNames: string[];
  venueType: string;
  dateRange: { start: string; end: string };
  isPublic: boolean;
  description?: string;
};

// ─── Static Mock Venue Data ────────────────────────────────────────────────────

const MOCK_VENUES: Venue[] = [
  {
    venueId: 'venue-1',
    name: 'ActiveSG Bishan Sports Hall',
    address: '513 Bishan St 13, Singapore 570513',
    rating: 4.5,
    distanceKm: 1.2,
    estimatedMinutes: 18,
  },
  {
    venueId: 'venue-2',
    name: 'OCBC Arena',
    address: '1 Stadium Dr, Singapore 397629',
    rating: 4.3,
    distanceKm: 2.8,
    estimatedMinutes: 32,
  },
  {
    venueId: 'venue-3',
    name: 'Kallang Leisure Park Badminton Hall',
    address: '5 Stadium Walk, Singapore 397693',
    rating: 4.1,
    distanceKm: 3.5,
    estimatedMinutes: 41,
  },
  {
    venueId: 'venue-4',
    name: 'The Providore @ Marina One',
    address: '5 Straits View, Singapore 018935',
    rating: 4.4,
    distanceKm: 0.8,
    estimatedMinutes: 12,
  },
  {
    venueId: 'venue-5',
    name: 'East Coast Park Area D Pavilion',
    address: 'East Coast Park Service Rd, Singapore 449876',
    rating: 4.6,
    distanceKm: 2.1,
    estimatedMinutes: 25,
  },
  {
    venueId: 'venue-6',
    name: 'Timbre+ @ One North',
    address: '73A Ayer Rajah Crescent, Singapore 139957',
    rating: 4.2,
    distanceKm: 1.7,
    estimatedMinutes: 22,
  },
];

// ─── Default Mock Events ───────────────────────────────────────────────────────
// Each event is named to describe the scenario it covers, making testing intuitive.

const DEFAULT_EVENTS: EventDetail[] = [

  // ════════════════════════════════════════════════════════════════════════════
  // A. PENDING INVITATIONS — you're in participants but haven't submitted yet
  //    (appears in EventList "Pending Invitations" section)
  // ════════════════════════════════════════════════════════════════════════════

  {
    eventId: 'evt-pending-inv-01',
    title: "Daisy's Book Club Lunch [Pending: not submitted]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-daisy',
    creatorName: 'Daisy',
    participants: [
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: ['u-daisy', 'u-ethan'],
    slotCounts: { '2026-04-03-12': 2, '2026-04-04-13': 1 },
    venueType: 'Restaurant',
    dateRange: { start: '2026-04-03', end: '2026-04-06' },
    isPublic: false,
    description: 'Monthly book club lunch. 2/3 submitted, waiting for you.',
  },
  {
    eventId: 'evt-pending-inv-02',
    title: "Charlie's Movie Night [Pending: only you haven't submitted]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-charlie',
    creatorName: 'Charlie',
    participants: [
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-alice', name: 'Alice' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: ['u-charlie', 'u-alice'],
    slotCounts: { '2026-04-07-19': 2, '2026-04-08-20': 1 },
    venueType: 'Mall',
    dateRange: { start: '2026-04-07', end: '2026-04-09' },
    isPublic: false,
    description: 'Charlie is organising a movie night at the mall.',
  },
  {
    eventId: 'evt-pending-inv-03',
    title: "Bob's Park Picnic [Pending: first invite, nobody else submitted]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-bob',
    creatorName: 'Bob',
    participants: [
      { userId: 'u-bob', name: 'Bob' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: 'u-george', name: 'George' },
    ],
    availabilitySubmittedBy: ['u-bob'],
    slotCounts: { '2026-04-12-10': 1 },
    venueType: 'Park',
    dateRange: { start: '2026-04-12', end: '2026-04-14' },
    isPublic: false,
    description: 'Relaxing picnic at Botanic Gardens. Submit your free slots!',
  },
  {
    eventId: 'evt-pending-inv-04',
    title: "Fiona's Yoga Session [Pending: you haven't voted yet]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-fiona',
    creatorName: 'Fiona',
    participants: [
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-hannah', name: 'Hannah' },
    ],
    availabilitySubmittedBy: ['u-fiona', 'u-hannah'],
    slotCounts: { '2026-04-09-08': 2, '2026-04-10-09': 1 },
    venueType: 'Sports Hall',
    dateRange: { start: '2026-04-09', end: '2026-04-11' },
    isPublic: false,
    description: 'Morning yoga session. Fiona and Hannah have submitted.',
  },
  {
    eventId: 'evt-pending-inv-05',
    title: "George's Gym Sesh [Pending: large group waiting on you]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-george',
    creatorName: 'George',
    participants: [
      { userId: 'u-george', name: 'George' },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-bob', name: 'Bob' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: ['u-george', 'u-alice', 'u-bob'],
    slotCounts: { '2026-04-15-07': 3, '2026-04-16-07': 2 },
    venueType: 'Sports Hall',
    dateRange: { start: '2026-04-15', end: '2026-04-17' },
    isPublic: false,
    description: 'Early morning gym. Everyone else has submitted, waiting for you!',
  },
  {
    eventId: 'evt-pending-inv-06',
    title: "Alice's Café Hopping [Pending: fresh invite, nothing submitted]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-alice',
    creatorName: 'Alice',
    participants: [
      { userId: 'u-alice', name: 'Alice' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: [],
    slotCounts: {},
    venueType: 'Cafe',
    dateRange: { start: '2026-04-20', end: '2026-04-22' },
    isPublic: false,
    description: 'Exploring new cafes around Tiong Bahru. Pick your free slots!',
  },
  {
    eventId: 'evt-pending-inv-07',
    title: "Ethan's Library Study Group [Pending: you + 1 other haven't submitted]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-ethan',
    creatorName: 'Ethan',
    participants: [
      { userId: 'u-ethan', name: 'Ethan' },
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-hannah', name: 'Hannah' },
    ],
    availabilitySubmittedBy: ['u-ethan', 'u-daisy'],
    slotCounts: { '2026-04-18-14': 2, '2026-04-19-15': 1 },
    venueType: 'Library',
    dateRange: { start: '2026-04-18', end: '2026-04-20' },
    isPublic: false,
    description: 'Study group at the National Library. Submit your afternoon slots.',
  },
  {
    eventId: 'evt-pending-inv-08',
    title: "Hannah's Running Club [Pending: half submitted]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-hannah',
    creatorName: 'Hannah',
    participants: [
      { userId: 'u-hannah', name: 'Hannah' },
      { userId: 'u-bob', name: 'Bob' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-fiona', name: 'Fiona' },
    ],
    availabilitySubmittedBy: ['u-hannah', 'u-bob'],
    slotCounts: { '2026-04-26-07': 2, '2026-04-27-07': 1 },
    venueType: 'Park',
    dateRange: { start: '2026-04-26', end: '2026-04-28' },
    isPublic: false,
    description: 'Weekly running at Bishan Park. Submit your morning slots.',
  },
  {
    eventId: 'evt-pending-inv-09',
    title: "Daisy + Ethan Dinner [Pending: only you haven't voted, 1-slot range]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-daisy',
    creatorName: 'Daisy',
    participants: [
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: 'u-ethan', name: 'Ethan' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: ['u-daisy', 'u-ethan'],
    slotCounts: { '2026-05-01-19': 2 },
    venueType: 'Restaurant',
    dateRange: { start: '2026-05-01', end: '2026-05-01' },
    isPublic: false,
    description: 'Labour Day dinner. Only one slot available — confirm if you can make it!',
  },
  {
    eventId: 'evt-pending-inv-10',
    title: "Charlie's Mall Outing [Pending: large group, you last]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-charlie',
    creatorName: 'Charlie',
    participants: [
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-george', name: 'George' },
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: ['u-charlie', 'u-alice', 'u-george', 'u-fiona'],
    slotCounts: { '2026-05-03-13': 4, '2026-05-03-14': 3, '2026-05-04-13': 2 },
    venueType: 'Mall',
    dateRange: { start: '2026-05-03', end: '2026-05-05' },
    isPublic: false,
    description: 'Shopping + lunch at Orchard. Group of 5, waiting on you to finalise!',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // B. COLLECTING — you're creator, submitted, waiting for others
  //    (appears in EventList "In Progress" section)
  // ════════════════════════════════════════════════════════════════════════════

  {
    eventId: 'evt-coll-creator-01',
    title: 'Weekend Badminton [Creator: waiting for Charlie]',
    status: 'COLLECTING_AVAILABILITY',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-charlie', name: 'Charlie' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-alice'],
    slotCounts: { '2026-04-05-14': 2, '2026-04-06-10': 1 },
    venueType: 'Sports Hall',
    dateRange: { start: '2026-04-05', end: '2026-04-10' },
    isPublic: false,
    description: 'Casual badminton. You and Alice submitted, waiting for Charlie.',
  },
  {
    eventId: 'evt-coll-creator-02',
    title: 'Coding Hackathon Prep [Creator: waiting for 2 more]',
    status: 'COLLECTING_AVAILABILITY',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-ethan', name: 'Ethan' },
      { userId: 'u-george', name: 'George' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID],
    slotCounts: { '2026-04-19-10': 1, '2026-04-20-10': 1 },
    venueType: 'Library',
    dateRange: { start: '2026-04-19', end: '2026-04-21' },
    isPublic: false,
    description: 'Prep session before NUS Hack 2026. Pick a slot to study together.',
  },
  {
    eventId: 'evt-coll-creator-03',
    title: 'Team BBQ @ East Coast [Creator: 1/4 submitted]',
    status: 'COLLECTING_AVAILABILITY',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-daisy', name: 'Daisy' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID],
    slotCounts: { '2026-05-10-17': 1 },
    venueType: 'Park',
    dateRange: { start: '2026-05-10', end: '2026-05-12' },
    isPublic: false,
    description: 'Annual BBQ at East Coast Park. Waiting for 3 friends to submit.',
  },
  {
    eventId: 'evt-coll-creator-04',
    title: 'Yoga Workshop [Creator: 2/3 submitted]',
    status: 'COLLECTING_AVAILABILITY',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: 'u-hannah', name: 'Hannah' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-fiona'],
    slotCounts: { '2026-04-22-08': 2, '2026-04-23-09': 1 },
    venueType: 'Sports Hall',
    dateRange: { start: '2026-04-22', end: '2026-04-24' },
    isPublic: false,
    description: 'Morning yoga. Hannah yet to submit.',
  },
  {
    eventId: 'evt-coll-creator-05',
    title: 'Photography Walk v2 [Creator: solo, waiting for 3]',
    status: 'COLLECTING_AVAILABILITY',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-george', name: 'George' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID],
    slotCounts: { '2026-05-17-09': 1 },
    venueType: 'Park',
    dateRange: { start: '2026-05-17', end: '2026-05-18' },
    isPublic: false,
    description: 'Follow-up photography walk. Need everyone to mark free slots.',
  },
  {
    eventId: 'evt-coll-creator-06',
    title: 'Brunch Planning [Creator: all 3 friends submitted, your last]',
    status: 'COLLECTING_AVAILABILITY',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: ['u-alice', 'u-daisy', 'u-ethan'],
    slotCounts: { '2026-05-24-10': 3, '2026-05-24-11': 2 },
    venueType: 'Cafe',
    dateRange: { start: '2026-05-24', end: '2026-05-25' },
    isPublic: false,
    description: 'Monthly brunch. Everyone else submitted — you still need to vote!',
  },
  {
    eventId: 'evt-coll-creator-07',
    title: 'Library Reading Group [Creator: halfway submitted]',
    status: 'COLLECTING_AVAILABILITY',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: 'u-hannah', name: 'Hannah' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-daisy'],
    slotCounts: { '2026-05-07-14': 2, '2026-05-08-15': 1 },
    venueType: 'Library',
    dateRange: { start: '2026-05-07', end: '2026-05-09' },
    isPublic: false,
    description: 'Book discussion at Bishan library. Hannah yet to pick slots.',
  },
  {
    eventId: 'evt-coll-creator-08',
    title: 'Group Dinner @ Clarke Quay [Creator: 3/5 submitted]',
    status: 'COLLECTING_AVAILABILITY',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-fiona', name: 'Fiona' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-alice', 'u-bob'],
    slotCounts: { '2026-06-05-19': 3, '2026-06-06-19': 2, '2026-06-07-20': 1 },
    venueType: 'Restaurant',
    dateRange: { start: '2026-06-05', end: '2026-06-07' },
    isPublic: false,
    description: 'Celebration dinner. Charlie and Fiona yet to vote.',
  },
  {
    eventId: 'evt-coll-creator-09',
    title: 'Escape Room Night [Creator: just invited 4 people]',
    status: 'COLLECTING_AVAILABILITY',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-ethan', name: 'Ethan' },
      { userId: 'u-george', name: 'George' },
      { userId: 'u-hannah', name: 'Hannah' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID],
    slotCounts: { '2026-06-14-19': 1 },
    venueType: 'Mall',
    dateRange: { start: '2026-06-14', end: '2026-06-15' },
    isPublic: false,
    description: 'Escape room at Vivocity. Just created — waiting for everyone to submit.',
  },
  {
    eventId: 'evt-coll-creator-10',
    title: 'Hiking @ MacRitchie [Creator: 2 friends in, 2 left]',
    status: 'COLLECTING_AVAILABILITY',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: 'u-george', name: 'George' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-bob'],
    slotCounts: { '2026-06-21-07': 2, '2026-06-22-07': 1 },
    venueType: 'Park',
    dateRange: { start: '2026-06-21', end: '2026-06-22' },
    isPublic: false,
    description: 'MacRitchie Tree Top Walk. Fiona and George yet to submit.',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // C. COLLECTING — you're an invited participant, already submitted, waiting
  //    (appears in EventList "In Progress" section)
  // ════════════════════════════════════════════════════════════════════════════

  {
    eventId: 'evt-coll-invited-01',
    title: "Bob's Photography Walk [Participant: submitted, waiting for Bob]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-bob',
    creatorName: 'Bob',
    participants: [
      { userId: 'u-bob', name: 'Bob' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID],
    slotCounts: { '2026-04-08-09': 1, '2026-04-08-10': 1 },
    venueType: 'Park',
    dateRange: { start: '2026-04-08', end: '2026-04-12' },
    isPublic: false,
    description: 'Street photography at Marina Bay. Waiting for Bob.',
  },
  {
    eventId: 'evt-coll-invited-02',
    title: "Alice's Restaurant Reunion [Participant: 2/4 submitted]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-alice',
    creatorName: 'Alice',
    participants: [
      { userId: 'u-alice', name: 'Alice' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-alice'],
    slotCounts: { '2026-04-16-19': 2, '2026-04-17-19': 1 },
    venueType: 'Restaurant',
    dateRange: { start: '2026-04-16', end: '2026-04-18' },
    isPublic: false,
    description: 'Reunion dinner at a nice restaurant. Charlie and Ethan yet to vote.',
  },
  {
    eventId: 'evt-coll-invited-03',
    title: "Ethan's Movie Marathon [Participant: submitted first]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-ethan',
    creatorName: 'Ethan',
    participants: [
      { userId: 'u-ethan', name: 'Ethan' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-fiona', name: 'Fiona' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID],
    slotCounts: { '2026-04-25-15': 1 },
    venueType: 'Mall',
    dateRange: { start: '2026-04-25', end: '2026-04-26' },
    isPublic: false,
    description: 'Back-to-back films at GV Plaza. Waiting for Ethan and Fiona.',
  },
  {
    eventId: 'evt-coll-invited-04',
    title: "George's Basketball Pickup [Participant: you + 2 submitted]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-george',
    creatorName: 'George',
    participants: [
      { userId: 'u-george', name: 'George' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-charlie', name: 'Charlie' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-george', 'u-bob'],
    slotCounts: { '2026-05-02-18': 3, '2026-05-03-17': 2 },
    venueType: 'Sports Hall',
    dateRange: { start: '2026-05-02', end: '2026-05-04' },
    isPublic: false,
    description: 'Pickup basketball. Only Charlie left to submit.',
  },
  {
    eventId: 'evt-coll-invited-05',
    title: "Hannah's Cycling Group [Participant: large group, 3/5 done]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-hannah',
    creatorName: 'Hannah',
    participants: [
      { userId: 'u-hannah', name: 'Hannah' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-fiona', name: 'Fiona' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-hannah', 'u-alice'],
    slotCounts: { '2026-05-09-07': 3, '2026-05-10-08': 2 },
    venueType: 'Park',
    dateRange: { start: '2026-05-09', end: '2026-05-11' },
    isPublic: false,
    description: 'Cycling around East Coast Park. Bob and Fiona still pending.',
  },
  {
    eventId: 'evt-coll-invited-06',
    title: "Fiona's Cafe Crawl [Participant: small group, all submitted]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-fiona',
    creatorName: 'Fiona',
    participants: [
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-fiona'],
    slotCounts: { '2026-05-14-10': 2, '2026-05-14-11': 1 },
    venueType: 'Cafe',
    dateRange: { start: '2026-05-14', end: '2026-05-15' },
    isPublic: false,
    description: 'Both submitted! Waiting for Fiona to pick the final slot.',
  },
  {
    eventId: 'evt-coll-invited-07',
    title: "Daisy's Library Seminar [Participant: submitted last]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-daisy',
    creatorName: 'Daisy',
    participants: [
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: 'u-ethan', name: 'Ethan' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: ['u-daisy', 'u-ethan', CURRENT_USER_ID],
    slotCounts: { '2026-05-21-14': 3, '2026-05-22-15': 2 },
    venueType: 'Library',
    dateRange: { start: '2026-05-21', end: '2026-05-23' },
    isPublic: false,
    description: 'All 3 submitted. Daisy will select the slot soon.',
  },
  {
    eventId: 'evt-coll-invited-08',
    title: "Charlie's Karaoke Night [Participant: you + creator submitted]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-charlie',
    creatorName: 'Charlie',
    participants: [
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-george', name: 'George' },
      { userId: 'u-hannah', name: 'Hannah' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-charlie'],
    slotCounts: { '2026-05-30-20': 2 },
    venueType: 'Mall',
    dateRange: { start: '2026-05-30', end: '2026-05-31' },
    isPublic: false,
    description: 'Karaoke at Orchard. George and Hannah yet to submit.',
  },
  {
    eventId: 'evt-coll-invited-09',
    title: "Bob's Fishing Trip [Participant: you're the last to submit]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-bob',
    creatorName: 'Bob',
    participants: [
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-george', name: 'George' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: ['u-bob', 'u-george', CURRENT_USER_ID],
    slotCounts: { '2026-06-07-06': 3, '2026-06-08-06': 2 },
    venueType: 'Park',
    dateRange: { start: '2026-06-07', end: '2026-06-09' },
    isPublic: false,
    description: 'Fishing at Pasir Ris. All submitted, Bob will finalize soon.',
  },
  {
    eventId: 'evt-coll-invited-10',
    title: "Ethan's Birthday Dinner [Participant: 4/5 submitted]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-ethan',
    creatorName: 'Ethan',
    participants: [
      { userId: 'u-ethan', name: 'Ethan' },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-fiona', name: 'Fiona' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-ethan', 'u-alice', 'u-daisy'],
    slotCounts: { '2026-06-20-19': 4, '2026-06-21-19': 3 },
    venueType: 'Restaurant',
    dateRange: { start: '2026-06-20', end: '2026-06-22' },
    isPublic: false,
    description: "Ethan's birthday celebration. Only Fiona left to submit.",
  },

  // ════════════════════════════════════════════════════════════════════════════
  // D. SCHEDULING — you're creator, all submitted → generates ALL_SUBMITTED notifications
  //    (appears in EventList "In Progress" section; generates bell notifications)
  // ════════════════════════════════════════════════════════════════════════════

  {
    eventId: 'evt-selving-creator-01',
    title: 'Team Lunch @ Orchard [Creator: pick slot + venue now!]',
    status: 'SCHEDULING',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-daisy', name: 'Daisy' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-alice', 'u-daisy'],
    slotCounts: { '2026-04-02-12': 3, '2026-04-02-13': 3, '2026-04-02-14': 2, '2026-04-03-12': 1 },
    venueType: 'Restaurant',
    dateRange: { start: '2026-04-02', end: '2026-04-04' },
    isPublic: false,
    description: 'Monthly team lunch. All 3 submitted — pick the winning slot!',
  },
  {
    eventId: 'evt-selving-creator-02',
    title: 'Yoga & Brunch [Creator: 2-person, clear winner slot]',
    status: 'SCHEDULING',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-fiona', name: 'Fiona' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-fiona'],
    slotCounts: { '2026-04-09-08': 2, '2026-04-10-09': 1 },
    venueType: 'Sports Hall',
    dateRange: { start: '2026-04-09', end: '2026-04-11' },
    isPublic: false,
    description: 'You and Fiona both available 9 Apr 8AM. Select it!',
  },
  {
    eventId: 'evt-selving-creator-03',
    title: 'Park BBQ Planning [Creator: 4 pax all voted]',
    status: 'SCHEDULING',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-charlie', name: 'Charlie' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-alice', 'u-bob', 'u-charlie'],
    slotCounts: { '2026-04-19-16': 4, '2026-04-20-16': 3, '2026-04-20-17': 2 },
    venueType: 'Park',
    dateRange: { start: '2026-04-19', end: '2026-04-21' },
    isPublic: false,
    description: 'BBQ at East Coast Park. All 4 submitted — Sat 16:00 is top pick.',
  },
  {
    eventId: 'evt-selving-creator-04',
    title: 'Café Hop @ Tiong Bahru [Creator: 3-way tie, choose wisely]',
    status: 'SCHEDULING',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-daisy', 'u-ethan'],
    slotCounts: { '2026-04-26-10': 3, '2026-04-26-11': 3, '2026-04-27-10': 2 },
    venueType: 'Cafe',
    dateRange: { start: '2026-04-26', end: '2026-04-27' },
    isPublic: false,
    description: 'Café crawl. 10AM and 11AM both tied at 3 votes — you decide!',
  },
  {
    eventId: 'evt-selving-creator-05',
    title: 'Library Group Study [Creator: only 1 slot fits everyone]',
    status: 'SCHEDULING',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-george', name: 'George' },
      { userId: 'u-hannah', name: 'Hannah' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-george', 'u-hannah'],
    slotCounts: { '2026-05-07-14': 3, '2026-05-08-15': 1 },
    venueType: 'Library',
    dateRange: { start: '2026-05-07', end: '2026-05-09' },
    isPublic: false,
    description: 'Study session. Only Wed 14:00 works for everyone.',
  },
  {
    eventId: 'evt-selving-creator-06',
    title: 'Shopping @ Vivocity [Creator: 5-person all aligned]',
    status: 'SCHEDULING',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: 'u-george', name: 'George' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-alice', 'u-bob', 'u-fiona', 'u-george'],
    slotCounts: { '2026-05-17-13': 5, '2026-05-18-13': 4, '2026-05-17-14': 3 },
    venueType: 'Mall',
    dateRange: { start: '2026-05-17', end: '2026-05-18' },
    isPublic: false,
    description: 'All 5 voted! Sat 13:00 is the clear winner.',
  },
  {
    eventId: 'evt-selving-creator-07',
    title: 'Cycling @ Pasir Ris [Creator: early AM slots popular]',
    status: 'SCHEDULING',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-charlie', name: 'Charlie' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-bob', 'u-charlie'],
    slotCounts: { '2026-05-24-07': 3, '2026-05-24-08': 2, '2026-05-25-07': 1 },
    venueType: 'Park',
    dateRange: { start: '2026-05-24', end: '2026-05-25' },
    isPublic: false,
    description: '7AM start all popular. Lock it in!',
  },
  {
    eventId: 'evt-selving-creator-08',
    title: 'Birthday Dinner for Alice [Creator: evening slots only]',
    status: 'SCHEDULING',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-alice', 'u-daisy', 'u-ethan'],
    slotCounts: { '2026-06-05-19': 4, '2026-06-05-20': 3, '2026-06-06-19': 2 },
    venueType: 'Restaurant',
    dateRange: { start: '2026-06-05', end: '2026-06-07' },
    isPublic: false,
    description: "Alice's birthday! Pick the best evening slot.",
  },
  {
    eventId: 'evt-selving-creator-09',
    title: 'Sports Hall Volleyball [Creator: slots clustered same day]',
    status: 'SCHEDULING',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-george', name: 'George' },
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-bob', name: 'Bob' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-george', 'u-charlie', 'u-bob'],
    slotCounts: { '2026-06-14-15': 4, '2026-06-14-16': 4, '2026-06-14-17': 3 },
    venueType: 'Sports Hall',
    dateRange: { start: '2026-06-14', end: '2026-06-15' },
    isPublic: false,
    description: 'All slots on Sat. 3PM and 4PM tied at 4 each.',
  },
  {
    eventId: 'evt-selving-creator-10',
    title: 'Art Jam @ Cafe [Creator: many slots scattered]',
    status: 'SCHEDULING',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: 'u-hannah', name: 'Hannah' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-fiona', 'u-daisy', 'u-hannah'],
    slotCounts: {
      '2026-06-21-10': 4,
      '2026-06-21-11': 3,
      '2026-06-22-10': 2,
      '2026-06-22-14': 2,
      '2026-06-23-10': 1,
    },
    venueType: 'Cafe',
    dateRange: { start: '2026-06-21', end: '2026-06-23' },
    isPublic: false,
    description: 'Art jam brunch. 5 viable slots across 3 days — you pick!',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // E. SCHEDULING — you're participant, creator hasn't picked yet
  //    (appears in EventList "In Progress" section)
  // ════════════════════════════════════════════════════════════════════════════

  {
    eventId: 'evt-selving-part-01',
    title: "Daisy's Board Games Night [Participant: waiting for Daisy to pick]",
    status: 'SCHEDULING',
    creatorId: 'u-daisy',
    creatorName: 'Daisy',
    participants: [
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: ['u-daisy', CURRENT_USER_ID, 'u-ethan'],
    slotCounts: { '2026-04-05-19': 3, '2026-04-05-20': 2, '2026-04-06-18': 1 },
    venueType: 'Cafe',
    dateRange: { start: '2026-04-05', end: '2026-04-07' },
    isPublic: false,
    description: 'Waiting for Daisy to choose the slot and venue.',
  },
  {
    eventId: 'evt-selving-part-02',
    title: "Alice's Spa Day [Participant: all submitted, creator selecting]",
    status: 'SCHEDULING',
    creatorId: 'u-alice',
    creatorName: 'Alice',
    participants: [
      { userId: 'u-alice', name: 'Alice' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-fiona', name: 'Fiona' },
    ],
    availabilitySubmittedBy: ['u-alice', CURRENT_USER_ID, 'u-fiona'],
    slotCounts: { '2026-04-12-10': 3, '2026-04-13-11': 2 },
    venueType: 'Mall',
    dateRange: { start: '2026-04-12', end: '2026-04-14' },
    isPublic: false,
    description: 'Spa and shopping day. Alice is picking.',
  },
  {
    eventId: 'evt-selving-part-03',
    title: "Bob's Fishing Trip [Participant: 3-person, awaiting selection]",
    status: 'SCHEDULING',
    creatorId: 'u-bob',
    creatorName: 'Bob',
    participants: [
      { userId: 'u-bob', name: 'Bob' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-george', name: 'George' },
    ],
    availabilitySubmittedBy: ['u-bob', CURRENT_USER_ID, 'u-george'],
    slotCounts: { '2026-04-19-06': 3, '2026-04-20-06': 2 },
    venueType: 'Park',
    dateRange: { start: '2026-04-19', end: '2026-04-21' },
    isPublic: false,
    description: 'Fishing trip. Bob is choosing the best dawn slot.',
  },
  {
    eventId: 'evt-selving-part-04',
    title: "Charlie's Bowling Night [Participant: waiting on creator]",
    status: 'SCHEDULING',
    creatorId: 'u-charlie',
    creatorName: 'Charlie',
    participants: [
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-hannah', name: 'Hannah' },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: ['u-charlie', CURRENT_USER_ID, 'u-hannah', 'u-ethan'],
    slotCounts: { '2026-04-26-20': 4, '2026-04-27-19': 3 },
    venueType: 'Mall',
    dateRange: { start: '2026-04-26', end: '2026-04-28' },
    isPublic: false,
    description: "Bowling at Orchid Country Club. Charlie hasn't locked in yet.",
  },
  {
    eventId: 'evt-selving-part-05',
    title: "Ethan's Cooking Class [Participant: 5-pax submitted]",
    status: 'SCHEDULING',
    creatorId: 'u-ethan',
    creatorName: 'Ethan',
    participants: [
      { userId: 'u-ethan', name: 'Ethan' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: 'u-fiona', name: 'Fiona' },
    ],
    availabilitySubmittedBy: ['u-ethan', CURRENT_USER_ID, 'u-alice', 'u-daisy', 'u-fiona'],
    slotCounts: { '2026-05-03-14': 5, '2026-05-04-14': 4, '2026-05-04-15': 3 },
    venueType: 'Restaurant',
    dateRange: { start: '2026-05-03', end: '2026-05-05' },
    isPublic: false,
    description: 'Cooking class at a Tanjong Pagar kitchen. Ethan selecting.',
  },
  {
    eventId: 'evt-selving-part-06',
    title: "George's Gym Circuit [Participant: waiting for venue pick]",
    status: 'SCHEDULING',
    creatorId: 'u-george',
    creatorName: 'George',
    participants: [
      { userId: 'u-george', name: 'George' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-bob', name: 'Bob' },
    ],
    availabilitySubmittedBy: ['u-george', CURRENT_USER_ID, 'u-bob'],
    slotCounts: { '2026-05-10-07': 3, '2026-05-11-07': 2 },
    venueType: 'Sports Hall',
    dateRange: { start: '2026-05-10', end: '2026-05-12' },
    isPublic: false,
    description: 'Morning gym circuit. George picking the ActiveSG venue.',
  },
  {
    eventId: 'evt-selving-part-07',
    title: "Hannah's Bake Sale Prep [Participant: only 2 viable slots]",
    status: 'SCHEDULING',
    creatorId: 'u-hannah',
    creatorName: 'Hannah',
    participants: [
      { userId: 'u-hannah', name: 'Hannah' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-daisy', name: 'Daisy' },
    ],
    availabilitySubmittedBy: ['u-hannah', CURRENT_USER_ID, 'u-daisy'],
    slotCounts: { '2026-05-17-10': 3, '2026-05-18-10': 2 },
    venueType: 'Cafe',
    dateRange: { start: '2026-05-17', end: '2026-05-19' },
    isPublic: false,
    description: 'Bake sale prep at a community cafe. Hannah choosing.',
  },
  {
    eventId: 'evt-selving-part-08',
    title: "Fiona's Photography Portfolio [Participant: all slots same count]",
    status: 'SCHEDULING',
    creatorId: 'u-fiona',
    creatorName: 'Fiona',
    participants: [
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: ['u-fiona', CURRENT_USER_ID],
    slotCounts: { '2026-05-24-09': 2, '2026-05-24-10': 2 },
    venueType: 'Park',
    dateRange: { start: '2026-05-24', end: '2026-05-25' },
    isPublic: false,
    description: 'Golden hour portrait shoot. Both slots tied — Fiona decides.',
  },
  {
    eventId: 'evt-selving-part-09',
    title: "Alice's Library Quiet Hour [Participant: 4/4 submitted]",
    status: 'SCHEDULING',
    creatorId: 'u-alice',
    creatorName: 'Alice',
    participants: [
      { userId: 'u-alice', name: 'Alice' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: ['u-alice', CURRENT_USER_ID, 'u-charlie', 'u-ethan'],
    slotCounts: { '2026-06-01-14': 4, '2026-06-01-15': 3, '2026-06-02-14': 2 },
    venueType: 'Library',
    dateRange: { start: '2026-06-01', end: '2026-06-03' },
    isPublic: false,
    description: 'Quiet study session at Central Library. Alice finalising.',
  },
  {
    eventId: 'evt-selving-part-10',
    title: "Bob's Seafood Dinner [Participant: large group fully voted]",
    status: 'SCHEDULING',
    creatorId: 'u-bob',
    creatorName: 'Bob',
    participants: [
      { userId: 'u-bob', name: 'Bob' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-george', name: 'George' },
    ],
    availabilitySubmittedBy: ['u-bob', CURRENT_USER_ID, 'u-alice', 'u-charlie', 'u-george'],
    slotCounts: { '2026-06-07-19': 5, '2026-06-08-19': 4, '2026-06-07-20': 3 },
    venueType: 'Restaurant',
    dateRange: { start: '2026-06-07', end: '2026-06-09' },
    isPublic: false,
    description: 'Seafood feast at East Coast Park. Bob is picking the time.',
  },

  // ════════════════════════════════════════════════════════════════════════════
  // F. AWAITING_CONFIRMATION — you haven't confirmed → ATTENDANCE_REQUEST notifications
  //    (appears in Notifications page only until you respond)
  // ════════════════════════════════════════════════════════════════════════════

  {
    eventId: 'evt-await-unconfirmed-01',
    title: "Friday Cycling Trip [Await: you haven't confirmed]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-charlie',
    creatorName: 'Charlie',
    participants: [
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-bob', name: 'Bob' },
    ],
    availabilitySubmittedBy: ['u-charlie', CURRENT_USER_ID, 'u-bob'],
    slotCounts: { '2026-04-11-08': 3, '2026-04-11-09': 2 },
    confirmedUserIds: ['u-charlie'],
    declinedUserIds: [],
    venueType: 'Park',
    dateRange: { start: '2026-04-11', end: '2026-04-13' },
    isPublic: false,
    description: 'Morning cycling at East Coast Park. Confirm your attendance!',
    selectedTime: { date: '2026-04-11', startHour: 8 },
    selectedVenue: MOCK_VENUES[4],
  },
  {
    eventId: 'evt-await-unconfirmed-02',
    title: "Restaurant Birthday Bash [Await: nobody confirmed yet]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-alice',
    creatorName: 'Alice',
    participants: [
      { userId: 'u-alice', name: 'Alice' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-daisy', name: 'Daisy' },
    ],
    availabilitySubmittedBy: ['u-alice', CURRENT_USER_ID, 'u-bob', 'u-daisy'],
    slotCounts: { '2026-04-18-19': 4 },
    confirmedUserIds: [],
    declinedUserIds: [],
    venueType: 'Restaurant',
    dateRange: { start: '2026-04-18', end: '2026-04-19' },
    isPublic: false,
    description: 'Birthday dinner for Alice. Nobody has confirmed yet.',
    selectedTime: { date: '2026-04-18', startHour: 19 },
    selectedVenue: MOCK_VENUES[3],
  },
  {
    eventId: 'evt-await-unconfirmed-03',
    title: "Sports Hall Badminton [Await: 1 confirmed, you pending]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-george',
    creatorName: 'George',
    participants: [
      { userId: 'u-george', name: 'George' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-charlie', name: 'Charlie' },
    ],
    availabilitySubmittedBy: ['u-george', CURRENT_USER_ID, 'u-charlie'],
    slotCounts: { '2026-04-26-14': 3 },
    confirmedUserIds: ['u-george'],
    declinedUserIds: [],
    venueType: 'Sports Hall',
    dateRange: { start: '2026-04-26', end: '2026-04-27' },
    isPublic: false,
    description: 'Badminton doubles. George confirmed, waiting on you and Charlie.',
    selectedTime: { date: '2026-04-26', startHour: 14 },
    selectedVenue: MOCK_VENUES[0],
  },
  {
    eventId: 'evt-await-unconfirmed-04',
    title: "Café Catch-up [Await: just 2 pax, you pending]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-fiona',
    creatorName: 'Fiona',
    participants: [
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: ['u-fiona', CURRENT_USER_ID],
    slotCounts: { '2026-05-03-10': 2 },
    confirmedUserIds: [],
    declinedUserIds: [],
    venueType: 'Cafe',
    dateRange: { start: '2026-05-03', end: '2026-05-04' },
    isPublic: false,
    description: 'Quick catch-up over coffee. Fiona selected the slot.',
    selectedTime: { date: '2026-05-03', startHour: 10 },
    selectedVenue: MOCK_VENUES[3],
  },
  {
    eventId: 'evt-await-unconfirmed-05',
    title: "Library Reading Meetup [Await: 2/4 confirmed, you pending]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-ethan',
    creatorName: 'Ethan',
    participants: [
      { userId: 'u-ethan', name: 'Ethan' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: 'u-hannah', name: 'Hannah' },
    ],
    availabilitySubmittedBy: ['u-ethan', CURRENT_USER_ID, 'u-daisy', 'u-hannah'],
    slotCounts: { '2026-05-10-14': 4 },
    confirmedUserIds: ['u-ethan', 'u-daisy'],
    declinedUserIds: [],
    venueType: 'Library',
    dateRange: { start: '2026-05-10', end: '2026-05-11' },
    isPublic: false,
    description: 'Reading meetup at Jurong library. Ethan and Daisy confirmed.',
    selectedTime: { date: '2026-05-10', startHour: 14 },
    selectedVenue: MOCK_VENUES[1],
  },
  {
    eventId: 'evt-await-unconfirmed-06',
    title: "Mall Shopping Spree [Await: you and 1 other pending]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-charlie',
    creatorName: 'Charlie',
    participants: [
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
    ],
    availabilitySubmittedBy: ['u-charlie', CURRENT_USER_ID, 'u-alice'],
    slotCounts: { '2026-05-17-13': 3 },
    confirmedUserIds: ['u-charlie'],
    declinedUserIds: [],
    venueType: 'Mall',
    dateRange: { start: '2026-05-17', end: '2026-05-18' },
    isPublic: false,
    description: 'Mall trip at ION Orchard. Charlie confirmed, you and Alice pending.',
    selectedTime: { date: '2026-05-17', startHour: 13 },
    selectedVenue: MOCK_VENUES[5],
  },
  {
    eventId: 'evt-await-unconfirmed-07',
    title: "Park Sunrise Run [Await: early bird event, you pending]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-hannah',
    creatorName: 'Hannah',
    participants: [
      { userId: 'u-hannah', name: 'Hannah' },
      { userId: 'u-bob', name: 'Bob' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
    ],
    availabilitySubmittedBy: ['u-hannah', 'u-bob', CURRENT_USER_ID],
    slotCounts: { '2026-05-24-06': 3 },
    confirmedUserIds: ['u-hannah', 'u-bob'],
    declinedUserIds: [],
    venueType: 'Park',
    dateRange: { start: '2026-05-24', end: '2026-05-25' },
    isPublic: false,
    description: 'Sunrise run at Bishan Park. Hannah and Bob confirmed. Your move!',
    selectedTime: { date: '2026-05-24', startHour: 6 },
    selectedVenue: MOCK_VENUES[4],
  },
  {
    eventId: 'evt-await-unconfirmed-08',
    title: "Seafood Dinner [Await: large group, you and 2 others pending]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-bob',
    creatorName: 'Bob',
    participants: [
      { userId: 'u-bob', name: 'Bob' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-george', name: 'George' },
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: ['u-bob', CURRENT_USER_ID, 'u-george', 'u-fiona', 'u-ethan'],
    slotCounts: { '2026-06-01-19': 5 },
    confirmedUserIds: ['u-bob'],
    declinedUserIds: ['u-george'],
    venueType: 'Restaurant',
    dateRange: { start: '2026-06-01', end: '2026-06-02' },
    isPublic: false,
    description: 'Seafood at JUMBO. Bob confirmed, George declined. You, Fiona, Ethan pending.',
    selectedTime: { date: '2026-06-01', startHour: 19 },
    selectedVenue: MOCK_VENUES[3],
  },
  {
    eventId: 'evt-await-unconfirmed-09',
    title: "Volleyball Tournament Warmup [Await: all pending except creator]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-george',
    creatorName: 'George',
    participants: [
      { userId: 'u-george', name: 'George' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-alice', name: 'Alice' },
    ],
    availabilitySubmittedBy: ['u-george', CURRENT_USER_ID, 'u-charlie', 'u-alice'],
    slotCounts: { '2026-06-14-15': 4 },
    confirmedUserIds: ['u-george'],
    declinedUserIds: [],
    venueType: 'Sports Hall',
    dateRange: { start: '2026-06-14', end: '2026-06-15' },
    isPublic: false,
    description: 'Pre-tournament warmup. Only George confirmed so far.',
    selectedTime: { date: '2026-06-14', startHour: 15 },
    selectedVenue: MOCK_VENUES[1],
  },
  {
    eventId: 'evt-await-unconfirmed-10',
    title: "Art Exhibition Visit [Await: 1 confirmed 1 declined, you pending]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-daisy',
    creatorName: 'Daisy',
    participants: [
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: 'u-hannah', name: 'Hannah' },
    ],
    availabilitySubmittedBy: ['u-daisy', CURRENT_USER_ID, 'u-fiona', 'u-hannah'],
    slotCounts: { '2026-06-21-11': 4 },
    confirmedUserIds: ['u-daisy'],
    declinedUserIds: ['u-fiona'],
    venueType: 'Mall',
    dateRange: { start: '2026-06-21', end: '2026-06-22' },
    isPublic: false,
    description: 'National Gallery visit. Daisy confirmed, Fiona declined. You and Hannah pending.',
    selectedTime: { date: '2026-06-21', startHour: 11 },
    selectedVenue: MOCK_VENUES[5],
  },

  // ════════════════════════════════════════════════════════════════════════════
  // G. AWAITING_CONFIRMATION — you confirmed, waiting for others
  //    (appears in EventList "Awaiting Confirmation" section)
  // ════════════════════════════════════════════════════════════════════════════

  {
    eventId: 'evt-await-confirmed-01',
    title: "Brunch @ Tiong Bahru [Confirmed: waiting for Ethan]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-alice',
    creatorName: 'Alice',
    participants: [
      { userId: 'u-alice', name: 'Alice' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: ['u-alice', CURRENT_USER_ID, 'u-ethan'],
    slotCounts: { '2026-04-13-10': 3, '2026-04-13-11': 2 },
    confirmedUserIds: ['u-alice', CURRENT_USER_ID],
    declinedUserIds: [],
    venueType: 'Cafe',
    dateRange: { start: '2026-04-13', end: '2026-04-14' },
    isPublic: false,
    description: 'Sunday brunch at Tiong Bahru. Waiting for Ethan to confirm.',
    selectedTime: { date: '2026-04-13', startHour: 10 },
    selectedVenue: {
      venueId: 'venue-tiong-bahru',
      name: 'Plain Vanilla @ Tiong Bahru',
      address: '1D Yong Siak St, Singapore 168641',
      rating: 4.5,
      distanceKm: 1.4,
      estimatedMinutes: 18,
    },
  },
  {
    eventId: 'evt-await-confirmed-02',
    title: "Park Jog [Confirmed: just you, waiting for all others]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-hannah',
    creatorName: 'Hannah',
    participants: [
      { userId: 'u-hannah', name: 'Hannah' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-bob', name: 'Bob' },
    ],
    availabilitySubmittedBy: ['u-hannah', CURRENT_USER_ID, 'u-bob'],
    slotCounts: { '2026-04-20-07': 3 },
    confirmedUserIds: [CURRENT_USER_ID],
    declinedUserIds: [],
    venueType: 'Park',
    dateRange: { start: '2026-04-20', end: '2026-04-21' },
    isPublic: false,
    description: 'Morning jog. You confirmed first, waiting for Hannah and Bob.',
    selectedTime: { date: '2026-04-20', startHour: 7 },
    selectedVenue: MOCK_VENUES[4],
  },
  {
    eventId: 'evt-await-confirmed-03',
    title: "Library Study [Confirmed: you + creator, 1 left]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-daisy',
    creatorName: 'Daisy',
    participants: [
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: ['u-daisy', CURRENT_USER_ID, 'u-ethan'],
    slotCounts: { '2026-04-27-14': 3 },
    confirmedUserIds: ['u-daisy', CURRENT_USER_ID],
    declinedUserIds: [],
    venueType: 'Library',
    dateRange: { start: '2026-04-27', end: '2026-04-28' },
    isPublic: false,
    description: 'Study session. Only Ethan yet to confirm.',
    selectedTime: { date: '2026-04-27', startHour: 14 },
    selectedVenue: MOCK_VENUES[1],
  },
  {
    eventId: 'evt-await-confirmed-04',
    title: "Volleyball Game [Confirmed: 3/4 done, 1 pending]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-george',
    creatorName: 'George',
    participants: [
      { userId: 'u-george', name: 'George' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-bob', name: 'Bob' },
    ],
    availabilitySubmittedBy: ['u-george', CURRENT_USER_ID, 'u-charlie', 'u-bob'],
    slotCounts: { '2026-05-04-16': 4 },
    confirmedUserIds: ['u-george', CURRENT_USER_ID, 'u-charlie'],
    declinedUserIds: [],
    venueType: 'Sports Hall',
    dateRange: { start: '2026-05-04', end: '2026-05-05' },
    isPublic: false,
    description: 'Volleyball at Kallang. Bob is the last to confirm.',
    selectedTime: { date: '2026-05-04', startHour: 16 },
    selectedVenue: MOCK_VENUES[2],
  },
  {
    eventId: 'evt-await-confirmed-05',
    title: "Ramen Dinner [Confirmed: all except one who declined]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-charlie',
    creatorName: 'Charlie',
    participants: [
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: 'u-alice', name: 'Alice' },
    ],
    availabilitySubmittedBy: ['u-charlie', CURRENT_USER_ID, 'u-fiona', 'u-alice'],
    slotCounts: { '2026-05-11-19': 4 },
    confirmedUserIds: ['u-charlie', CURRENT_USER_ID, 'u-fiona'],
    declinedUserIds: ['u-alice'],
    venueType: 'Restaurant',
    dateRange: { start: '2026-05-11', end: '2026-05-12' },
    isPublic: false,
    description: 'Ramen at Ippudo. Alice declined, 3 others confirmed. Almost there!',
    selectedTime: { date: '2026-05-11', startHour: 19 },
    selectedVenue: MOCK_VENUES[3],
  },
  {
    eventId: 'evt-await-confirmed-06',
    title: "Café Work Session [Confirmed: you and 1 other]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-ethan',
    creatorName: 'Ethan',
    participants: [
      { userId: 'u-ethan', name: 'Ethan' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-daisy', name: 'Daisy' },
    ],
    availabilitySubmittedBy: ['u-ethan', CURRENT_USER_ID, 'u-daisy'],
    slotCounts: { '2026-05-18-10': 3 },
    confirmedUserIds: ['u-ethan', CURRENT_USER_ID],
    declinedUserIds: [],
    venueType: 'Cafe',
    dateRange: { start: '2026-05-18', end: '2026-05-19' },
    isPublic: false,
    description: 'Remote work session over coffee. Daisy still needs to confirm.',
    selectedTime: { date: '2026-05-18', startHour: 10 },
    selectedVenue: MOCK_VENUES[5],
  },
  {
    eventId: 'evt-await-confirmed-07',
    title: "Mall Pop-Up Visit [Confirmed: you and creator, rest pending]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-fiona',
    creatorName: 'Fiona',
    participants: [
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-hannah', name: 'Hannah' },
      { userId: 'u-alice', name: 'Alice' },
    ],
    availabilitySubmittedBy: ['u-fiona', CURRENT_USER_ID, 'u-hannah', 'u-alice'],
    slotCounts: { '2026-05-25-13': 4 },
    confirmedUserIds: ['u-fiona', CURRENT_USER_ID],
    declinedUserIds: [],
    venueType: 'Mall',
    dateRange: { start: '2026-05-25', end: '2026-05-26' },
    isPublic: false,
    description: 'Pop-up market visit at Bugis+. Hannah and Alice yet to respond.',
    selectedTime: { date: '2026-05-25', startHour: 13 },
    selectedVenue: MOCK_VENUES[5],
  },
  {
    eventId: 'evt-await-confirmed-08',
    title: "Evening Run Group [Confirmed: 4/5, waiting on last]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-hannah',
    creatorName: 'Hannah',
    participants: [
      { userId: 'u-hannah', name: 'Hannah' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-bob', name: 'Bob' },
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: 'u-george', name: 'George' },
    ],
    availabilitySubmittedBy: ['u-hannah', CURRENT_USER_ID, 'u-bob', 'u-fiona', 'u-george'],
    slotCounts: { '2026-06-01-18': 5 },
    confirmedUserIds: ['u-hannah', CURRENT_USER_ID, 'u-bob', 'u-fiona'],
    declinedUserIds: [],
    venueType: 'Park',
    dateRange: { start: '2026-06-01', end: '2026-06-02' },
    isPublic: false,
    description: 'Evening run at Bukit Timah. 4/5 confirmed, George pending.',
    selectedTime: { date: '2026-06-01', startHour: 18 },
    selectedVenue: MOCK_VENUES[4],
  },
  {
    eventId: 'evt-await-confirmed-09',
    title: "Dinner @ Dempsey [Confirmed: small group, all bar 1]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-bob',
    creatorName: 'Bob',
    participants: [
      { userId: 'u-bob', name: 'Bob' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-charlie', name: 'Charlie' },
    ],
    availabilitySubmittedBy: ['u-bob', CURRENT_USER_ID, 'u-charlie'],
    slotCounts: { '2026-06-08-19': 3 },
    confirmedUserIds: ['u-bob', CURRENT_USER_ID],
    declinedUserIds: [],
    venueType: 'Restaurant',
    dateRange: { start: '2026-06-08', end: '2026-06-09' },
    isPublic: false,
    description: 'Dinner at PS Cafe, Dempsey. Charlie yet to confirm.',
    selectedTime: { date: '2026-06-08', startHour: 19 },
    selectedVenue: MOCK_VENUES[3],
  },
  {
    eventId: 'evt-await-confirmed-10',
    title: "Basketball Pickup [Confirmed: 3/4, someone declined]",
    status: 'AWAITING_CONFIRMATION',
    creatorId: 'u-george',
    creatorName: 'George',
    participants: [
      { userId: 'u-george', name: 'George' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: ['u-george', CURRENT_USER_ID, 'u-charlie', 'u-ethan'],
    slotCounts: { '2026-06-15-18': 4 },
    confirmedUserIds: ['u-george', CURRENT_USER_ID, 'u-charlie'],
    declinedUserIds: ['u-ethan'],
    venueType: 'Sports Hall',
    dateRange: { start: '2026-06-15', end: '2026-06-16' },
    isPublic: false,
    description: 'Pickup basketball. Ethan declined, 3 confirmed. Waiting for status to finalise.',
    selectedTime: { date: '2026-06-15', startHour: 18 },
    selectedVenue: MOCK_VENUES[0],
  },

  // ════════════════════════════════════════════════════════════════════════════
  // H. FINALIZED — confirmed, read-only
  //    (appears in EventList "Confirmed Events" section)
  // ════════════════════════════════════════════════════════════════════════════

  {
    eventId: 'evt-final-01',
    title: 'Morning Coffee @ Bugis [Finalized ✓]',
    status: 'FINALIZED',
    creatorId: 'u-alice',
    creatorName: 'Alice',
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
      { userId: 'u-bob', name: 'Bob' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-alice', 'u-bob'],
    slotCounts: { '2026-03-28-10': 3 },
    confirmedUserIds: [CURRENT_USER_ID, 'u-alice', 'u-bob'],
    declinedUserIds: [],
    venueType: 'Cafe',
    dateRange: { start: '2026-03-28', end: '2026-03-28' },
    isPublic: false,
    selectedTime: { date: '2026-03-28', startHour: 10 },
    selectedVenue: {
      venueId: 'venue-morning-bean',
      name: 'Morning Bean @ Bugis',
      address: '200 Victoria St, Singapore 188021',
      rating: 4.4,
      distanceKm: 1.1,
      estimatedMinutes: 15,
    },
  },
  {
    eventId: 'evt-final-02',
    title: "Bob's Photography Walk [Finalized ✓]",
    status: 'FINALIZED',
    creatorId: 'u-bob',
    creatorName: 'Bob',
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-bob', name: 'Bob' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-bob'],
    slotCounts: { '2026-03-22-09': 2 },
    confirmedUserIds: [CURRENT_USER_ID, 'u-bob'],
    declinedUserIds: [],
    venueType: 'Park',
    dateRange: { start: '2026-03-22', end: '2026-03-23' },
    isPublic: false,
    selectedTime: { date: '2026-03-22', startHour: 9 },
    selectedVenue: MOCK_VENUES[4],
  },
  {
    eventId: 'evt-final-03',
    title: 'Badminton Doubles [Finalized ✓]',
    status: 'FINALIZED',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-charlie', name: 'Charlie' },
      { userId: 'u-george', name: 'George' },
      { userId: 'u-alice', name: 'Alice' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-charlie', 'u-george', 'u-alice'],
    slotCounts: { '2026-03-15-15': 4 },
    confirmedUserIds: [CURRENT_USER_ID, 'u-charlie', 'u-george', 'u-alice'],
    declinedUserIds: [],
    venueType: 'Sports Hall',
    dateRange: { start: '2026-03-15', end: '2026-03-16' },
    isPublic: false,
    selectedTime: { date: '2026-03-15', startHour: 15 },
    selectedVenue: MOCK_VENUES[0],
  },
  {
    eventId: 'evt-final-04',
    title: 'Laksa Lunch [Finalized ✓]',
    status: 'FINALIZED',
    creatorId: 'u-daisy',
    creatorName: 'Daisy',
    participants: [
      { userId: 'u-daisy', name: 'Daisy' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-ethan', name: 'Ethan' },
    ],
    availabilitySubmittedBy: ['u-daisy', CURRENT_USER_ID, 'u-ethan'],
    slotCounts: { '2026-03-20-12': 3 },
    confirmedUserIds: ['u-daisy', CURRENT_USER_ID, 'u-ethan'],
    declinedUserIds: [],
    venueType: 'Restaurant',
    dateRange: { start: '2026-03-20', end: '2026-03-21' },
    isPublic: false,
    selectedTime: { date: '2026-03-20', startHour: 12 },
    selectedVenue: MOCK_VENUES[3],
  },
  {
    eventId: 'evt-final-05',
    title: 'Shopping @ Vivocity [Finalized ✓]',
    status: 'FINALIZED',
    creatorId: 'u-fiona',
    creatorName: 'Fiona',
    participants: [
      { userId: 'u-fiona', name: 'Fiona' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-alice', name: 'Alice' },
    ],
    availabilitySubmittedBy: ['u-fiona', CURRENT_USER_ID, 'u-alice'],
    slotCounts: { '2026-03-16-13': 3 },
    confirmedUserIds: ['u-fiona', CURRENT_USER_ID, 'u-alice'],
    declinedUserIds: [],
    venueType: 'Mall',
    dateRange: { start: '2026-03-16', end: '2026-03-17' },
    isPublic: false,
    selectedTime: { date: '2026-03-16', startHour: 13 },
    selectedVenue: MOCK_VENUES[5],
  },
  {
    eventId: 'evt-final-06',
    title: 'Group Cycling [Finalized ✓, you creator]',
    status: 'FINALIZED',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-hannah', name: 'Hannah' },
      { userId: 'u-bob', name: 'Bob' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-hannah', 'u-bob'],
    slotCounts: { '2026-03-09-08': 3 },
    confirmedUserIds: [CURRENT_USER_ID, 'u-hannah', 'u-bob'],
    declinedUserIds: [],
    venueType: 'Park',
    dateRange: { start: '2026-03-09', end: '2026-03-10' },
    isPublic: false,
    selectedTime: { date: '2026-03-09', startHour: 8 },
    selectedVenue: MOCK_VENUES[4],
  },
  {
    eventId: 'evt-final-07',
    title: "Library Hackathon [Finalized ✓]",
    status: 'FINALIZED',
    creatorId: 'u-ethan',
    creatorName: 'Ethan',
    participants: [
      { userId: 'u-ethan', name: 'Ethan' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-george', name: 'George' },
    ],
    availabilitySubmittedBy: ['u-ethan', CURRENT_USER_ID, 'u-george'],
    slotCounts: { '2026-03-07-10': 3 },
    confirmedUserIds: ['u-ethan', CURRENT_USER_ID, 'u-george'],
    declinedUserIds: [],
    venueType: 'Library',
    dateRange: { start: '2026-03-07', end: '2026-03-08' },
    isPublic: false,
    selectedTime: { date: '2026-03-07', startHour: 10 },
    selectedVenue: MOCK_VENUES[1],
  },
  {
    eventId: 'evt-final-08',
    title: 'Gym Circuit [Finalized ✓]',
    status: 'FINALIZED',
    creatorId: 'u-george',
    creatorName: 'George',
    participants: [
      { userId: 'u-george', name: 'George' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-charlie', name: 'Charlie' },
    ],
    availabilitySubmittedBy: ['u-george', CURRENT_USER_ID, 'u-charlie'],
    slotCounts: { '2026-03-01-07': 3 },
    confirmedUserIds: ['u-george', CURRENT_USER_ID, 'u-charlie'],
    declinedUserIds: [],
    venueType: 'Sports Hall',
    dateRange: { start: '2026-03-01', end: '2026-03-02' },
    isPublic: false,
    selectedTime: { date: '2026-03-01', startHour: 7 },
    selectedVenue: MOCK_VENUES[0],
  },
  {
    eventId: 'evt-final-09',
    title: 'Farewell Dinner [Finalized ✓, some declined]',
    status: 'FINALIZED',
    creatorId: 'u-alice',
    creatorName: 'Alice',
    participants: [
      { userId: 'u-alice', name: 'Alice' },
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-daisy', name: 'Daisy' },
    ],
    availabilitySubmittedBy: ['u-alice', CURRENT_USER_ID, 'u-daisy', 'u-fiona'],
    slotCounts: { '2026-02-28-19': 4 },
    confirmedUserIds: ['u-alice', CURRENT_USER_ID, 'u-daisy'],
    declinedUserIds: ['u-fiona'],
    venueType: 'Restaurant',
    dateRange: { start: '2026-02-28', end: '2026-02-28' },
    isPublic: false,
    selectedTime: { date: '2026-02-28', startHour: 19 },
    selectedVenue: MOCK_VENUES[3],
  },
  {
    eventId: 'evt-final-10',
    title: 'Café Catchup [Finalized ✓, you creator, 2-pax]',
    status: 'FINALIZED',
    creatorId: CURRENT_USER_ID,
    creatorName: CURRENT_USER_NAME,
    participants: [
      { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
      { userId: 'u-fiona', name: 'Fiona' },
    ],
    availabilitySubmittedBy: [CURRENT_USER_ID, 'u-fiona'],
    slotCounts: { '2026-02-22-11': 2 },
    confirmedUserIds: [CURRENT_USER_ID, 'u-fiona'],
    declinedUserIds: [],
    venueType: 'Cafe',
    dateRange: { start: '2026-02-22', end: '2026-02-23' },
    isPublic: false,
    selectedTime: { date: '2026-02-22', startHour: 11 },
    selectedVenue: MOCK_VENUES[5],
  },

  // ════════════════════════════════════════════════════════════════════════════
  // I. PENDING REJOIN — you left, can rejoin
  //    (appears in EventList "Left — Can Rejoin" section)
  // ════════════════════════════════════════════════════════════════════════════

  {
    eventId: 'evt-rejoin-01',
    title: "Alice's Tennis Match [Left: can rejoin]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-alice',
    creatorName: 'Alice',
    participants: [{ userId: 'u-alice', name: 'Alice' }, { userId: 'u-bob', name: 'Bob' }],
    pendingUserIds: [CURRENT_USER_ID],
    availabilitySubmittedBy: ['u-alice'],
    slotCounts: { '2026-04-15-16': 1 },
    venueType: 'Sports Hall',
    dateRange: { start: '2026-04-15', end: '2026-04-18' },
    isPublic: false,
    description: 'Tennis at Kallang. You left but can still rejoin.',
  },
  {
    eventId: 'evt-rejoin-02',
    title: "Charlie's Café Morning [Left: can rejoin before deadline]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-charlie',
    creatorName: 'Charlie',
    participants: [{ userId: 'u-charlie', name: 'Charlie' }, { userId: 'u-daisy', name: 'Daisy' }],
    pendingUserIds: [CURRENT_USER_ID],
    availabilitySubmittedBy: ['u-charlie'],
    slotCounts: { '2026-04-22-09': 1 },
    venueType: 'Cafe',
    dateRange: { start: '2026-04-22', end: '2026-04-25' },
    isPublic: false,
    description: 'Morning coffee and chat. You opted out but can come back.',
  },
  {
    eventId: 'evt-rejoin-03',
    title: "George's Gym [Left: creator still collecting]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-george',
    creatorName: 'George',
    participants: [{ userId: 'u-george', name: 'George' }, { userId: 'u-ethan', name: 'Ethan' }, { userId: 'u-bob', name: 'Bob' }],
    pendingUserIds: [CURRENT_USER_ID],
    availabilitySubmittedBy: ['u-george', 'u-ethan'],
    slotCounts: { '2026-04-29-07': 2 },
    venueType: 'Sports Hall',
    dateRange: { start: '2026-04-29', end: '2026-05-01' },
    isPublic: false,
    description: 'Gym circuit. Changed your mind? Rejoin!',
  },
  {
    eventId: 'evt-rejoin-04',
    title: "Bob's Park Run [Left: in SCHEDULING, can still rejoin]",
    status: 'SCHEDULING',
    creatorId: 'u-bob',
    creatorName: 'Bob',
    participants: [{ userId: 'u-bob', name: 'Bob' }, { userId: 'u-alice', name: 'Alice' }],
    pendingUserIds: [CURRENT_USER_ID],
    availabilitySubmittedBy: ['u-bob', 'u-alice'],
    slotCounts: { '2026-05-05-07': 2, '2026-05-06-07': 1 },
    venueType: 'Park',
    dateRange: { start: '2026-05-05', end: '2026-05-07' },
    isPublic: false,
    description: 'Event advanced while you were out. Rejoin and join the fun!',
  },
  {
    eventId: 'evt-rejoin-05',
    title: "Daisy's Library Session [Left: long-standing pending]",
    status: 'COLLECTING_AVAILABILITY',
    creatorId: 'u-daisy',
    creatorName: 'Daisy',
    participants: [{ userId: 'u-daisy', name: 'Daisy' }, { userId: 'u-fiona', name: 'Fiona' }, { userId: 'u-hannah', name: 'Hannah' }],
    pendingUserIds: [CURRENT_USER_ID],
    availabilitySubmittedBy: ['u-daisy'],
    slotCounts: { '2026-05-12-14': 1 },
    venueType: 'Library',
    dateRange: { start: '2026-05-12', end: '2026-05-14' },
    isPublic: false,
    description: 'Quiet reading session. You left a while back — rejoin anytime.',
  },
];

// ─── Store Helpers ─────────────────────────────────────────────────────────────

export function readEventStore(): EventDetail[] {
  const raw = localStorage.getItem(EVENT_STORE_KEY);
  if (!raw) return structuredClone(DEFAULT_EVENTS);
  try {
    const parsed = JSON.parse(raw) as EventDetail[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : structuredClone(DEFAULT_EVENTS);
  } catch {
    return structuredClone(DEFAULT_EVENTS);
  }
}

function writeEventStore(events: EventDetail[]): void {
  localStorage.setItem(EVENT_STORE_KEY, JSON.stringify(events));
}

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (current <= endDate && dates.length < 7) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// ─── Shared UI Constants ───────────────────────────────────────────────────────

export const STATUS_LABELS: Record<EventDetail['status'], string> = {
  COLLECTING_AVAILABILITY: 'Collecting',
  SCHEDULING: 'Scheduling',
  AWAITING_CONFIRMATION: 'Awaiting Confirmation',
  FINALIZED: 'Confirmed',
};

export const STATUS_COLORS: Record<EventDetail['status'], string> = {
  COLLECTING_AVAILABILITY: 'bg-amber-100 text-amber-700',
  SCHEDULING: 'bg-blue-100 text-blue-700',
  AWAITING_CONFIRMATION: 'bg-violet-100 text-violet-700',
  FINALIZED: 'bg-green-100 text-green-700',
};

// ─── API Functions ─────────────────────────────────────────────────────────────

/** Events the current user is actively participating in (submitted or confirmed) */
export async function fetchMyEvents(): Promise<EventDetail[]> {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();
      resolve(events.filter(e => {
        const isParticipant = e.participants.some(p => p.userId === CURRENT_USER_ID);
        if (!isParticipant) return false;
        switch (e.status) {
          case 'COLLECTING_AVAILABILITY':
            // Show only if user already submitted (pending invites shown separately)
            return (e.availabilitySubmittedBy ?? []).includes(CURRENT_USER_ID);
          case 'SCHEDULING':
            return true;
          case 'AWAITING_CONFIRMATION':
            // Show only if user confirmed (unconfirmed → shown via notification only)
            return (e.confirmedUserIds ?? []).includes(CURRENT_USER_ID);
          case 'FINALIZED':
            return true;
          default:
            return false;
        }
      }));
    }, 300);
  });
}

/** Events where current user is invited but hasn't submitted availability yet */
export async function fetchPendingInvitations(): Promise<EventDetail[]> {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();
      resolve(events.filter(e =>
        e.status === 'COLLECTING_AVAILABILITY' &&
        e.participants.some(p => p.userId === CURRENT_USER_ID) &&
        !(e.availabilitySubmittedBy ?? []).includes(CURRENT_USER_ID)
      ));
    }, 300);
  });
}

/** Events current user left (private) — can rejoin */
export async function fetchPendingEvents(): Promise<EventDetail[]> {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();
      resolve(events.filter(e =>
        (e.pendingUserIds ?? []).includes(CURRENT_USER_ID) &&
        !e.participants.some(p => p.userId === CURRENT_USER_ID)
      ));
    }, 300);
  });
}

export async function fetchEventById(eventId: string): Promise<EventDetail> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const events = readEventStore();
      const event = events.find(e => e.eventId === eventId);
      if (event) resolve({ ...event });
      else reject(new Error(`Event ${eventId} not found`));
    }, 300);
  });
}

export async function createFullEvent(input: CreateEventInput): Promise<EventDetail> {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();
      const newEvent: EventDetail = {
        eventId: `evt-${Date.now()}`,
        title: input.title,
        status: 'COLLECTING_AVAILABILITY',
        creatorId: CURRENT_USER_ID,
        creatorName: CURRENT_USER_NAME,
        participants: [
          { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME },
          ...input.participantIds.map((id, i) => ({
            userId: id,
            name: input.participantNames[i] ?? id,
          })),
        ],
        availabilitySubmittedBy: [],
        slotCounts: {},
        confirmedUserIds: [],
        declinedUserIds: [],
        venueType: input.venueType,
        dateRange: input.dateRange,
        isPublic: input.isPublic,
        description: input.description,
      };
      writeEventStore([newEvent, ...events]);
      resolve(newEvent);
    }, 400);
  });
}

/**
 * Submit current user's availability slots.
 * Accumulates slot vote counts and tracks who submitted.
 * When all participants have submitted, status advances to SCHEDULING.
 */
export async function submitAvailability(
  eventId: string,
  _userId: string,
  slots: TimeSlot[]
): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();
      const idx = events.findIndex(e => e.eventId === eventId);
      if (idx === -1) { resolve(); return; }
      const ev = events[idx];

      // Accumulate slot counts
      const newCounts = { ...(ev.slotCounts ?? {}) };
      slots.forEach(s => {
        const key = `${s.date}-${s.startHour}`;
        newCounts[key] = (newCounts[key] ?? 0) + 1;
      });

      // Track submitter
      const alreadySubmitted = ev.availabilitySubmittedBy ?? [];
      const newSubmitted = alreadySubmitted.includes(CURRENT_USER_ID)
        ? alreadySubmitted
        : [...alreadySubmitted, CURRENT_USER_ID];

      // Advance status when everyone has submitted
      const allSubmitted = newSubmitted.length >= ev.participants.length;

      const newEvents = [...events];
      newEvents[idx] = {
        ...ev,
        availabilitySubmittedBy: newSubmitted,
        slotCounts: newCounts,
        status: allSubmitted ? 'SCHEDULING' : 'COLLECTING_AVAILABILITY',
      };
      writeEventStore(newEvents);
      resolve();
    }, 600);
  });
}

/**
 * Creator selects a final time slot + venue.
 * Status advances to AWAITING_CONFIRMATION so participants can confirm attendance.
 */
export async function finalizeEvent(
  eventId: string,
  slot: TimeSlot,
  venueId: string
): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();
      const idx = events.findIndex(e => e.eventId === eventId);
      if (idx !== -1) {
        const venue = MOCK_VENUES.find(v => v.venueId === venueId) ?? MOCK_VENUES[0];
        const newEvents = [...events];
        newEvents[idx] = {
          ...events[idx],
          status: 'AWAITING_CONFIRMATION',
          selectedTime: slot,
          selectedVenue: venue,
          confirmedUserIds: [],
          declinedUserIds: [],
        };
        writeEventStore(newEvents);
      }
      resolve();
    }, 500);
  });
}

/** Participant confirms attendance. When everyone responds, event becomes FINALIZED. */
export async function confirmAttendance(eventId: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();
      const idx = events.findIndex(e => e.eventId === eventId);
      if (idx === -1) { resolve(); return; }
      const ev = events[idx];

      const confirmed = [...new Set([...(ev.confirmedUserIds ?? []), CURRENT_USER_ID])];
      const declined = ev.declinedUserIds ?? [];
      const allResponded = confirmed.length + declined.length >= ev.participants.length;

      const newEvents = [...events];
      newEvents[idx] = {
        ...ev,
        confirmedUserIds: confirmed,
        // When all responded: finalize and remove declined users from participants
        ...(allResponded ? {
          status: 'FINALIZED' as const,
          participants: ev.participants.filter(p => confirmed.includes(p.userId)),
        } : {}),
      };
      writeEventStore(newEvents);
      resolve();
    }, 400);
  });
}

/** Participant declines attendance. When everyone responds, event becomes FINALIZED. */
export async function declineAttendance(eventId: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();
      const idx = events.findIndex(e => e.eventId === eventId);
      if (idx === -1) { resolve(); return; }
      const ev = events[idx];

      const confirmed = ev.confirmedUserIds ?? [];
      const declined = [...new Set([...(ev.declinedUserIds ?? []), CURRENT_USER_ID])];
      const allResponded = confirmed.length + declined.length >= ev.participants.length;

      const newEvents = [...events];
      newEvents[idx] = {
        ...ev,
        declinedUserIds: declined,
        ...(allResponded ? {
          status: 'FINALIZED' as const,
          participants: ev.participants.filter(p => confirmed.includes(p.userId)),
        } : {}),
      };
      writeEventStore(newEvents);
      resolve();
    }, 400);
  });
}

/** Rejoin a private event the user previously left */
export async function joinEvent(eventId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const events = readEventStore();
      const idx = events.findIndex(e => e.eventId === eventId);
      if (idx === -1) { reject(new Error('Event not found')); return; }
      const event = events[idx];
      if (event.participants.some(p => p.userId === CURRENT_USER_ID)) {
        resolve(); return;
      }
      const updated: EventDetail = {
        ...event,
        participants: [...event.participants, { userId: CURRENT_USER_ID, name: CURRENT_USER_NAME }],
        pendingUserIds: (event.pendingUserIds ?? []).filter(id => id !== CURRENT_USER_ID),
      };
      const newEvents = [...events];
      newEvents[idx] = updated;
      writeEventStore(newEvents);
      resolve();
    }, 300);
  });
}

/** Leave an event. Creator cannot leave. */
export async function leaveEvent(eventId: string): Promise<void> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  const apiUrl = import.meta.env.VITE_API_URL;
  const res = await fetch(`${apiUrl}/events/${eventId}/leave`, {
    method: 'POST',
    headers: { Authorization: token || '' },
  });
  if (!res.ok) throw new Error(`Failed to leave event: ${res.status}`);
}

/** Revert a FINALIZED event back to SCHEDULING (creator only) */
export async function unfinalizeEvent(eventId: string): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();
      const idx = events.findIndex(e => e.eventId === eventId);
      if (idx !== -1 && events[idx].status === 'FINALIZED') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { selectedTime: _t, selectedVenue: _v, ...rest } = events[idx];
        const newEvents = [...events];
        newEvents[idx] = { ...rest, status: 'SCHEDULING', confirmedUserIds: [], declinedUserIds: [] };
        writeEventStore(newEvents);
      }
      resolve();
    }, 300);
  });
}

/** Fetch recommended venues for an event from the backend (Google Places + OneMap fairness ranking). */
export async function fetchVenues(eventId: string): Promise<Venue[]> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  const apiUrl = import.meta.env.VITE_API_URL;
  const res = await fetch(`${apiUrl}/events/${eventId}/venues`, {
    headers: { Authorization: token || '' },
  });
  if (!res.ok) throw new Error(`Failed to fetch venues: ${res.status}`);
  const { data } = await res.json();
  return data as Venue[];
}

/**
 * Fetch slot voting data (for creator in SCHEDULING state).
 * Returns CommonTime[] with count + participant names for each voted slot.
 */
export async function fetchCommonTimes(eventId: string): Promise<CommonTime[]> {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();
      const event = events.find(e => e.eventId === eventId);
      if (!event || !event.slotCounts) { resolve([]); return; }

      const allNames = event.participants.map(p => p.name);
      const result: CommonTime[] = Object.entries(event.slotCounts)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => {
          const lastDash = key.lastIndexOf('-');
          return {
            date: key.slice(0, lastDash),
            startHour: parseInt(key.slice(lastDash + 1), 10),
            count,
            participantNames: allNames.slice(0, count),
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.startHour - b.startHour);

      resolve(result);
    }, 400);
  });
}

/** Legacy: fetch events as lightweight list */
export async function fetchEvents(): Promise<Event[]> {
  return new Promise(resolve => {
    setTimeout(() => {
      const events = readEventStore();
      resolve(
        events
          .filter(e => e.participants.some(p => p.userId === CURRENT_USER_ID))
          .map(e => ({ eventId: e.eventId, title: e.title }))
      );
    }, 300);
  });
}

// Helper exported for getDatesInRange usage in workspace
export { getDatesInRange };
