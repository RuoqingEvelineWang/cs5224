import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getEvents } from "./handlers/getEvents.js";
import { getEventById } from "./handlers/getEventById.js";
import { getFriends } from "./handlers/getFriends.js";
import { createEvent } from "./handlers/createEvent.js";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) return respond(401, { error: "Unauthorized" });

  const method = event.httpMethod;
  const resource = event.resource;

  try {
    // Route: GET /events
    if (method === 'GET' && resource === '/events') {
      const data = await getEvents(userId, docClient);
      return respond(200, { data, error: null });
    }

    // Route: GET /events/{id}
    if (method === 'GET' && resource === '/events/{id}') {
      const eventId = event.pathParameters.id;
      const data = await getEventById(userId, eventId, docClient);
      
      if (!data) return respond(404, { error: "Event not found or access denied" });
      return respond(200, { data, error: null });
    }

    // Route: POST /events
    if (method === 'POST' && resource === '/events') {
      const body = JSON.parse(event.body || '{}');
      const data = await createEvent(userId, body, docClient);
      return respond(201, { data, error: null });
    }

    // Route: GET /friends
    if (method === 'GET' && resource === '/friends') {
      const data = await getFriends(userId, docClient);
      return respond(200, { data, error: null });
    }

    return respond(404, { data: null, error: "Route not found" });

  } catch (error) {
    console.error("Internal Error:", error);
    return respond(500, { data: null, error: error.message });
  }
};

const respond = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*", 
  },
  body: JSON.stringify(body),
});