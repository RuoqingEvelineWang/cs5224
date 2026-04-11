import { QueryCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const TABLE = () => process.env.MAIN_TABLE;

// ---------------------------------------------------------------------------
// Internal helpers (also exported for use in other handlers)
// ---------------------------------------------------------------------------

/**
 * Writes a Notification item to DynamoDB when a notifiable event occurs.
 *
 * notificationId is deterministic so re-triggering the same event (e.g. a
 * re-sent friend request) overwrites the previous notification, resetting
 * isRead to false. Callers are responsible for ensuring single delivery
 * when duplicates are undesirable (e.g. submitAvailability uses a
 * ConditionExpression on event status).
 *
 * Notification types:
 *   FRIEND_REQUEST      – notificationId: "FRIEND_REQUEST#<senderId>"
 *   ALL_SUBMITTED       – notificationId: "ALL_SUBMITTED#<eventId>"
 *   ATTENDANCE_REQUEST  – notificationId: "ATTENDANCE_REQUEST#<eventId>"
 *
 * @param {import("@aws-sdk/lib-dynamodb").DynamoDBDocumentClient} docClient
 * @param {{
 *   recipientUserId: string,
 *   notifType: "FRIEND_REQUEST" | "ALL_SUBMITTED" | "ATTENDANCE_REQUEST",
 *   notificationId: string,
 *   message: string,
 *   payload: Record<string, unknown>,
 * }} opts
 */
export async function createNotification(docClient, { recipientUserId, notifType, notificationId, message, payload }) {
  const now = new Date().toISOString();
  await docClient.send(new PutCommand({
    TableName: TABLE(),
    Item: {
      PK: `USER#${recipientUserId}`,
      SK: `NOTIF#${notificationId}`,
      Type: "Notification",
      userId: recipientUserId,
      notificationId,
      notifType,
      message,
      isRead: false,
      isDeleted: false,
      payload,
      createdAt: now,
      updatedAt: now,
    },
  }));
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

/**
 * GET /notifications
 * Returns all stored Notification items for the authenticated user, newest first.
 */
export async function getNotifications(userId, docClient) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE(),
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":skPrefix": "NOTIF#",
    },
  }));

  const notifications = (result.Items || [])
    .filter((item) => !item.isDeleted)
    .map((item) => ({
      notificationId: item.notificationId,
      type: item.notifType,
      message: item.message,
      isRead: item.isRead ?? false,
      payload: item.payload ?? {},
      createdAt: item.createdAt,
      readAt: item.readAt ?? null,
    }));

  notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return notifications;
}

/**
 * PUT /notifications/read
 * Body: { notificationIds: string[] }
 * Marks the given notifications as read (isRead = true, readAt = now).
 */
export async function markNotificationsRead(userId, notificationIds, docClient) {
  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    throw Object.assign(new Error("notificationIds must be a non-empty array."), { statusCode: 400 });
  }

  const now = new Date().toISOString();

  let markedCount = 0;
  await Promise.all(
    notificationIds.map((notificationId) =>
      docClient.send(new UpdateCommand({
        TableName: TABLE(),
        Key: {
          PK: `USER#${userId}`,
          SK: `NOTIF#${notificationId}`,
        },
        UpdateExpression: "SET isRead = :true, readAt = :now, updatedAt = :now",
        ExpressionAttributeValues: { ":true": true, ":now": now },
        ConditionExpression: "attribute_exists(PK)",
      })).then(() => { markedCount++; }).catch((err) => {
        // Notification not found — skip rather than fail the whole batch
        if (err?.name !== "ConditionalCheckFailedException") throw err;
      })
    )
  );

  return { success: true, markedCount };
}

/**
 * PUT /notifications/{notificationId}
 * Soft-deletes a notification by setting isDeleted = true.
 * The item is retained in DynamoDB; GET /notifications filters it out.
 */
export async function deleteNotification(userId, notificationId, docClient) {
  if (!notificationId) {
    throw Object.assign(new Error("notificationId is required."), { statusCode: 400 });
  }

  const now = new Date().toISOString();
  try {
    await docClient.send(new UpdateCommand({
      TableName: TABLE(),
      Key: {
        PK: `USER#${userId}`,
        SK: `NOTIF#${notificationId}`,
      },
      UpdateExpression: "SET isDeleted = :true, deletedAt = :now, updatedAt = :now",
      ExpressionAttributeValues: { ":true": true, ":now": now },
      ConditionExpression: "attribute_exists(PK)",
    }));
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      throw Object.assign(new Error("Notification not found."), { statusCode: 404 });
    }
    throw error;
  }

  return { success: true };
}
