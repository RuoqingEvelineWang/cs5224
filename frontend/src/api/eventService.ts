import type {
  CreateEventInput,
  DashboardData,
  EventSummary,
  FriendProfile,
  InviteSummary,
  NotificationItem,
} from '../types/event';

const STORAGE_KEY = 'teamup-dashboard-events';

const CURRENT_USER_ID = 'u-current';

const FRIENDS: FriendProfile[] = [
  { userId: 'u-alice', name: 'Alice', interests: ['Food', 'Cafe', 'Board Games'] },
  { userId: 'u-bob', name: 'Bob', interests: ['Hiking', 'Photography', 'Park'] },
  { userId: 'u-charlie', name: 'Charlie', interests: ['Music', 'Brunch', 'Cafe'] },
  { userId: 'u-daisy', name: 'Daisy', interests: ['Books', 'Library', 'Tea'] },
  { userId: 'u-ethan', name: 'Ethan', interests: ['Movies', 'Mall', 'Restaurant'] },
];

const DEFAULT_EVENTS: EventSummary[] = [
  {
    eventId: 'evt-1001',
    creatorId: 'u-alice',
    participantIds: [CURRENT_USER_ID, 'u-alice', 'u-bob'],
    participantNames: ['You', 'Alice', 'Bob'],
    venueType: 'Cafe',
    selectedTime: '2026-03-28T10:30:00Z',
    selectedVenue: 'Morning Bean @ Bugis',
    status: 'CONFIRMED',
  },
  {
    eventId: 'evt-1002',
    creatorId: CURRENT_USER_ID,
    participantIds: [CURRENT_USER_ID, 'u-charlie'],
    participantNames: ['You', 'Charlie'],
    venueType: 'Park',
    selectedTime: '2026-03-30T01:00:00Z',
    selectedVenue: 'East Coast Park',
    status: 'PLANNING',
  },
];

const DEFAULT_INVITES: InviteSummary[] = [
  {
    eventId: 'evt-2001',
    fromUser: 'Daisy',
    venueType: 'Restaurant',
    suggestedTime: '2026-03-29T11:30:00Z',
    status: 'PENDING',
  },
];

const DEFAULT_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n-1',
    title: 'New friend request',
    detail: 'Ethan sent you a friend request.',
    createdAt: '2026-03-24T08:00:00Z',
    kind: 'FRIEND_REQUEST',
  },
  {
    id: 'n-2',
    title: 'Suggestion available',
    detail: 'You and Bob share 2 common interests. Consider planning a Park meetup.',
    createdAt: '2026-03-24T14:10:00Z',
    kind: 'SUGGESTION',
  },
];

function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function readEvents(): EventSummary[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_EVENTS;

  try {
    const parsed = JSON.parse(raw) as EventSummary[];
    return Array.isArray(parsed) ? parsed : DEFAULT_EVENTS;
  } catch {
    return DEFAULT_EVENTS;
  }
}

function saveEvents(events: EventSummary[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function formatDateFromRange(dateStart: string, dateEnd: string): string {
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  const midpoint = new Date((start.getTime() + end.getTime()) / 2);
  return midpoint.toISOString();
}

function participantNamesFromIds(ids: string[]): string[] {
  const names = ids.map((id) => FRIENDS.find((friend) => friend.userId === id)?.name ?? id);
  return ['You', ...names];
}

export async function fetchFriends(): Promise<FriendProfile[]> {
  return delay(FRIENDS);
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const events = readEvents();
  const upcomingEvents = [...events].sort((a, b) => a.selectedTime.localeCompare(b.selectedTime));

  return delay({
    upcomingEvents,
    pendingInvites: DEFAULT_INVITES,
    notifications: DEFAULT_NOTIFICATIONS,
  });
}

export async function createBaseEvent(input: CreateEventInput): Promise<EventSummary> {
  const event: EventSummary = {
    eventId: `evt-${Date.now()}`,
    creatorId: CURRENT_USER_ID,
    participantIds: [CURRENT_USER_ID, ...input.participantIds],
    participantNames: participantNamesFromIds(input.participantIds),
    venueType: input.venueType,
    selectedTime: formatDateFromRange(input.dateStart, input.dateEnd),
    selectedVenue: 'TBD (venue voting in workspace)',
    status: 'PLANNING',
  };

  const allEvents = readEvents();
  saveEvents([event, ...allEvents]);
  return delay(event);
}
