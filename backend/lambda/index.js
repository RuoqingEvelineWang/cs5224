const AWS = require("aws-sdk");
const { randomUUID } = require("crypto");

const ddb = new AWS.DynamoDB.DocumentClient();

const USERS_TABLE = process.env.USERS_TABLE || "Users";
const FRIENDSHIPS_TABLE = process.env.FRIENDSHIPS_TABLE || "Friendships";
const EVENTS_TABLE = process.env.EVENTS_TABLE || "Events";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
};

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

exports.handler = async (event) => {
  try {
    const method = getHttpMethod(event);
    if (method === "OPTIONS") {
      return response(200, { message: "OK" });
    }

    const authUserId = getAuthUserId(event);
    if (!authUserId) {
      throw new HttpError(401, "Unauthorized.");
    }

    const path = getPath(event);
    const resource = event?.resource || "";

    if (isEventsListRoute(method, path, resource)) {
      const events = await listEvents(authUserId);
      return response(200, events);
    }

    if (isLegacyCreateEventRoute(method, path, resource)) {
      const result = await createLegacyEvent(event, authUserId);
      return response(200, result);
    }

    if (isFriendRequestRoute(method, path, resource)) {
      const result = await sendFriendRequest(event, authUserId);
      return response(200, result);
    }

    if (isFriendAcceptRoute(method, path, resource)) {
      const result = await acceptFriendRequest(event, authUserId);
      return response(200, result);
    }

    if (isFriendSuggestionsRoute(method, path, resource)) {
      const requestedUserId = extractUserIdFromSuggestionsPath(event, path);
      assertSelfAccess(requestedUserId, authUserId);
      const result = await listFriendSuggestions(requestedUserId);
      return response(200, result);
    }

    if (isFriendListRoute(method, path, resource)) {
      const requestedUserId = extractUserIdFromFriendPath(event, path);
      assertSelfAccess(requestedUserId, authUserId);
      const result = await listFriendsByUserId(requestedUserId);
      return response(200, result);
    }

    return response(404, { message: "Not Found" });
  } catch (error) {
    if (error instanceof HttpError) {
      return response(error.statusCode, { message: error.message });
    }

    console.error("Unhandled error:", error);
    return response(500, { message: "Internal server error." });
  }
};

function getHttpMethod(event) {
  return event?.requestContext?.http?.method || event?.httpMethod || "";
}

function getPath(event) {
  return event?.rawPath || event?.path || "";
}

function getAuthUserId(event) {
  return (
    event?.requestContext?.authorizer?.jwt?.claims?.sub ||
    event?.requestContext?.authorizer?.claims?.sub ||
    null
  );
}

function isEventsListRoute(method, path, resource) {
  return method === "GET" && (resource === "/events" || path === "/events");
}

function isFriendRequestRoute(method, path, resource) {
  return method === "POST" && (resource === "/friends/request" || path === "/friends/request");
}

function isLegacyCreateEventRoute(method, path, resource) {
  return method === "POST" && (resource === "/createEvent" || path === "/createEvent");
}

function isFriendAcceptRoute(method, path, resource) {
  return method === "PUT" && (resource === "/friends/accept" || path === "/friends/accept");
}

function isFriendSuggestionsRoute(method, path, resource) {
  return (
    method === "GET" &&
    (resource === "/friends/suggestions/{userId}" || /^\/friends\/suggestions\/[^/]+$/.test(path))
  );
}

function isFriendListRoute(method, path, resource) {
  if (method !== "GET") return false;
  if (resource === "/friends/{userId}") return true;
  if (!/^\/friends\/[^/]+$/.test(path)) return false;

  const segment = path.split("/")[2];
  return segment !== "request" && segment !== "accept" && segment !== "suggestions";
}

function extractUserIdFromFriendPath(event, path) {
  if (event?.pathParameters?.userId) return event.pathParameters.userId;

  const parts = path.split("/");
  return parts[2] || "";
}

function extractUserIdFromSuggestionsPath(event, path) {
  if (event?.pathParameters?.userId) return event.pathParameters.userId;

  const parts = path.split("/");
  return parts[3] || "";
}

function assertSelfAccess(requestedUserId, authUserId) {
  if (!requestedUserId) {
    throw new HttpError(400, "Missing userId in path.");
  }
  if (requestedUserId !== authUserId) {
    throw new HttpError(403, "You can only access your own friendship data.");
  }
}

function parseJsonBody(event) {
  if (!event?.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (_error) {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

function normalizeInterest(value) {
  return String(value || "").trim().toLowerCase();
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];

  const unique = new Set();
  for (const item of value) {
    const text = String(item || "").trim();
    if (text) unique.add(text);
  }
  return Array.from(unique);
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

function nowIso() {
  return new Date().toISOString();
}

async function listEvents(userId) {
  try {
    const result = await ddb
      .query({
        TableName: EVENTS_TABLE,
        IndexName: "creatorId-createdAt-index",
        KeyConditionExpression: "creatorId = :uid",
        ExpressionAttributeValues: {
          ":uid": userId,
        },
      })
      .promise();

    return result.Items || [];
  } catch (error) {
    console.warn("Events query fallback:", error?.message || error);
    return [];
  }
}

async function createLegacyEvent(event, userId) {
  const body = parseJsonBody(event);
  const participants = Array.isArray(body.participants) ? body.participants : [];
  const createdAt = nowIso();

  await ddb
    .put({
      TableName: EVENTS_TABLE,
      Item: {
        eventId: randomUUID(),
        creatorId: userId,
        ownerId: userId,
        participants,
        createdAt,
        updatedAt: createdAt,
        status: "PLANNING",
      },
    })
    .promise();

  return { message: "Event created!" };
}

async function getUserById(userId) {
  const result = await ddb
    .get({
      TableName: USERS_TABLE,
      Key: { userId },
    })
    .promise();

  return result.Item || null;
}

async function getFriendship(userId, friendId) {
  const result = await ddb
    .get({
      TableName: FRIENDSHIPS_TABLE,
      Key: { userId, friendId },
    })
    .promise();

  return result.Item || null;
}

async function getFriendshipsForUser(userId) {
  const result = await ddb
    .query({
      TableName: FRIENDSHIPS_TABLE,
      KeyConditionExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "userId",
      },
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    })
    .promise();

  return result.Items || [];
}

async function batchGetUserProfiles(userIds) {
  if (userIds.length === 0) {
    return [];
  }

  const keys = userIds.map((userId) => ({ userId }));
  const result = await ddb
    .batchGet({
      RequestItems: {
        [USERS_TABLE]: {
          Keys: keys,
          ProjectionExpression: "userId, #name, interests",
          ExpressionAttributeNames: {
            "#name": "name",
          },
        },
      },
    })
    .promise();

  return result.Responses?.[USERS_TABLE] || [];
}

async function scanAllUsers() {
  const allUsers = [];
  let lastEvaluatedKey;

  do {
    const result = await ddb
      .scan({
        TableName: USERS_TABLE,
        ProjectionExpression: "userId, #name, interests",
        ExpressionAttributeNames: {
          "#name": "name",
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
      .promise();

    allUsers.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allUsers;
}

function computeJaccard(baseInterests, candidateInterests) {
  const baseSet = new Set(baseInterests.map(normalizeInterest).filter(Boolean));
  const candidateSet = new Set(candidateInterests.map(normalizeInterest).filter(Boolean));

  const union = new Set([...baseSet, ...candidateSet]);
  if (union.size === 0) {
    return { score: 0, commonInterests: [] };
  }

  const commonNormalized = Array.from(baseSet).filter((interest) => candidateSet.has(interest));
  const commonInterestSet = new Set(commonNormalized);

  const commonInterests = candidateInterests.filter((interest) =>
    commonInterestSet.has(normalizeInterest(interest)),
  );

  return {
    score: commonNormalized.length / union.size,
    commonInterests: toStringArray(commonInterests),
  };
}

async function sendFriendRequest(event, authUserId) {
  const body = parseJsonBody(event);
  const targetUserId = String(body.targetUserId || "").trim();

  if (!targetUserId) {
    throw new HttpError(400, "targetUserId is required.");
  }

  if (targetUserId === authUserId) {
    throw new HttpError(400, "You cannot send a friend request to yourself.");
  }

  const [requesterProfile, targetProfile] = await Promise.all([
    getUserById(authUserId),
    getUserById(targetUserId),
  ]);

  if (!requesterProfile) {
    throw new HttpError(404, "Current user profile does not exist.");
  }

  if (!targetProfile) {
    throw new HttpError(404, "Target user does not exist.");
  }

  const existing = await getFriendship(authUserId, targetUserId);
  if (existing?.status === "ACCEPTED") {
    throw new HttpError(409, "You are already friends with this user.");
  }
  if (existing?.status === "PENDING" && existing.requestedBy === authUserId) {
    throw new HttpError(409, "Friend request already sent.");
  }
  if (existing?.status === "PENDING" && existing.requestedBy === targetUserId) {
    throw new HttpError(409, "This user has already sent you a request. Please accept it.");
  }

  const createdAt = nowIso();
  const relationshipForRequester = {
    userId: authUserId,
    friendId: targetUserId,
    status: "PENDING",
    requestedBy: authUserId,
    createdAt,
    updatedAt: createdAt,
  };
  const relationshipForTarget = {
    userId: targetUserId,
    friendId: authUserId,
    status: "PENDING",
    requestedBy: authUserId,
    createdAt,
    updatedAt: createdAt,
  };

  try {
    await ddb
      .transactWrite({
        TransactItems: [
          {
            Put: {
              TableName: FRIENDSHIPS_TABLE,
              Item: relationshipForRequester,
              ConditionExpression: "attribute_not_exists(#userId) AND attribute_not_exists(#friendId)",
              ExpressionAttributeNames: {
                "#userId": "userId",
                "#friendId": "friendId",
              },
            },
          },
          {
            Put: {
              TableName: FRIENDSHIPS_TABLE,
              Item: relationshipForTarget,
              ConditionExpression: "attribute_not_exists(#userId) AND attribute_not_exists(#friendId)",
              ExpressionAttributeNames: {
                "#userId": "userId",
                "#friendId": "friendId",
              },
            },
          },
        ],
      })
      .promise();
  } catch (error) {
    if (error?.code === "ConditionalCheckFailedException") {
      throw new HttpError(409, "Friendship state changed. Please retry.");
    }
    throw error;
  }

  return {
    message: "Friend request sent.",
    targetUserId,
  };
}

async function acceptFriendRequest(event, authUserId) {
  const body = parseJsonBody(event);
  const requesterUserId = String(body.requesterUserId || "").trim();

  if (!requesterUserId) {
    throw new HttpError(400, "requesterUserId is required.");
  }

  if (requesterUserId === authUserId) {
    throw new HttpError(400, "You cannot accept your own request.");
  }

  const incoming = await getFriendship(authUserId, requesterUserId);
  if (!incoming) {
    throw new HttpError(404, "No pending request found from this user.");
  }
  if (incoming.status !== "PENDING") {
    throw new HttpError(409, "This friend request has already been processed.");
  }
  if (incoming.requestedBy !== requesterUserId) {
    throw new HttpError(403, "Only the receiver of a request can accept it.");
  }

  const outgoing = await getFriendship(requesterUserId, authUserId);
  const updatedAt = nowIso();

  await ddb
    .transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: FRIENDSHIPS_TABLE,
            Item: {
              userId: authUserId,
              friendId: requesterUserId,
              status: "ACCEPTED",
              requestedBy: requesterUserId,
              createdAt: incoming.createdAt || updatedAt,
              updatedAt,
            },
          },
        },
        {
          Put: {
            TableName: FRIENDSHIPS_TABLE,
            Item: {
              userId: requesterUserId,
              friendId: authUserId,
              status: "ACCEPTED",
              requestedBy: requesterUserId,
              createdAt: outgoing?.createdAt || incoming.createdAt || updatedAt,
              updatedAt,
            },
          },
        },
      ],
    })
    .promise();

  return {
    message: "Friend request accepted.",
    requesterUserId,
  };
}

async function listFriendsByUserId(requestedUserId) {
  const records = await getFriendshipsForUser(requestedUserId);
  const relatedUserIds = Array.from(new Set(records.map((item) => item.friendId).filter(Boolean)));
  const profiles = await batchGetUserProfiles(relatedUserIds);
  const profileById = new Map(profiles.map((profile) => [profile.userId, profile]));

  const friends = [];
  const incomingRequests = [];
  const outgoingRequests = [];

  for (const record of records) {
    const profile = profileById.get(record.friendId);
    const row = {
      userId: record.friendId,
      name: profile?.name || record.friendId,
      interests: toStringArray(profile?.interests),
      status: record.status,
      requestedBy: record.requestedBy || null,
      createdAt: record.createdAt || null,
      updatedAt: record.updatedAt || null,
    };

    if (record.status === "ACCEPTED") {
      friends.push(row);
      continue;
    }

    if (record.status === "PENDING" && record.requestedBy === requestedUserId) {
      outgoingRequests.push(row);
      continue;
    }

    if (record.status === "PENDING") {
      incomingRequests.push(row);
    }
  }

  const byName = (a, b) => a.name.localeCompare(b.name);
  friends.sort(byName);
  incomingRequests.sort(byName);
  outgoingRequests.sort(byName);

  return {
    userId: requestedUserId,
    friends,
    incomingRequests,
    outgoingRequests,
  };
}

async function listFriendSuggestions(requestedUserId) {
  const currentUser = await getUserById(requestedUserId);
  if (!currentUser) {
    throw new HttpError(404, "Current user profile does not exist.");
  }

  const currentInterests = toStringArray(currentUser.interests);
  const existingRelationships = await getFriendshipsForUser(requestedUserId);
  const excludedIds = new Set([requestedUserId]);
  for (const relationship of existingRelationships) {
    if (relationship?.friendId) {
      excludedIds.add(relationship.friendId);
    }
  }

  const allUsers = await scanAllUsers();
  const suggestions = [];

  for (const candidate of allUsers) {
    const candidateUserId = candidate?.userId;
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

  suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return {
    userId: requestedUserId,
    suggestions,
  };
}
