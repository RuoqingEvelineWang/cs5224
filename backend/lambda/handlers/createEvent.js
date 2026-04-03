import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "crypto"; // Native Node.js library for generating UUIDs

const TABLE_NAME = process.env.MAIN_TABLE;

export async function createEvent(userId, body, docClient) {
  // Generate a unique ID for the new event
  const eventId = `evt-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  // 1. Create the base METADATA item
  const metadataItem = {
    PutRequest: {
      Item: {
        PK: `EVENT#${eventId}`,
        SK: "METADATA",
        Type: "EventInfo",
        eventId: eventId,
        title: body.title,
        description: body.description || "",
        status: "COLLECTING_AVAILABILITY",
        creatorId: userId,
        venueType: body.venueType,
        dateRange: body.dateRange,
        createdAt: now
      }
    }
  };

  // 2. Create the Creator's EventMember item
  const creatorItem = {
    PutRequest: {
      Item: {
        PK: `EVENT#${eventId}`,
        SK: `USER#${userId}`,
        Type: "EventMember",
        role: "CREATOR",
        inviteStatus: "ACCEPTED", // Creator auto-accepts
        hasSubmittedAvailability: false,
        GSI1PK: `USER#${userId}`, // Populates their "MyEvents" dashboard
        GSI1SK: `EVENT#${eventId}`,
        joinedAt: now
      }
    }
  };

  // 3. Create the Invitees' EventMember items
  const inviteeItems = (body.participantIds || []).map(friendId => ({
    PutRequest: {
      Item: {
        PK: `EVENT#${eventId}`,
        SK: `USER#${friendId}`,
        Type: "EventMember",
        role: "PARTICIPANT",
        inviteStatus: "PENDING",
        hasSubmittedAvailability: false,
        GSI1PK: `USER#${friendId}`, // Populates their "Pending Invitations" dashboard
        GSI1SK: `EVENT#${eventId}`,
        invitedAt: now
      }
    }
  }));

  // Combine them all into one batch payload
  const requestItems = [metadataItem, creatorItem, ...inviteeItems];

  /* Note: DynamoDB BatchWrite limits you to 25 items per network request. 
    If you allow users to invite more than 23 friends at once, you will need 
    to chunk this array into multiple BatchWriteCommands!
  */
  await docClient.send(new BatchWriteCommand({
    RequestItems: {
      [TABLE_NAME]: requestItems
    }
  }));

  // Return the new ID so the React frontend can navigate to the workspace
  return { eventId, title: body.title, status: "COLLECTING_AVAILABILITY" };
}