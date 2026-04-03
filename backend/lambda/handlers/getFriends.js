import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;
const PROFILE_SK = "PROFILE";

export async function getFriends(userId, docClient) {
  const relationshipRes = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":skPrefix": "FRIEND#"
    }
  }));

  const acceptedFriendItems = (relationshipRes.Items || []).filter(item => {
    const status = item.status || "ACCEPTED";
    return status === "ACCEPTED";
  });

  const friendIds = Array.from(
    new Set(
      acceptedFriendItems
        .map(getFriendId)
        .filter(friendId => typeof friendId === "string" && friendId.length > 0)
    )
  );
  const profileMap = await batchGetProfiles(friendIds, docClient);

  const friends = acceptedFriendItems.map(item => {
    const friendId = getFriendId(item);
    const profile = profileMap[friendId] || null;

    return {
      id: friendId,
      name: profile?.name || item.name || friendId,
      email: profile?.email || item.email || "",
      hobbies: toStringArray(profile?.interests ?? item.interests ?? item.hobbies),
    };
  });

  friends.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return friends;
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

function toStringArray(value) {
  if (!Array.isArray(value)) return [];

  const deduped = new Set();
  for (const entry of value) {
    const text = String(entry || "").trim();
    if (text) deduped.add(text);
  }

  return Array.from(deduped);
}

async function batchGetProfiles(userIds, docClient) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return {};
  }

  const profileMap = {};
  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100);
    const keys = chunk.map(friendId => ({
      PK: `USER#${friendId}`,
      SK: PROFILE_SK,
    }));

    const batchRes = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: { Keys: keys },
      },
    }));

    for (const profile of batchRes.Responses?.[TABLE_NAME] || []) {
      const friendId = profile.userId || String(profile.PK || "").replace("USER#", "");
      if (friendId) profileMap[friendId] = profile;
    }
  }

  return profileMap;
}
