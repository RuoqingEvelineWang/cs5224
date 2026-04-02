import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MAIN_TABLE;
const GSI1 = process.env.MAIN_TABLE_GSI1;

export async function getEvents(userId, docClient) {
  console.log("1. Raw userId from Cognito:", userId);
  console.log("2. Querying GSI1 with:", `USER#${userId}`);
  console.log("3. GSI Name from Env Vars:", GSI1);

  // STEP 1: Query GSI1 to find all events this user is a part of
  const memberRes = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: GSI1,
    KeyConditionExpression: "GSI1PK = :userKey",
    ExpressionAttributeValues: {
      ":userKey": `USER#${userId}`
    }
  }));
  console.log("4. Items found in GSI1:", memberRes.Items?.length);

  const eventIds = memberRes.Items?.map(item => item.eventId) || [];
  if (eventIds.length === 0) return [];

  // STEP 2: BatchGet the Event Metadata for those IDs
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

  console.log("5. Keys requested:", JSON.stringify(eventKeys));
  console.log("6. Metadata returned:", JSON.stringify(eventsMetadata));

  // STEP 3: For each event, fetch ALL members to calculate slotCounts and attendance
  // Note: Using Promise.all allows these queries to run in parallel!
  const fullEvents = await Promise.all(eventsMetadata.map(async (eventMeta) => {
    
    // Fetch all members for this specific event
    const allMembersRes = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": eventMeta.PK,
        ":skPrefix": "USER#"
      }
    }));
    
    const members = allMembersRes.Items || [];

    // STEP 4: Aggregate the data as required by the Frontend (Conflicts 7 & 8)
    const rawEventId = eventMeta.PK.replace('EVENT#', '');
    
    // Safety fallback: if metadata is missing creatorId, find the member with the CREATOR role
    const derivedCreatorId = eventMeta.creatorId || members.find(m => m.role === 'CREATOR')?.userId?.replace('USER#', '');

    return {
      eventId: rawEventId,
      title: eventMeta.title,
      status: eventMeta.status,
      creatorId: derivedCreatorId, 
      venueType: eventMeta.venueType,
      dateRange: eventMeta.dateRange || { start: "", end: "" },
      selectedTime: eventMeta.selectedTime || null,
      selectedVenue: eventMeta.selectedVenue || null,
      
      // Derived Fields
      participants: members.map(m => ({ 
        userId: m.userId || m.SK.replace('USER#', ''), // Fallback for userId
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

  return fullEvents;
}

// Utility to count votes for time slots
function computeSlotCounts(members) {
  const counts = {};
  for (const member of members) {
    for (const slot of (member.availableTimeSlots || [])) {
      counts[slot] = (counts[slot] || 0) + 1;
    }
  }
  return counts;
}