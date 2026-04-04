import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;
const PROFILE_SK = "PROFILE";

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function getMyProfile(userId, docClient) {
  ensureTableName();

  const profile = await getProfileItem(userId, docClient);
  if (!profile) {
    throw new HttpError(404, "Profile not found.");
  }

  return toUserResponse(profile);
}

export async function upsertMyProfile(userId, body, claims, docClient) {
  ensureTableName();

  const existing = await getProfileItem(userId, docClient);
  const now = new Date().toISOString();

  const name = normalizeText(body?.name ?? existing?.name ?? claims?.name ?? "");
  const address = normalizeText(body?.address ?? existing?.address ?? existing?.approxArea ?? "");
  const transportType = normalizeText(body?.transportType ?? existing?.transportType ?? "");
  const interests = normalizeInterests(body?.interests ?? existing?.interests ?? []);
  const email = normalizeEmail(
    body?.email ?? claims?.email ?? existing?.email ?? ""
  );

  const profileItem = {
    PK: userPk(userId),
    SK: PROFILE_SK,
    Type: "UserProfile",
    userId,
    name,
    email,
    address,
    // Keep legacy compatibility for any reader still expecting approxArea.
    approxArea: address,
    transportType,
    interests,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    ...(email
      ? {
          GSI2PK: `EMAIL#${email}`,
          GSI2SK: PROFILE_SK,
        }
      : {}),
  };

  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: profileItem,
  }));

  return toUserResponse(profileItem);
}

function ensureTableName() {
  if (!TABLE_NAME) {
    throw new HttpError(500, "MAIN_TABLE environment variable is not configured.");
  }
}

function userPk(userId) {
  return `USER#${userId}`;
}

async function getProfileItem(userId, docClient) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: userPk(userId),
      SK: PROFILE_SK,
    },
  }));

  return result.Item || null;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeInterests(value) {
  if (!Array.isArray(value)) return [];

  const deduped = new Set();
  for (const entry of value) {
    const text = normalizeText(entry);
    if (text) deduped.add(text);
  }

  return Array.from(deduped);
}

function toUserResponse(item) {
  return {
    userId: String(item?.userId || "").trim(),
    name: normalizeText(item?.name),
    email: normalizeText(item?.email),
    address: normalizeText(item?.address ?? item?.approxArea),
    transportType: normalizeText(item?.transportType),
    interests: normalizeInterests(item?.interests),
  };
}
