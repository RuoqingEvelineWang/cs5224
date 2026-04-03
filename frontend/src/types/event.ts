export type VenueType = 'Cafe' | 'Park' | 'Restaurant' | 'Mall' | 'Library' | 'Sports Hall';

export type EventStatus =
  | 'COLLECTING_AVAILABILITY'
  | 'SELECTING_VENUE'
  | 'AWAITING_CONFIRMATION'
  | 'FINALIZED';

export type EventSummary = {
  eventId: string;
  title: string;
  creatorId: string;
  participantIds: string[];
  participantNames: string[];
  venueType: VenueType;
  selectedTime: string;
  selectedVenue: string;
  status: EventStatus;
};

export type InviteSummary = {
  eventId: string;
  title: string;
  fromUser: string;
  venueType: VenueType;
  dateRange: { start: string; end: string };
};

export type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;  // ISO 8601
  kind:
    | 'FRIEND_REQUEST'
    | 'SUGGESTION'
    | 'EVENT_UPDATE'
    | 'ALL_SUBMITTED'       // creator: all participants submitted slots
    | 'ATTENDANCE_REQUEST'; // participant: confirm/decline attendance
  eventId?: string;         // for navigation / action
};

export type FriendProfile = {
  userId: string;
  name: string;
  interests: string[];
};

export type DashboardData = {
  upcomingEvents: EventSummary[];
  pendingInvites: InviteSummary[];
};

export type CreateEventInput = {
  participantIds: string[];
  venueType: VenueType;
  dateStart: string;
  dateEnd: string;
};
