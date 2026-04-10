import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;

export async function getEventById(userId, eventId, docClient) {
  // 1. Get the event and all its members in ONE query
  const res = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": `EVENT#${eventId}`
    }
  }));

  const items = res.Items || [];
  if (items.length === 0) return null;

  const eventMeta = items.find(i => i.SK === 'METADATA');
  const members = items.filter(i => i.SK.startsWith('USER#'));

  // 2. Security Check: Is the requesting user allowed to see this?
  const isMember = members.some(m => m.SK === `USER#${userId}`) || eventMeta.creatorId === userId;
  if (!isMember) return null; 

  // 3. Format the event data
  const rawEventId = eventMeta.PK.replace('EVENT#', '');
  const derivedCreatorId = eventMeta.creatorId || members.find(m => m.role === 'CREATOR')?.SK?.replace('USER#', '');

  const eventDetail = {
    eventId: rawEventId,
    title: eventMeta.title,
    status: eventMeta.status,
    creatorId: derivedCreatorId,
    venueType: eventMeta.venueType,
    dateRange: eventMeta.dateRange || { start: "", end: "" },
    selectedTime: eventMeta.selectedTime || null,
    selectedVenue: eventMeta.selectedVenue || null,
    participants: members.map(m => ({ 
      userId: m.SK.replace('USER#', ''), 
      role: m.role 
    })),
    availabilitySubmittedBy: members.filter(m => m.hasSubmittedAvailability).map(m => m.SK.replace('USER#', '')),
    confirmedUserIds: members.filter(m => m.inviteStatus === "ACCEPTED").map(m => m.SK.replace('USER#', '')),
    declinedUserIds: members.filter(m => m.inviteStatus === "DECLINED").map(m => m.SK.replace('USER#', '')),
  };

  // 4. Application-Side Join: Get User Names
  const uniqueUserIds = new Set([eventDetail.creatorId, ...eventDetail.participants.map(p => p.userId)]);
  
  const profileKeys = Array.from(uniqueUserIds).map(id => ({ PK: `USER#${id}`, SK: 'PROFILE' }));
  const profileBatch = await docClient.send(new BatchGetCommand({
    RequestItems: { [TABLE_NAME]: { Keys: profileKeys } }
  }));

  const profiles = profileBatch.Responses[TABLE_NAME] || [];
  const userMap = {};
  profiles.forEach(p => {
    userMap[p.PK.replace('USER#', '')] = p.name || p.email;
  });

  return {
    ...eventDetail,
    slotCounts: computeSlotCounts(members),
    creatorName: userMap[eventDetail.creatorId] || 'Creator',
    participants: eventDetail.participants.map(p => ({
      ...p,
      name: userMap[p.userId] || 'Unknown User'
    }))
  };
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