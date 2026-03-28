export type VenueType = 'Cafe' | 'Park' | 'Restaurant' | 'Mall' | 'Library';

export type EventStatus = 'PLANNING' | 'CONFIRMED';

export type EventSummary = {
  eventId: string;
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
  fromUser: string;
  venueType: VenueType;
  suggestedTime: string;
  status: 'PENDING';
};

export type NotificationItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  kind: 'FRIEND_REQUEST' | 'SUGGESTION' | 'EVENT_UPDATE';
};

export type FriendProfile = {
  userId: string;
  name: string;
  interests: string[];
};

export type DashboardData = {
  upcomingEvents: EventSummary[];
  pendingInvites: InviteSummary[];
  notifications: NotificationItem[];
};

export type CreateEventInput = {
  participantIds: string[];
  venueType: VenueType;
  dateStart: string;
  dateEnd: string;
};
