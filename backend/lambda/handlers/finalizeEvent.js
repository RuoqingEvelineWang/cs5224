import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * POST /events/:eventId/finalize
 *
 * Body: { selectedTime: { date: "YYYY-MM-DD", startHour: number },
 *         selectedVenue: { venueId, name, address, rating, distanceKm, estimatedMinutes } }
 *
 * 1. Validates the caller is the event creator and status is SCHEDULING.
 * 2. Writes selectedTime + selectedVenue to EventInfo and advances status → AWAITING_CONFIRMATION.
 * 3. Resets all non-creator EventMember.inviteStatus → PENDING so each participant can RSVP fresh.
 */
export async function finalizeEvent(userId, eventId, body, docClient) {
  if (!TABLE_NAME) throw new HttpError(500, "MAIN_TABLE environment variable is not configured.");

  const { selectedTime, selectedVenue } = body ?? {};

  if (!selectedTime?.date || selectedTime.startHour == null) {
    throw new HttpError(400, "selectedTime with date and startHour is required.");
  }
  if (!selectedVenue?.name) {
    throw new HttpError(400, "selectedVenue with at least a name is required.");
  }

  // 1. Fetch all items for this event in one query
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": `EVENT#${eventId}` },
  }));

  const items = res.Items || [];
  if (items.length === 0) throw new HttpError(404, "Event not found.");

  const eventMeta = items.find(i => i.SK === "METADATA");
  if (!eventMeta) throw new HttpError(404, "Event metadata not found.");

  // 2. Only the creator may finalize
  if (eventMeta.creatorId !== userId) {
    throw new HttpError(403, "Only the event creator can finalize.");
  }

  // 3. Only allowed from SCHEDULING
  if (eventMeta.status !== "SCHEDULING") {
    throw new HttpError(409, `Cannot finalize when event status is "${eventMeta.status}".`);
  }

  const now = new Date().toISOString();
  const members = items.filter(i => i.SK.startsWith("USER#"));

  // 4. Advance METADATA to AWAITING_CONFIRMATION and persist the chosen time + venue
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `EVENT#${eventId}`, SK: "METADATA" },
    UpdateExpression: "SET #s = :status, selectedTime = :time, selectedVenue = :venue, updatedAt = :now",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: {
      ":status": "AWAITING_CONFIRMATION",
      ":time": selectedTime,
      ":venue": selectedVenue,
      ":now": now,
    },
  }));

  // 5a. Explicitly confirm the creator's attendance — finalizing IS an implicit RSVP yes.
  //     This also fixes re-finalize after unfinalize: unfinalizeEvent resets ALL members
  //     (including the creator) to PENDING, so we must write ACCEPTED back here.
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `EVENT#${eventId}`, SK: `USER#${userId}` },
    UpdateExpression: "SET inviteStatus = :accepted, updatedAt = :now",
    ExpressionAttributeValues: { ":accepted": "ACCEPTED", ":now": now },
  }));

  // 5b. Reset every OTHER member's inviteStatus → PENDING so they can RSVP fresh
  const nonCreatorMembers = members.filter(m => m.SK !== `USER#${userId}`);
  await Promise.all(nonCreatorMembers.map(m =>
    docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `EVENT#${eventId}`, SK: m.SK },
      UpdateExpression: "SET inviteStatus = :pending, updatedAt = :now",
      ExpressionAttributeValues: { ":pending": "PENDING", ":now": now },
    }))
  ));

  return {
    eventId,
    status: "AWAITING_CONFIRMATION",
    selectedTime,
    selectedVenue,
  };
}
