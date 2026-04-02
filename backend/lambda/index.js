import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getEvents } from "./handlers/getEvents.js";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
  // 1. Extract the userId (Cognito sub) safely
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) {
    return respond(401, { error: "Unauthorized" });
  }

  const method = event.httpMethod;
  const resource = event.resource; // e.g., "/events"

  try {
    // 2. Route the request
    if (method === 'GET' && resource === '/events') {
      const data = await getEvents(userId, docClient);
      return respond(200, { data, error: null });
    }

    // Fallback for unmatched routes
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
    "Access-Control-Allow-Origin": "*", // Required for local React dev
  },
  body: JSON.stringify(body),
});