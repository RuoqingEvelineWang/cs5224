import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;
const PROFILE_SK = "PROFILE";
const ONEMAP_SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search";

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function geocodePostalCode(postalCode) {
  const url = `${ONEMAP_SEARCH_URL}?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new HttpError(502, "OneMap geocoding service unavailable.");
  }

  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new HttpError(400, `No address found for postal code ${postalCode}.`);
  }

  const r = data.results[0];
  const parts = [r.BLK_NO, r.ROAD_NAME, r.BUILDING].filter(
    (p) => p && p !== "NIL" && p !== "null"
  );
  const displayAddress = parts.length > 0
    ? `${parts.join(" ")}, Singapore ${r.POSTAL}`
    : `Singapore ${r.POSTAL}`;

  return {
    address: displayAddress,
    postalCode: r.POSTAL || postalCode,
    lat: parseFloat(r.LATITUDE),
    lng: parseFloat(r.LONGITUDE),
  };
}

export { geocodePostalCode };

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
  const transportType = normalizeText(body?.transportType ?? existing?.transportType ?? "");
  const interests = normalizeInterests(body?.interests ?? existing?.interests ?? []);
  const email = normalizeEmail(
    body?.email ?? claims?.email ?? existing?.email ?? ""
  );

  const incomingPostal = normalizeText(body?.postalCode ?? "");
  const existingPostal = normalizeText(existing?.postalCode ?? "");

  let address = normalizeText(existing?.address ?? existing?.approxArea ?? "");
  let postalCode = existingPostal;
  let lat = existing?.lat ?? null;
  let lng = existing?.lng ?? null;

  if (incomingPostal && incomingPostal !== existingPostal) {
    const geo = await geocodePostalCode(incomingPostal);
    address = geo.address;
    postalCode = geo.postalCode;
    lat = geo.lat;
    lng = geo.lng;
  }

  const profileItem = {
    PK: userPk(userId),
    SK: PROFILE_SK,
    Type: "UserProfile",
    userId,
    name,
    email,
    postalCode,
    address,
    lat,
    lng,
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
    postalCode: normalizeText(item?.postalCode),
    address: normalizeText(item?.address ?? item?.approxArea),
    lat: item?.lat ?? null,
    lng: item?.lng ?? null,
    transportType: normalizeText(item?.transportType),
    interests: normalizeInterests(item?.interests),
  };
}
