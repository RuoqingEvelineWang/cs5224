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
 * POST /events/:eventId/leave
 *
 * Allows a PARTICIPANT (not the creator) to leave an event.
 *
 * Behaviour depends on the current event status:
 *   COLLECTING_AVAILABILITY / SCHEDULING
 *     → soft-removes the member (memberStatus = "LEFT").
 *     → for COLLECTING_AVAILABILITY, if all remaining active members have
 *       submitted, advances the event to SCHEDULING and notifies the creator.
 *   AWAITING_CONFIRMATION / FINALIZED
 *     → sets inviteStatus = DECLINED on the EventMember record.
 *     → for AWAITING_CONFIRMATION, if all participants have now responded,
 *       advances the event to FINALIZED.
 */
export async function leaveEvent(userId, eventId, docClient) {
  if (!TABLE_NAME) {
    throw new HttpError(500, "MAIN_TABLE environment variable is not configured.");
  }

  // 1. Query all items for this event (METADATA + all EventMembers)
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
  const myMember = members.find(m => m.SK === `USER#${userId}`);
  if (!myMember) {
    throw new HttpError(403, "You are not a member of this event.");
  }

  if (myMember.role === "CREATOR") {
    throw new HttpError(403, "The event creator cannot leave the event.");
  }

  const status = eventMeta.status;
  const now = new Date().toISOString();

  // ── COLLECTING_AVAILABILITY / SCHEDULING: soft-remove the member ──
  if (status === "COLLECTING_AVAILABILITY" || status === "SCHEDULING") {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `EVENT#${eventId}`,
        SK: `USER#${userId}`,
      },
      UpdateExpression: "SET memberStatus = :left, updatedAt = :now",
      ExpressionAttributeValues: {
        ":left": "LEFT",
        ":now": now,
      },
    }));

    // If the event was still collecting, a participant leaving may cause
    // all remaining active members to have submitted.
    if (status === "COLLECTING_AVAILABILITY") {
      const freshRes = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        ConsistentRead: true,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `EVENT#${eventId}`,
          ":skPrefix": "USER#",
        },
      }));
      const activeMembers = (freshRes.Items || []).filter(m => m.memberStatus !== "LEFT");
      const allSubmitted = activeMembers.length > 0
        && activeMembers.every(m => m.hasSubmittedAvailability === true);

      if (allSubmitted) {
        try {
          await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `EVENT#${eventId}`, SK: "METADATA" },
            UpdateExpression: "SET #s = :scheduling, updatedAt = :now",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":scheduling": "SCHEDULING",
              ":collecting": "COLLECTING_AVAILABILITY",
              ":now": now,
            },
            ConditionExpression: "#s = :collecting",
          }));

          await createNotification(docClient, {
            recipientUserId: eventMeta.creatorId,
            notifType: "ALL_SUBMITTED",
            notificationId: `ALL_SUBMITTED#${eventId}`,
            message: `All participants have submitted their availability for "${eventMeta.title}". Time to pick a time and venue!`,
            payload: { eventId, eventTitle: eventMeta.title },
          });
        } catch (err) {
          if (err?.name !== "ConditionalCheckFailedException") throw err;
        }
      }
    }

    return { eventId, userId, action: "left" };
  }

  // ── AWAITING_CONFIRMATION / FINALIZED: mark as DECLINED ──
  if (status === "AWAITING_CONFIRMATION" || status === "FINALIZED") {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `EVENT#${eventId}`,
        SK: `USER#${userId}`,
      },
      UpdateExpression: "SET inviteStatus = :declined, updatedAt = :now",
      ExpressionAttributeValues: {
        ":declined": "DECLINED",
        ":now": now,
      },
    }));

    // For AWAITING_CONFIRMATION, check if all participants have now responded
    // (ACCEPTED or DECLINED) and advance to FINALIZED if so.
    if (status === "AWAITING_CONFIRMATION") {
      const freshRes = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        ConsistentRead: true,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `EVENT#${eventId}`,
          ":skPrefix": "USER#",
        },
      }));
      const freshMembers = freshRes.Items || [];
      const allResponded = freshMembers
        .filter(m => m.role !== "CREATOR")
        .every(m => m.inviteStatus === "ACCEPTED" || m.inviteStatus === "DECLINED");

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
            ConditionExpression: "#s = :awaiting",
          }));
        } catch (err) {
          if (err?.name !== "ConditionalCheckFailedException") throw err;
        }
      }
    }

    return { eventId, userId, action: "declined" };
  }

  throw new HttpError(409, `Cannot leave event in "${status}" status.`);
}
