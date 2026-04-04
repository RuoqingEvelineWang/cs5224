import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;
const GSI1 = process.env.MAIN_TABLE_GSI1;

export async function getEvents(userId, docClient) {
  // STEP 1: Query GSI1 to find all events this user is a part of
  const memberRes = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: GSI1,
    KeyConditionExpression: "GSI1PK = :userKey",
    ExpressionAttributeValues: {
      ":userKey": `USER#${userId}`
    }
  }));

  if (!memberRes.Items || memberRes.Items.length === 0) return [];

  // STEP 2: BatchGet the Event Metadata
  const eventKeys = memberRes.Items.map(item => ({
    PK: item.PK,
    SK: 'METADATA'
  }));

  const batchRes = await docClient.send(new BatchGetCommand({
    RequestItems: {
      [TABLE_NAME]: { Keys: eventKeys }
    }
  }));

  let eventsMetadata = batchRes.Responses[TABLE_NAME] || [];

  // STEP 3: Fetch all members for each event
  const fullEvents = await Promise.all(eventsMetadata.map(async (eventMeta) => {
    const allMembersRes = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": eventMeta.PK,
        ":skPrefix": "USER#"
      }
    }));

    const members = allMembersRes.Items || [];
    const rawEventId = eventMeta.PK.replace('EVENT#', '');
    const derivedCreatorId = eventMeta.creatorId || members.find(m => m.role === 'CREATOR')?.userId?.replace('USER#', '') || members.find(m => m.role === 'CREATOR')?.SK?.replace('USER#', '');

    return {
      eventId: rawEventId,
      title: eventMeta.title,
      status: eventMeta.status,
      creatorId: derivedCreatorId,
      venueType: eventMeta.venueType,
      dateRange: eventMeta.dateRange || { start: "", end: "" },
      selectedTime: eventMeta.selectedTime || null,
      selectedVenue: eventMeta.selectedVenue || null,

      participants: members.map(m => ({
        userId: m.userId || m.SK.replace('USER#', ''),
        role: m.role
      })),
      availabilitySubmittedBy: members
        .filter(m => m.hasSubmittedAvailability)
        .map(m => m.userId || m.SK.replace('USER#', '')),
      confirmedUserIds: members
        .filter(m => m.inviteStatus === "ACCEPTED")
        .map(m => m.userId || m.SK.replace('USER#', '')),
      declinedUserIds: members
        .filter(m => m.inviteStatus === "DECLINED")
        .map(m => m.userId || m.SK.replace('USER#', '')),
      slotCounts: computeSlotCounts(members)
    };
  }));

  // STEP 4: Gather unique User IDs to fetch their Profiles
  const uniqueUserIds = new Set();
  fullEvents.forEach(e => {
    if (e.creatorId) uniqueUserIds.add(e.creatorId);
    e.participants.forEach(p => uniqueUserIds.add(p.userId));
  });
  /* istanbul ignore next */
  if (uniqueUserIds.size === 0) return fullEvents;

  // STEP 5: BatchGet User Profiles
  // Note: DynamoDB BatchGet limits to 100 items per request. We assume <100 unique users per user's active event load here.
  const profileKeys = Array.from(uniqueUserIds).map(id => ({
    PK: `USER#${id}`,
    SK: 'PROFILE'
  }));

  const profileBatch = await docClient.send(new BatchGetCommand({
    RequestItems: {
      [TABLE_NAME]: { Keys: profileKeys }
    }
  }));

  const profiles = profileBatch.Responses[TABLE_NAME] || [];
  const userMap = {};
  profiles.forEach(p => {
    const id = p.PK.replace('USER#', '');
    userMap[id] = p.name || p.email; // Fallback to email if they haven't set a name yet
  });

  // STEP 6: Stitch names into final response
  return fullEvents.map(event => ({
    ...event,
    creatorName: userMap[event.creatorId] || 'Creator',
    participants: event.participants.map(p => ({
      ...p,
      name: userMap[p.userId] || 'Unknown User'
    }))
  }));
}

function computeSlotCounts(members) {
  const counts = {};
  for (const member of members) {
    for (const slot of (member.availableTimeSlots || [])) {
      counts[slot] = (counts[slot] || 0) + 1;
    }
  }
  return counts;
}