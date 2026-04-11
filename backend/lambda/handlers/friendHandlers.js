import {
  QueryCommand,
  GetCommand,
  BatchGetCommand,
  ScanCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { createNotification } from "./getNotifications.js";

const TABLE_NAME = process.env.MAIN_TABLE;
const PROFILE_SK = "PROFILE";

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function sendFriendRequest(userId, body, docClient) {
  ensureTableName();

  const targetUserId = String(body?.targetUserId || "").trim();
  if (!targetUserId) {
    throw new HttpError(400, "targetUserId is required.");
  }

  if (targetUserId === userId) {
    throw new HttpError(400, "You cannot send a friend request to yourself.");
  }

  const existingRelationship = await getRelationship(userId, targetUserId, docClient);
  if (existingRelationship) {
    const status = normalizeStatus(existingRelationship.status);
    if (status === "ACCEPTED") {
      throw new HttpError(409, "You are already friends with this user.");
    }

    if (status === "PENDING") {
      if (existingRelationship.requestedBy === userId) {
        throw new HttpError(409, "Friend request already sent.");
      }
      throw new HttpError(409, "Incoming request exists. Please accept it instead.");
    }
  }

  const requesterNameFromBody = normalizeOptionalName(body?.requesterName);
  const targetNameFromBody = normalizeOptionalName(body?.targetName);
  const [requesterProfile, targetProfile] = await Promise.all([
    getUserProfile(userId, docClient),
    getUserProfile(targetUserId, docClient),
  ]);
  const requesterSnapshotName =
    normalizeOptionalName(requesterProfile?.name) || requesterNameFromBody;
  const targetSnapshotName =
    normalizeOptionalName(targetProfile?.name) || targetNameFromBody;

  const now = new Date().toISOString();
  const requesterRecord = {
    PK: userPk(userId),
    SK: friendSk(targetUserId),
    Type: "Friendship",
    userId,
    friendId: targetUserId,
    status: "PENDING",
    requestedBy: userId,
    createdAt: now,
    updatedAt: now,
    ...(targetSnapshotName ? { name: targetSnapshotName } : {}),
  };

  const recipientRecord = {
    PK: userPk(targetUserId),
    SK: friendSk(userId),
    Type: "Friendship",
    userId: targetUserId,
    friendId: userId,
    status: "PENDING",
    requestedBy: userId,
    createdAt: now,
    updatedAt: now,
    ...(requesterSnapshotName ? { name: requesterSnapshotName } : {}),
  };

  try {
    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: requesterRecord,
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: recipientRecord,
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          },
        },
      ],
    }));
  } catch (error) {
    if (error?.name === "TransactionCanceledException") {
      throw new HttpError(409, "Friend request already exists.");
    }
    throw error;
  }

  // Strongly consistent: notification is part of the friend request flow.
  await createNotification(docClient, {
    recipientUserId: targetUserId,
    notifType: "FRIEND_REQUEST",
    notificationId: `FRIEND_REQUEST#${userId}`,
    message: `${requesterSnapshotName || userId} sent you a friend request.`,
    payload: { fromUserId: userId, fromUserName: requesterSnapshotName || userId },
  });

  return { message: "Friend request sent." };
}

export async function acceptFriendRequest(userId, body, docClient) {
  ensureTableName();

  const requesterUserId = String(body?.requesterUserId || "").trim();
  if (!requesterUserId) {
    throw new HttpError(400, "requesterUserId is required.");
  }

  if (requesterUserId === userId) {
    throw new HttpError(400, "Invalid requesterUserId.");
  }

  const incomingRelationship = await getRelationship(userId, requesterUserId, docClient);
  if (!incomingRelationship) {
    throw new HttpError(404, "Friend request not found.");
  }

  const status = normalizeStatus(incomingRelationship.status);
  if (status === "ACCEPTED") {
    throw new HttpError(409, "You are already friends with this user.");
  }
  /* istanbul ignore next */
  if (status !== "PENDING") {
    throw new HttpError(409, "Friend relationship is not in a pending state.");
  }

  if (incomingRelationship.requestedBy !== requesterUserId) {
    throw new HttpError(400, "Only incoming friend requests can be accepted.");
  }

  const now = new Date().toISOString();

  try {
    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: userPk(userId), SK: friendSk(requesterUserId) },
            UpdateExpression: "SET #status = :accepted, #updatedAt = :updatedAt",
            ExpressionAttributeNames: {
              "#status": "status",
              "#updatedAt": "updatedAt",
            },
            ExpressionAttributeValues: {
              ":accepted": "ACCEPTED",
              ":updatedAt": now,
            },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: userPk(requesterUserId), SK: friendSk(userId) },
            UpdateExpression: "SET #status = :accepted, #updatedAt = :updatedAt",
            ExpressionAttributeNames: {
              "#status": "status",
              "#updatedAt": "updatedAt",
            },
            ExpressionAttributeValues: {
              ":accepted": "ACCEPTED",
              ":updatedAt": now,
            },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
          },
        },
      ],
    }));
  } catch (error) {
    if (error?.name === "TransactionCanceledException") {
      throw new HttpError(404, "Friend request not found.");
    }
    throw error;
  }

  return { message: "Friend request accepted." };
}

export async function declineFriendRequest(userId, body, docClient) {
  ensureTableName();

  const requesterUserId = String(body?.requesterUserId || "").trim();
  if (!requesterUserId) {
    throw new HttpError(400, "requesterUserId is required.");
  }

  if (requesterUserId === userId) {
    throw new HttpError(400, "Invalid requesterUserId.");
  }

  const incomingRelationship = await getRelationship(userId, requesterUserId, docClient);
  if (!incomingRelationship) {
    throw new HttpError(404, "Friend request not found.");
  }

  const status = normalizeStatus(incomingRelationship.status);
  if (status !== "PENDING") {
    throw new HttpError(409, "Friend relationship is not in a pending state.");
  }

  if (incomingRelationship.requestedBy !== requesterUserId) {
    throw new HttpError(400, "Only incoming friend requests can be declined.");
  }

  try {
    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: TABLE_NAME,
            Key: { PK: userPk(userId), SK: friendSk(requesterUserId) },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
          },
        },
        {
          Delete: {
            TableName: TABLE_NAME,
            Key: { PK: userPk(requesterUserId), SK: friendSk(userId) },
            ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
          },
        },
      ],
    }));
  } catch (error) {
    if (error?.name === "TransactionCanceledException") {
      throw new HttpError(404, "Friend request not found.");
    }
    throw error;
  }

  return { message: "Friend request declined." };
}

export async function listFriendsByUserId(userId, docClient) {
  ensureTableName();

  const relationshipItems = await queryRelationships(userId, docClient);
  const friendIds = Array.from(
    new Set(
      relationshipItems
        .map(getFriendId)
        .filter((friendId) => typeof friendId === "string" && friendId.length > 0)
    )
  );
  const profileMap = await batchGetProfiles(friendIds, docClient);

  const friends = [];
  const incomingRequests = [];
  const outgoingRequests = [];

  for (const item of relationshipItems) {
    const friendId = getFriendId(item);
    if (!friendId) continue;

    const profile = profileMap[friendId] || null;
    const status = normalizeStatus(item.status);
    const row = {
      userId: friendId,
      name: profile?.name || item.name || friendId,
      interests: toStringArray(profile?.interests ?? item.interests ?? item.hobbies),
      status,
      requestedBy: typeof item.requestedBy === "string" ? item.requestedBy : null,
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
    };

    if (status === "ACCEPTED") {
      friends.push(row);
      continue;
    }

    if (row.requestedBy === userId) {
      outgoingRequests.push(row);
    } else {
      incomingRequests.push(row);
    }
  }

  const byName = (a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId);
  friends.sort(byName);
  incomingRequests.sort(byName);
  outgoingRequests.sort(byName);

  return {
    userId,
    friends,
    incomingRequests,
    outgoingRequests,
  };
}

export async function listFriendSuggestions(userId, docClient) {
  ensureTableName();

  const currentProfile = await getUserProfile(userId, docClient);
  if (!currentProfile) {
    return {
      userId,
      suggestions: [],
    };
  }

  const currentInterests = toStringArray(currentProfile.interests);
  const relationshipItems = await queryRelationships(userId, docClient);
  const excludedIds = new Set([userId]);
  for (const item of relationshipItems) {
    const friendId = getFriendId(item);
    if (friendId) excludedIds.add(friendId);
  }

  const suggestions = [];
  let lastEvaluatedKey;

  do {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      ProjectionExpression: "PK, #sk, userId, #name, interests",
      ExpressionAttributeNames: {
        "#sk": "SK",
        "#name": "name",
      },
      FilterExpression: "#sk = :profile",
      ExpressionAttributeValues: {
        ":profile": PROFILE_SK,
      },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    for (const candidate of scanResult.Items || []) {
      const candidateUserId = getUserIdFromProfileItem(candidate);
      if (!candidateUserId || excludedIds.has(candidateUserId)) {
        continue;
      }

      const candidateInterests = toStringArray(candidate.interests);
      const { score, commonInterests } = computeJaccard(currentInterests, candidateInterests);
      if (score <= 0) {
        continue;
      }

      suggestions.push({
        userId: candidateUserId,
        name: candidate.name || candidateUserId,
        interests: candidateInterests,
        score: Number(score.toFixed(4)),
        commonInterests,
      });
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return {
    userId,
    suggestions,
  };
}

function ensureTableName() {
  if (!TABLE_NAME) {
    throw new HttpError(500, "MAIN_TABLE environment variable is not configured.");
  }
}

function normalizeStatus(status) {
  return status === "PENDING" ? "PENDING" : "ACCEPTED";
}

function userPk(userId) {
  return `USER#${userId}`;
}

function friendSk(friendId) {
  return `FRIEND#${friendId}`;
}

function getFriendId(item) {
  if (typeof item?.friendId === "string" && item.friendId) {
    return item.friendId;
  }

  if (typeof item?.SK === "string" && item.SK.startsWith("FRIEND#")) {
    return item.SK.slice("FRIEND#".length);
  }

  return "";
}

function getUserIdFromProfileItem(item) {
  if (typeof item?.userId === "string" && item.userId) {
    return item.userId;
  }

  if (typeof item?.PK === "string" && item.PK.startsWith("USER#")) {
    return item.PK.slice("USER#".length);
  }

  return "";
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];

  const deduped = new Set();
  for (const entry of value) {
    const text = String(entry || "").trim();
    if (text) deduped.add(text);
  }

  return Array.from(deduped);
}

function normalizeOptionalName(value) {
  const text = String(value || "").trim();
  return text || "";
}

function normalizeInterest(value) {
  return String(value || "").trim().toLowerCase();
}

function computeJaccard(leftInterests, rightInterests) {
  const left = new Set(leftInterests.map(normalizeInterest).filter(Boolean));
  const right = new Set(rightInterests.map(normalizeInterest).filter(Boolean));

  const union = new Set([...left, ...right]);
  if (union.size === 0) {
    return { score: 0, commonInterests: [] };
  }

  const commonInterests = Array.from(left).filter((interest) => right.has(interest)).sort();
  return {
    score: commonInterests.length / union.size,
    commonInterests,
  };
}

async function getUserProfile(userId, docClient) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: userPk(userId),
      SK: PROFILE_SK,
    },
  }));

  return result.Item || null;
}

async function getRelationship(userId, friendId, docClient) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: userPk(userId),
      SK: friendSk(friendId),
    },
  }));

  return result.Item || null;
}

async function queryRelationships(userId, docClient) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": userPk(userId),
      ":skPrefix": "FRIEND#",
    },
  }));

  return result.Items || [];
}

async function batchGetProfiles(userIds, docClient) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return {};
  }

  const profileMap = {};

  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100);
    const keys = chunk.map((friendId) => ({
      PK: userPk(friendId),
      SK: PROFILE_SK,
    }));

    const result = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: keys,
        },
      },
    }));

    for (const profile of result.Responses?.[TABLE_NAME] || []) {
      const id = getUserIdFromProfileItem(profile);
      if (id) profileMap[id] = profile;
    }
  }

  return profileMap;
}
