import type {
  DashboardData,
  EventSummary,
  FriendProfile,
  InviteSummary,
  NotificationItem,
  VenueType,
} from '../types/event';
import {
  readEventStore,
  createFullEvent,
  CURRENT_USER_ID,
} from './Event.tsx';

// ─── Static Data ───────────────────────────────────────────────────────────────

export const FRIENDS: FriendProfile[] = [
  { userId: 'u-alice',   name: 'Alice',   interests: ['Food', 'Cafe', 'Board Games'] },
  { userId: 'u-bob',     name: 'Bob',     interests: ['Hiking', 'Photography', 'Park'] },
  { userId: 'u-charlie', name: 'Charlie', interests: ['Music', 'Brunch', 'Cafe'] },
  { userId: 'u-daisy',   name: 'Daisy',   interests: ['Books', 'Library', 'Tea'] },
  { userId: 'u-ethan',   name: 'Ethan',   interests: ['Movies', 'Mall', 'Restaurant'] },
];

const STATIC_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-static-1',
    title: 'Friend request from Ethan',
    detail: 'Ethan sent you a friend request.',
    createdAt: '2026-03-24T08:00:00Z',
    kind: 'FRIEND_REQUEST',
  },
  {
    id: 'notif-static-2',
    title: 'Suggestion: Park meetup with Bob',
    detail: 'You and Bob share 2 common interests. Consider planning a Park meetup.',
    createdAt: '2026-03-24T14:10:00Z',
    kind: 'SUGGESTION',
  },
];

function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

// ─── API Functions ─────────────────────────────────────────────────────────────

export async function fetchFriends(): Promise<FriendProfile[]> {
  return delay(FRIENDS);
}

/**
 * Dynamically generates notifications from the event store:
 * 1. ALL_SUBMITTED: creator gets notified when all participants submitted
 * 2. ATTENDANCE_REQUEST: participant gets notified to confirm/decline after creator finalizes
 * Also includes static friend/suggestion notifications.
 */
export async function fetchNotifications(): Promise<NotificationItem[]> {
  const events = readEventStore();
  const dynamic: NotificationItem[] = [];

  events.forEach(event => {
    // 1. Notify creator: all participants submitted → can now select slot
    if (
      event.creatorId === CURRENT_USER_ID &&
      event.status === 'SCHEDULING'
    ) {
      dynamic.push({
        id: `notif-all-submitted-${event.eventId}`,
        title: 'All participants submitted availability',
        detail: `Everyone in "${event.title}" has submitted their time slots. You can now select the final time and venue.`,
        createdAt: new Date().toISOString(),
        kind: 'ALL_SUBMITTED',
        eventId: event.eventId,
      });
    }

    // 2. Notify participants: confirm/decline attendance after creator scheduled event
    if (
      event.status === 'AWAITING_CONFIRMATION' &&
      event.participants.some(p => p.userId === CURRENT_USER_ID) &&
      !(event.confirmedUserIds ?? []).includes(CURRENT_USER_ID) &&
      !(event.declinedUserIds ?? []).includes(CURRENT_USER_ID)
    ) {
      const venue = event.selectedVenue?.name ?? 'TBD';
      const time = event.selectedTime
        ? `${event.selectedTime.date} at ${event.selectedTime.startHour}:00`
        : 'TBD';
      dynamic.push({
        id: `notif-attendance-${event.eventId}`,
        title: 'Confirm your attendance',
        detail: `"${event.title}" is scheduled for ${time} at ${venue}. Will you attend?`,
        createdAt: new Date().toISOString(),
        kind: 'ATTENDANCE_REQUEST',
        eventId: event.eventId,
      });
    }
  });

  // Dynamic notifications come first (most actionable)
  return [...dynamic, ...STATIC_NOTIFICATIONS];
}

/** Count actionable (unread) notifications: ALL_SUBMITTED + ATTENDANCE_REQUEST */
export function countActionableNotifications(): number {
  const events = readEventStore();
  let count = 0;

  events.forEach(event => {
    if (event.creatorId === CURRENT_USER_ID && event.status === 'SCHEDULING') {
      count++;
    }
    if (
      event.status === 'AWAITING_CONFIRMATION' &&
      event.participants.some(p => p.userId === CURRENT_USER_ID) &&
      !(event.confirmedUserIds ?? []).includes(CURRENT_USER_ID) &&
      !(event.declinedUserIds ?? []).includes(CURRENT_USER_ID)
    ) {
      count++;
    }
  });

  return count;
}

/** Dashboard reads from the unified event store */
export async function fetchDashboardData(): Promise<DashboardData> {
  const allEvents = readEventStore();

  // Upcoming events = confirmed participation, sorted by date ASC, top 3
  const upcomingEvents: EventSummary[] = allEvents
    .filter(e => {
      const isParticipant = e.participants.some(p => p.userId === CURRENT_USER_ID);
      if (!isParticipant) return false;
      if (e.status === 'COLLECTING_AVAILABILITY')
        return (e.availabilitySubmittedBy ?? []).includes(CURRENT_USER_ID);
      if (e.status === 'AWAITING_CONFIRMATION')
        return (e.confirmedUserIds ?? []).includes(CURRENT_USER_ID);
      return e.status === 'SCHEDULING' || e.status === 'FINALIZED';
    })
    .sort((a, b) => {
      const aDate = a.selectedTime ? a.selectedTime.date : a.dateRange.start;
      const bDate = b.selectedTime ? b.selectedTime.date : b.dateRange.start;
      return aDate.localeCompare(bDate);
    })
    .slice(0, 3)
    .map(e => ({
      eventId: e.eventId,
      title: e.title,
      creatorId: e.creatorId,
      participantIds: e.participants.map(p => p.userId),
      participantNames: e.participants.map(p => p.name),
      venueType: (e.venueType || 'Cafe') as VenueType,
      selectedTime: e.selectedTime
        ? `${e.selectedTime.date}T${String(e.selectedTime.startHour).padStart(2, '0')}:00:00+08:00`
        : `${e.dateRange.start}T09:00:00+08:00`,
      selectedVenue: e.selectedVenue?.name ?? 'Venue TBD',
      status: e.status,
    }));

  // Pending invites = events where user is in participants but hasn't submitted yet
  const pendingInvites: InviteSummary[] = allEvents
    .filter(e =>
      e.status === 'COLLECTING_AVAILABILITY' &&
      e.participants.some(p => p.userId === CURRENT_USER_ID) &&
      !(e.availabilitySubmittedBy ?? []).includes(CURRENT_USER_ID)
    )
    .map(e => ({
      eventId: e.eventId,
      title: e.title,
      fromUser: e.creatorName,
      venueType: (e.venueType || 'Cafe') as VenueType,
      dateRange: e.dateRange,
    }));

  return delay({ upcomingEvents, pendingInvites });
}

/** createBaseEvent delegates to the unified store (kept for backward compat) */
export async function createBaseEvent(
  input: import('../types/event').CreateEventInput & { dateStart: string; dateEnd: string }
): Promise<EventSummary> {
  const participantNames = input.participantIds.map(
    id => FRIENDS.find(f => f.userId === id)?.name ?? id
  );
  const newEvent = await createFullEvent({
    title: `${input.venueType} Meetup`,
    participantIds: input.participantIds,
    participantNames,
    venueType: input.venueType,
    dateRange: { start: input.dateStart.slice(0, 10), end: input.dateEnd.slice(0, 10) },
    isPublic: false,
  });
  return {
    eventId: newEvent.eventId,
    title: newEvent.title,
    creatorId: CURRENT_USER_ID,
    participantIds: newEvent.participants.map(p => p.userId),
    participantNames: newEvent.participants.map(p => p.name),
    venueType: (input.venueType || 'Cafe') as VenueType,
    selectedTime: `${input.dateStart.slice(0, 10)}T09:00:00+08:00`,
    selectedVenue: 'Venue TBD',
    status: 'COLLECTING_AVAILABILITY',
  };
}

// Keep DEFAULT_NOTIFICATIONS export for App.tsx backward compat
export const DEFAULT_NOTIFICATIONS = STATIC_NOTIFICATIONS;
