import { QueryCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * GET /events/:eventId/time-recommendations
 *
 * Only callable by the event CREATOR when event status is SCHEDULING.
 *
 * Returns up to 5 time slots where >= 50% of members are available,
 * sorted by the number of available members (descending).
 *
 * Response shape:
 * {
 *   eventId,
 *   totalMembers,
 *   recommendations: [
 *     { slot: "YYYY-MM-DD-HH", count: number, percentage: number },
 *     ...
 *   ]
 * }
 */
export async function getTimeRecommendations(userId, eventId, docClient) {
  if (!TABLE_NAME) {
    throw new HttpError(500, "MAIN_TABLE environment variable is not configured.");
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

  // 2. Only available during SCHEDULING
  if (eventMeta.status !== "SCHEDULING") {
    throw new HttpError(409, `Time recommendations are only available when event status is "SCHEDULING". Current status: "${eventMeta.status}".`);
  }

  // 3. Only the creator may call this
  if (eventMeta.creatorId !== userId) {
    throw new HttpError(403, "Only the event creator can view time recommendations.");
  }

  const members = items.filter(i => i.SK.startsWith("USER#") && i.memberStatus !== "LEFT");
  const totalMembers = members.length;

  if (totalMembers === 0) {
    return { eventId, totalMembers: 0, recommendations: [] };
  }

  // 4. Aggregate slot counts across all members
  const slotCounts = {};
  for (const member of members) {
    for (const slot of (member.availableTimeSlots || [])) {
      slotCounts[slot] = (slotCounts[slot] || 0) + 1;
    }
  }

  // 5. Filter: >= 50% of members available, then take top 5 by count
  const threshold = totalMembers * 0.5;
  const recommendations = Object.entries(slotCounts)
    .filter(([, count]) => count >= threshold)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([slot, count]) => ({
      slot,
      count,
      percentage: parseFloat(((count / totalMembers) * 100).toFixed(1)),
    }));

  return {
    eventId,
    totalMembers,
    recommendations,
  };
}
