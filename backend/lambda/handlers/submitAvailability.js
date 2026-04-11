import { UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { createNotification } from "./getNotifications.js";

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

  const members = items.filter(i => i.SK.startsWith("USER#") && i.memberStatus !== "LEFT");

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

  // 5. Re-query all members to get the latest hasSubmittedAvailability state,
  //    avoiding the race condition where two concurrent submissions both see
  //    the other as not-yet-submitted and neither advances the event status.
  const freshRes = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    ConsistentRead: true,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": `EVENT#${eventId}`,
      ":skPrefix": "USER#",
    },
  }));
  const freshMembers = (freshRes.Items || []).filter(m => m.memberStatus !== "LEFT");
  const allSubmitted = freshMembers.length > 0
    && freshMembers.every(m => m.hasSubmittedAvailability === true);

  if (allSubmitted) {
    // ConditionExpression ensures only one concurrent winner advances the status.
    // The notification is sent only by the winner, preventing duplicate delivery
    // and avoiding a second write that would reset isRead=false on the creator's notification.
    let advancedStatus = false;
    try {
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
          ":collecting": "COLLECTING_AVAILABILITY",
          ":now": now,
        },
        ConditionExpression: "#s = :collecting",
      }));
      advancedStatus = true;
    } catch (err) {
      if (err?.name !== "ConditionalCheckFailedException") throw err;
      // Another concurrent submission already advanced the status — that's fine.
    }

    // Only the request that won the status transition sends the notification,
    // ensuring exactly-once delivery.
    if (advancedStatus) {
      await createNotification(docClient, {
        recipientUserId: eventMeta.creatorId,
        notifType: "ALL_SUBMITTED",
        notificationId: `ALL_SUBMITTED#${eventId}`,
        message: `All participants have submitted their availability for "${eventMeta.title}". Time to pick a time and venue!`,
        payload: { eventId, eventTitle: eventMeta.title },
      });
    }
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
