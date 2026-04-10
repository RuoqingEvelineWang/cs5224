import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * POST /events/:eventId/unfinalize
 *
 * Allows the creator to revert a finalized or awaiting-confirmation event
 * back to SCHEDULING so a different time/venue can be chosen.
 *
 * 1. Validates the caller is the creator.
 * 2. Validates status is AWAITING_CONFIRMATION or FINALIZED.
 * 3. Removes selectedTime + selectedVenue from EventInfo and reverts status → SCHEDULING.
 * 4. Resets all EventMember.inviteStatus → PENDING.
 */
export async function unfinalizeEvent(userId, eventId, docClient) {
  if (!TABLE_NAME) throw new HttpError(500, "MAIN_TABLE environment variable is not configured.");

  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": `EVENT#${eventId}` },
  }));

  const items = res.Items || [];
  if (items.length === 0) throw new HttpError(404, "Event not found.");

  const eventMeta = items.find(i => i.SK === "METADATA");
  if (!eventMeta) throw new HttpError(404, "Event metadata not found.");

  // Only the creator may revert
  if (eventMeta.creatorId !== userId) {
    throw new HttpError(403, "Only the event creator can unfinalize.");
  }

  // Only valid from AWAITING_CONFIRMATION or FINALIZED
  if (!["AWAITING_CONFIRMATION", "FINALIZED"].includes(eventMeta.status)) {
    throw new HttpError(409, `Cannot unfinalize when event status is "${eventMeta.status}".`);
  }

  const now = new Date().toISOString();
  const members = items.filter(i => i.SK.startsWith("USER#"));

  // Revert status and remove the chosen time + venue from METADATA
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `EVENT#${eventId}`, SK: "METADATA" },
    // REMOVE clears the attributes entirely; SET updates status and timestamp
    UpdateExpression: "SET #s = :status, updatedAt = :now REMOVE selectedTime, selectedVenue",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":status": "SCHEDULING", ":now": now },
  }));

  // Reset every member's inviteStatus so RSVPs are cleared
  await Promise.all(members.map(m =>
    docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `EVENT#${eventId}`, SK: m.SK },
      UpdateExpression: "SET inviteStatus = :pending, updatedAt = :now",
      ExpressionAttributeValues: { ":pending": "PENDING", ":now": now },
    }))
  ));

  return { eventId, status: "SCHEDULING" };
}
