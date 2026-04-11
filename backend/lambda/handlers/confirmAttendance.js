import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createNotification } from "./getNotifications.js";

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
 * 1. Validates the caller is an active member and the event is AWAITING_CONFIRMATION.
 * 2. Sets the caller's EventMember.inviteStatus → ACCEPTED.
 * 3. Does a fresh consistent re-read of all members to avoid race conditions.
 * 4. If every active (non-LEFT) member has now responded (ACCEPTED or DECLINED),
 *    advances EventInfo.status → FINALIZED using a conditional write so only one
 *    concurrent responder wins.
 * 5. Notifies the creator when the event is finalized.
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

  if (myMember.memberStatus === "LEFT") {
    throw new HttpError(403, "You have already left this event.");
  }

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

  // Fresh consistent re-read to avoid race conditions between concurrent responders
  const freshRes = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    ConsistentRead: true,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": `EVENT#${eventId}`,
      ":skPrefix": "USER#",
    },
  }));

  // Only active (non-LEFT) members need to respond
  const activeMembers = (freshRes.Items || []).filter(m => m.memberStatus !== "LEFT");
  const allResponded = activeMembers.length > 0
    && activeMembers.every(m => m.inviteStatus === "ACCEPTED" || m.inviteStatus === "DECLINED");

  let eventFinalized = false;
  if (allResponded) {
    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `EVENT#${eventId}`, SK: "METADATA" },
        UpdateExpression: "SET #s = :finalized, updatedAt = :now",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":finalized": "FINALIZED",
          ":awaiting": "AWAITING_CONFIRMATION",
          ":now": now,
        },
        // Conditional write: only one concurrent responder wins
        ConditionExpression: "#s = :awaiting",
      }));
      eventFinalized = true;

      // Notify the creator that the event is now finalized
      await createNotification(docClient, {
        recipientUserId: eventMeta.creatorId,
        notifType: "EVENT_FINALIZED",
        notificationId: `EVENT_FINALIZED#${eventId}`,
        message: `All participants have responded for "${eventMeta.title}". The event is now finalized.`,
        payload: { eventId, eventTitle: eventMeta.title },
      });
    } catch (err) {
      // Another concurrent responder already finalized — that's fine
      if (err?.name !== "ConditionalCheckFailedException") throw err;
    }
  }

  return {
    eventId,
    userId,
    inviteStatus: "ACCEPTED",
    eventStatus: eventFinalized ? "FINALIZED" : "AWAITING_CONFIRMATION",
    allResponded,
  };
}
