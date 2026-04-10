import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * POST /events/:eventId/confirm
 *
 * 1. Validates the caller is a member and the event is AWAITING_CONFIRMATION.
 * 2. Sets the caller's EventMember.inviteStatus → ACCEPTED.
 * 3. If every member has now responded (ACCEPTED or DECLINED), advances
 *    EventInfo.status → FINALIZED.
 */
export async function confirmAttendance(userId, eventId, docClient) {
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

  const members = items.filter(i => i.SK.startsWith("USER#"));

  const myMember = members.find(m => m.SK === `USER#${userId}`);
  if (!myMember) throw new HttpError(403, "You are not a member of this event.");

  if (eventMeta.status !== "AWAITING_CONFIRMATION") {
    throw new HttpError(409, `Cannot confirm attendance when event status is "${eventMeta.status}".`);
  }

  const now = new Date().toISOString();

  // Mark caller as ACCEPTED
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `EVENT#${eventId}`, SK: `USER#${userId}` },
    UpdateExpression: "SET inviteStatus = :status, updatedAt = :now",
    ExpressionAttributeValues: { ":status": "ACCEPTED", ":now": now },
  }));

  // Optimistically apply the update to the in-memory snapshot to avoid a second query
  const updatedMembers = members.map(m =>
    m.SK === `USER#${userId}` ? { ...m, inviteStatus: "ACCEPTED" } : m
  );
  const allResponded = updatedMembers.every(
    m => m.inviteStatus === "ACCEPTED" || m.inviteStatus === "DECLINED"
  );

  if (allResponded) {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `EVENT#${eventId}`, SK: "METADATA" },
      UpdateExpression: "SET #s = :status, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":status": "FINALIZED", ":now": now },
    }));
  }

  return {
    eventId,
    userId,
    inviteStatus: "ACCEPTED",
    eventStatus: allResponded ? "FINALIZED" : "AWAITING_CONFIRMATION",
    allResponded,
  };
}
