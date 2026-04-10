import { UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * POST /events/:eventId/availability
 *
 * Body: { availableTimeSlots: string[] }
 * Each slot: "YYYY-MM-DD-HH" (e.g. "2026-04-15-14")
 *
 * 1. Validates the user is a member of the event and the event is in COLLECTING_AVAILABILITY status.
 * 2. Writes availableTimeSlots + hasSubmittedAvailability=true to the EventMember record.
 * 3. Checks if ALL members have now submitted; if so, advances EventInfo.status → SCHEDULING.
 */
export async function submitAvailability(userId, eventId, body, docClient) {
  if (!TABLE_NAME) {
    throw new HttpError(500, "MAIN_TABLE environment variable is not configured.");
  }

  const availableTimeSlots = body?.availableTimeSlots;
  if (!Array.isArray(availableTimeSlots) || availableTimeSlots.length === 0) {
    throw new HttpError(400, "availableTimeSlots must be a non-empty array.");
  }

  // Validate slot format: "YYYY-MM-DD-HH"
  const slotPattern = /^\d{4}-\d{2}-\d{2}-\d{2}$/;
  for (const slot of availableTimeSlots) {
    if (!slotPattern.test(slot)) {
      throw new HttpError(400, `Invalid slot format: "${slot}". Expected "YYYY-MM-DD-HH".`);
    }
  }

  // 1. Query all items for this event (EventInfo + all EventMembers)
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": `EVENT#${eventId}` },
  }));

  const items = res.Items || [];
  if (items.length === 0) {
    throw new HttpError(404, "Event not found.");
  }

  const eventMeta = items.find(i => i.SK === "METADATA");
  if (!eventMeta) {
    throw new HttpError(404, "Event metadata not found.");
  }

  const members = items.filter(i => i.SK.startsWith("USER#"));

  // 2. Check the requesting user is a member
  const myMember = members.find(m => m.SK === `USER#${userId}`);
  if (!myMember) {
    throw new HttpError(403, "You are not a member of this event.");
  }

  // 3. Only allow submission during COLLECTING_AVAILABILITY
  if (eventMeta.status !== "COLLECTING_AVAILABILITY") {
    throw new HttpError(409, `Cannot submit availability when event status is "${eventMeta.status}".`);
  }

  const now = new Date().toISOString();

  // 4. Update the EventMember record
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `EVENT#${eventId}`,
      SK: `USER#${userId}`,
    },
    UpdateExpression:
      "SET availableTimeSlots = :slots, hasSubmittedAvailability = :submitted, updatedAt = :now",
    ExpressionAttributeValues: {
      ":slots": availableTimeSlots,
      ":submitted": true,
      ":now": now,
    },
  }));

  // 5. Check if all members have now submitted
  const updatedMembers = members.map(m =>
    m.SK === `USER#${userId}` ? { ...m, hasSubmittedAvailability: true } : m
  );
  const allSubmitted = updatedMembers.every(m => m.hasSubmittedAvailability === true);

  if (allSubmitted) {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `EVENT#${eventId}`,
        SK: "METADATA",
      },
      UpdateExpression: "SET #s = :status, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": "SCHEDULING",
        ":now": now,
      },
    }));
  }

  return {
    eventId,
    userId,
    role: myMember.role,
    hasSubmittedAvailability: true,
    availableTimeSlots,
    eventStatus: allSubmitted ? "SCHEDULING" : "COLLECTING_AVAILABILITY",
    allSubmitted,
  };
}
